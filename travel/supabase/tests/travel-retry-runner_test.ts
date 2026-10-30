import {
  START_BUDGET_MS,
  trackedRun,
  type RunCounts,
  type Work,
  type WorkerDependencies,
} from "../../../supabase/functions/_shared/travel-retry-runner.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(actual: unknown, expected: unknown, label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
type Receipt = { runId: string; counts: RunCounts; error: string | null };
function fixture(failsRelease?: string) {
  const works: Work[] = Array.from({ length: 5 }, (_, i) => ({
    subject_kind: "trip", subject_id: "trip-" + (i + 1),
    user_id: "disposable-user", claim_token: "token-" + (i + 1),
  }));
  let now = 1_000;
  const calls = {
    started: [] as string[], released: [] as string[], removed: [] as string[],
    success: [] as string[], failed: [] as string[], receipts: [] as Receipt[],
  };
  const deps: WorkerDependencies = {
    now: () => now,
    log: { log: () => {}, error: () => {} },
    db: {
      claim: async () => works,
      start: async (w) => { calls.started.push(w.subject_id); return true; },
      release: async (w) => {
        calls.released.push(w.subject_id);
        if (w.subject_id === failsRelease) throw new Error("SIMULATED_RELEASE_OUTAGE");
      },
      recordSuccess: async (w) => { calls.success.push(w.subject_id); },
      recordFailure: async (w) => { calls.failed.push(w.subject_id); },
      finish: async (runId, counts, error) => {
        calls.receipts.push({ runId, counts: { ...counts }, error });
      },
    },
    deletion: {
      account: async () => { throw new Error("Unexpected account deletion"); },
      trip: async (_userId, tripId) => {
        calls.removed.push(tripId);
        // First deletion starts before 90s and finishes at the exact boundary.
        now = 1_000 + START_BUDGET_MS;
      },
    },
  };
  return { deps, calls };
}

Deno.test("90s budget: four unstarted claims released, no attempts, completed receipt", async () => {
  const { deps, calls } = fixture();
  const result = await trackedRun(deps, "run-ok");
  same(calls.started, ["trip-1"], "only one attempt started");
  same(calls.removed, ["trip-1"], "only first deletion executed");
  same(calls.released, ["trip-2", "trip-3", "trip-4", "trip-5"], "remaining claims released");
  same(calls.success, ["trip-1"], "successful deletion logged once");
  same(calls.failed, [], "no destructive failures");
  same(result.counts, { claimed: 5, started: 1, destructiveSucceeded: 1, destructiveFailed: 0 }, "counts");
  same(result.failure, null, "successful outcome");
  same(calls.receipts, [{ runId: "run-ok", counts: result.counts, error: null }], "completed receipt");
  assert(calls.started.length === 1, "unstarted items consumed no attempts");
});

Deno.test("90s budget: failing release still tries all releases and fails receipt", async () => {
  const { deps, calls } = fixture("trip-3");
  const result = await trackedRun(deps, "run-failed");
  same(calls.started, ["trip-1"], "only one attempt started");
  same(calls.released, ["trip-2", "trip-3", "trip-4", "trip-5"], "all releases attempted");
  same(calls.removed, ["trip-1"], "no unexpected deletion");
  same(result.counts, { claimed: 5, started: 1, destructiveSucceeded: 1, destructiveFailed: 0 }, "counts");
  same(result.failure, "RELEASE_FAILED", "failure code");
  same(calls.receipts, [{ runId: "run-failed", counts: result.counts, error: "RELEASE_FAILED" }], "failed receipt");
  assert(calls.started.length === 1, "unstarted claims consumed no attempts");
});
