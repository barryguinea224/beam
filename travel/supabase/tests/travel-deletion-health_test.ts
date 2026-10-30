import { deletionHealth } from "../../../supabase/functions/_shared/travel-deletion-health.ts";
function check(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(label + " expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
}
Deno.test("monitor healthy when all counters are zero", () => {
  check(deletionHealth({ stuck: 0, stale_runs: 0, failed_runs_24h: 0 }),
    { ok: true, stuck: 0, stale_runs: 0, failed_runs_24h: 0 }, "healthy");
});
Deno.test("recent failed run makes monitor unhealthy", () => {
  check(deletionHealth({ stuck: 0, stale_runs: 0, failed_runs_24h: 1 }).ok, false, "failed");
});
Deno.test("stale running receipt makes monitor unhealthy", () => {
  check(deletionHealth({ stuck: 0, stale_runs: 1, failed_runs_24h: 0 }).ok, false, "stale");
});
Deno.test("stuck deletion makes monitor unhealthy", () => {
  check(deletionHealth({ stuck: 1, stale_runs: 0, failed_runs_24h: 0 }).ok, false, "stuck");
});
