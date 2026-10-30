import {
  adminClient,
  deleteAccountForUser,
  deleteTripForUser,
} from "../_shared/travel-deletion.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type Work = {
  subject_kind: "account" | "trip";
  subject_id: string;
  user_id: string;
  claim_token: string;
};

const BATCH_SIZE = 5;
const LEASE_MINUTES = 10;
const START_BUDGET_MS = 90_000;

type RunCounts = {
  claimed: number;
  started: number;
  destructiveSucceeded: number;
  destructiveFailed: number;
};


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

function errorCode(e: unknown): string {
  const raw = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  return raw.split(":")[0].replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNKNOWN_ERROR";
}

async function release(admin: ReturnType<typeof adminClient>, item: Work) {
  const { error } = await admin.rpc("release_unstarted_deletion_claim", {
    p_subject_kind: item.subject_kind,
    p_subject_id: item.subject_id,
    p_user_id: item.user_id,
    p_claim_token: item.claim_token,
  });
  if (error) console.error("retry release failed", item.subject_kind, "RELEASE_FAILED");
}

async function backgroundRun(admin: ReturnType<typeof adminClient>, counts: RunCounts) {
  const { data, error } = await admin.rpc("claim_stale_deletions", {
    batch_size: BATCH_SIZE,
    lease_minutes: LEASE_MINUTES,
  });
  if (error) throw new Error("RETRY_CLAIM_FAILED");

  const work = (data || []) as Work[];
  counts.claimed = work.length;
  const deadline = Date.now() + START_BUDGET_MS;
  // Progress is held in one object so unexpected errors also get honest run counts.
  for (let i = 0; i < work.length; i++) {
    const item = work[i];

    if (Date.now() >= deadline) {
      await Promise.allSettled(work.slice(i).map((pending) => release(admin, pending)));
      console.log("retry start budget reached", { claimed: work.length, started: counts.started, released: work.length - i });
      break;
    }

    const { data: didStart, error: startError } = await admin.rpc("start_deletion_retry", {
      p_subject_kind: item.subject_kind,
      p_subject_id: item.subject_id,
      p_user_id: item.user_id,
      p_claim_token: item.claim_token,
    });
    if (startError || didStart !== true) {
      console.error("retry start refused", item.subject_kind, startError ? "START_FAILED" : "LEASE_LOST");
      continue;
    }
    counts.started++;

    try {
      if (item.subject_kind === "account") await deleteAccountForUser(admin, item.user_id);
      else await deleteTripForUser(admin, item.user_id, item.subject_id);
      counts.destructiveSucceeded++;

      // Logging is best-effort after a successful destructive operation. A logging outage
      // must never reinterpret completed deletion as deletion failure.
      const { error: logError } = await admin.rpc("record_deletion_retry_success", {
        p_subject_kind: item.subject_kind,
        p_subject_id: item.subject_id,
        p_user_id: item.user_id,
      });
      if (logError) console.error("retry success log failed", item.subject_kind, "SUCCESS_LOG_FAILED");
    } catch (e) {
      counts.destructiveFailed++;
      const code = errorCode(e);
      const { error: recordError } = await admin.rpc("record_deletion_retry_failure", {
        p_subject_kind: item.subject_kind,
        p_subject_id: item.subject_id,
        p_user_id: item.user_id,
        p_claim_token: item.claim_token,
        p_error_code: code,
      });
      if (recordError) console.error("retry failure state could not be persisted", item.subject_kind, "FAILURE_STATE_WRITE_FAILED");
      else console.error("retry destructive operation failed", item.subject_kind, code);
    }
  }

  console.log("travel deletion retry background run finished", {
    claimed: work.length,
    started: counts.started,
    destructiveSucceeded: counts.destructiveSucceeded,
    destructiveFailed: counts.destructiveFailed,
  });
}

// The completed receipt is committed only after all destructive work has settled.
async function trackedRun(admin: ReturnType<typeof adminClient>, runId: string) {
  const counts: RunCounts = { claimed: 0, started: 0, destructiveSucceeded: 0, destructiveFailed: 0 };
  let failure: string | null = null;
  try {
    await backgroundRun(admin, counts);
  } catch (e) {
    failure = errorCode(e);
    console.error("travel deletion retry background run failed", failure);
  }
  try {
    const { data, error } = await admin.rpc("finish_deletion_retry_run", {
      p_run_id: runId,
      p_claimed: counts.claimed,
      p_started: counts.started,
      p_succeeded: counts.destructiveSucceeded,
      p_failed: counts.destructiveFailed,
      p_error_code: failure,
    });
    if (error || data !== true) console.error("retry completion receipt could not be persisted");
  } catch {
    console.error("retry completion receipt write failed");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("METHOD_NOT_ALLOWED", { status: 405 });

  const expected = Deno.env.get("TRAVEL_RETRY_SECRET") || "";
  const supplied = req.headers.get("x-travel-retry-secret") || "";
  if (!expected || !supplied || !await sameSecret(expected, supplied)) {
    return new Response("UNAUTHORIZED", { status: 401 });
  }

  // The 202 is an acknowledgement of a durable receipt, not of deletion success.
  // Missing/invalid configuration must fail here, rather than returning a false 202.
  try {
    const admin = adminClient();
    const runId = crypto.randomUUID();
    const { error } = await admin.rpc("begin_deletion_retry_run", { p_run_id: runId });
    if (error) throw new Error("RETRY_RUN_CREATE_FAILED");
    EdgeRuntime.waitUntil(
      trackedRun(admin, runId).catch((e: unknown) => {
        console.error("unexpected tracked retry failure", errorCode(e));
        // The durable receipt remains running; the staging bench must fail closed.
      }),
    );
    return Response.json({ accepted: true, run_id: runId }, { status: 202 });
  } catch (e) {
    console.error("retry dispatch failed", errorCode(e));
    return Response.json({ error: "RETRY_DISPATCH_UNAVAILABLE" }, { status: 503 });
  }
});
