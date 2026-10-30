// Pure health decision: no credentials, network, or Supabase dependency.
export type HealthCounts = {
  stuck: number;
  stale_runs: number;
  failed_runs_24h: number;
};
export function deletionHealth(counts: HealthCounts): HealthCounts & { ok: boolean } {
  return {
    ok: counts.stuck === 0 && counts.stale_runs === 0 && counts.failed_runs_24h === 0,
    ...counts,
  };
}
