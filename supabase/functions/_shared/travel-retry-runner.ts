// Pure retry-decision engine: no Supabase SDK, clock or network dependency.
// The Edge Function injects real RPCs and deletion functions; Deno tests inject fakes.
export type Work = {
  subject_kind: "account" | "trip";
  subject_id: string;
  user_id: string;
  claim_token: string;
};
export type RunCounts = {
  claimed: number;
  started: number;
  destructiveSucceeded: number;
  destructiveFailed: number;
};
export type WorkerDependencies = {
  now: () => number;
  db: {
    claim: () => Promise<Work[]>;
    start: (item: Work) => Promise<boolean>;
    release: (item: Work) => Promise<void>;
    recordSuccess: (item: Work) => Promise<void>;
    recordFailure: (item: Work, code: string) => Promise<void>;
    finish: (runId: string, counts: RunCounts, failure: string | null) => Promise<void>;
  };
  deletion: {
    account: (userId: string) => Promise<void>;
    trip: (userId: string, tripId: string) => Promise<void>;
  };
  log: Pick<Console, "log" | "error">;
};
export const START_BUDGET_MS = 90_000;
export function errorCode(e: unknown): string {
  const raw = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  return raw.split(":")[0].replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNKNOWN_ERROR";
}
export async function backgroundRun(deps: WorkerDependencies, counts: RunCounts): Promise<void> {
  const work = await deps.db.claim();
  counts.claimed = work.length;
  // Budget limits new starts only, not an already-started deletion.
  const deadline = deps.now() + START_BUDGET_MS;
  for (let i = 0; i < work.length; i++) {
    const item = work[i];
    if (deps.now() >= deadline) {
      // Attempt ALL releases even if one of them fails.
      const pending = work.slice(i);
      const releases = await Promise.allSettled(pending.map((w) => deps.db.release(w)));
      const failed = releases.filter((r) => r.status === "rejected").length;
      deps.log.log("retry start budget reached", {
        claimed: work.length, started: counts.started,
        released: pending.length - failed, releaseFailed: failed,
      });
      // Unconfirmed releases make the receipt FAILED rather than COMPLETED.
      if (failed) throw new Error("RELEASE_FAILED");
      break;
    }
    let started = false;
    try {
      started = await deps.db.start(item);
    } catch {
      deps.log.error("retry start refused", item.subject_kind, "START_FAILED");
      continue;
    }
    if (!started) {
      deps.log.error("retry start refused", item.subject_kind, "LEASE_LOST");
      continue;
    }
    counts.started++;
    try {
      if (item.subject_kind === "account") await deps.deletion.account(item.user_id);
      else await deps.deletion.trip(item.user_id, item.subject_id);
      counts.destructiveSucceeded++;
    } catch (e) {
      counts.destructiveFailed++;
      const code = errorCode(e);
      try {
        await deps.db.recordFailure(item, code);
        deps.log.error("retry destructive operation failed", item.subject_kind, code);
      } catch {
        deps.log.error("retry failure state could not be persisted", item.subject_kind, "FAILURE_STATE_WRITE_FAILED");
      }
      continue;
    }
    // Reporting outage never reclassifies a successful destructive operation.
    try {
      await deps.db.recordSuccess(item);
    } catch {
      deps.log.error("retry success log failed", item.subject_kind, "SUCCESS_LOG_FAILED");
    }
  }
  deps.log.log("travel deletion retry background run finished", { ...counts });
}
// A failed release yields a FAILED durable receipt with RELEASE_FAILED.
// A runtime crash may still leave a RUNNING receipt for monitoring.
export async function trackedRun(deps: WorkerDependencies, runId: string): Promise<{
  counts: RunCounts;
  failure: string | null;
}> {
  const counts: RunCounts = { claimed: 0, started: 0, destructiveSucceeded: 0, destructiveFailed: 0 };
  let failure: string | null = null;
  try {
    await backgroundRun(deps, counts);
  } catch (e) {
    failure = errorCode(e);
    deps.log.error("travel deletion retry background run failed", failure);
  }
  try {
    await deps.db.finish(runId, counts, failure);
  } catch {
    deps.log.error("retry completion receipt could not be persisted");
  }
  return { counts, failure };
}
