import {
  adminClient,
  deleteAccountForUser,
  deleteTripForUser,
} from "../_shared/travel-deletion.ts";
import {
  errorCode,
  trackedRun,
  type Work,
  type WorkerDependencies,
} from "../_shared/travel-retry-runner.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BATCH_SIZE = 5;
const LEASE_MINUTES = 10;

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

// Production adapter. Only this file knows the Supabase RPCs and deletion engine.
function dependencies(admin: ReturnType<typeof adminClient>): WorkerDependencies {
  return {
    now: () => Date.now(),
    log: console,
    db: {
      async claim() {
        const { data, error } = await admin.rpc("claim_stale_deletions", {
          batch_size: BATCH_SIZE, lease_minutes: LEASE_MINUTES,
        });
        if (error) throw new Error("RETRY_CLAIM_FAILED");
        return (data || []) as Work[];
      },
      async start(item) {
        const { data, error } = await admin.rpc("start_deletion_retry", {
          p_subject_kind: item.subject_kind,
          p_subject_id: item.subject_id,
          p_user_id: item.user_id,
          p_claim_token: item.claim_token,
        });
        if (error) throw new Error("START_FAILED");
        return data === true;
      },
      async release(item) {
        const { data, error } = await admin.rpc("release_unstarted_deletion_claim", {
          p_subject_kind: item.subject_kind,
          p_subject_id: item.subject_id,
          p_user_id: item.user_id,
          p_claim_token: item.claim_token,
        });
        // A false return is also failure: the claim was NOT confirmed released.
        if (error || data !== true) throw new Error("RELEASE_FAILED");
      },
      async recordSuccess(item) {
        const { error } = await admin.rpc("record_deletion_retry_success", {
          p_subject_kind: item.subject_kind,
          p_subject_id: item.subject_id,
          p_user_id: item.user_id,
        });
        if (error) throw new Error("SUCCESS_LOG_FAILED");
      },
      async recordFailure(item, code) {
        const { error } = await admin.rpc("record_deletion_retry_failure", {
          p_subject_kind: item.subject_kind,
          p_subject_id: item.subject_id,
          p_user_id: item.user_id,
          p_claim_token: item.claim_token,
          p_error_code: code,
        });
        if (error) throw new Error("FAILURE_STATE_WRITE_FAILED");
      },
      async finish(runId, counts, failure) {
        const { data, error } = await admin.rpc("finish_deletion_retry_run", {
          p_run_id: runId,
          p_claimed: counts.claimed,
          p_started: counts.started,
          p_succeeded: counts.destructiveSucceeded,
          p_failed: counts.destructiveFailed,
          p_error_code: failure,
        });
        if (error || data !== true) throw new Error("RECEIPT_WRITE_FAILED");
      },
    },
    deletion: {
      async account(userId) { await deleteAccountForUser(admin, userId); },
      async trip(userId, tripId) { await deleteTripForUser(admin, userId, tripId); },
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("METHOD_NOT_ALLOWED", { status: 405 });

  const expected = Deno.env.get("TRAVEL_RETRY_SECRET") || "";
  const supplied = req.headers.get("x-travel-retry-secret") || "";
  if (!expected || !supplied || !await sameSecret(expected, supplied)) {
    return new Response("UNAUTHORIZED", { status: 401 });
  }

  // The 202 acknowledges a durable receipt, not deletion success.
  try {
    const admin = adminClient();
    const runId = crypto.randomUUID();
    const { error } = await admin.rpc("begin_deletion_retry_run", { p_run_id: runId });
    if (error) throw new Error("RETRY_RUN_CREATE_FAILED");
    EdgeRuntime.waitUntil(
      trackedRun(dependencies(admin), runId).catch((e: unknown) => {
        console.error("unexpected tracked retry failure", errorCode(e));
        // An interrupted/failed final write leaves a RUNNING receipt for monitoring.
      }),
    );
    return Response.json({ accepted: true, run_id: runId }, { status: 202 });
  } catch (e) {
    console.error("retry dispatch failed", errorCode(e));
    return Response.json({ error: "RETRY_DISPATCH_UNAVAILABLE" }, { status: 503 });
  }
});
