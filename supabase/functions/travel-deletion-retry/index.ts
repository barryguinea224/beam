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

async function backgroundRun() {
  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_stale_deletions", {
    batch_size: BATCH_SIZE,
    lease_minutes: LEASE_MINUTES,
  });
  if (error) {
    console.error("retry claim failed", errorCode(error));
    return;
  }

  const work = (data || []) as Work[];
  const deadline = Date.now() + START_BUDGET_MS;
  let started = 0;
  let destructiveSucceeded = 0;
  let destructiveFailed = 0;

  for (let i = 0; i < work.length; i++) {
    const item = work[i];

    if (Date.now() >= deadline) {
      await Promise.allSettled(work.slice(i).map((pending) => release(admin, pending)));
      console.log("retry start budget reached", { claimed: work.length, started, released: work.length - i });
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
    started++;

    try {
      if (item.subject_kind === "account") await deleteAccountForUser(admin, item.user_id);
      else await deleteTripForUser(admin, item.user_id, item.subject_id);
      destructiveSucceeded++;

      // Logging is best-effort after a successful destructive operation. A logging outage
      // must never reinterpret completed deletion as deletion failure.
      const { error: logError } = await admin.rpc("record_deletion_retry_success", {
        p_subject_kind: item.subject_kind,
        p_subject_id: item.subject_id,
        p_user_id: item.user_id,
      });
      if (logError) console.error("retry success log failed", item.subject_kind, "SUCCESS_LOG_FAILED");
    } catch (e) {
      destructiveFailed++;
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
    started,
    destructiveSucceeded,
    destructiveFailed,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("METHOD_NOT_ALLOWED", { status: 405 });

  const expected = Deno.env.get("TRAVEL_RETRY_SECRET") || "";
  const supplied = req.headers.get("x-travel-retry-secret") || "";
  if (!expected || !supplied || !await sameSecret(expected, supplied)) {
    return new Response("UNAUTHORIZED", { status: 401 });
  }

  EdgeRuntime.waitUntil(backgroundRun());
  return Response.json({ accepted: true }, { status: 202 });
});
