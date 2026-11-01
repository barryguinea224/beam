-- Incremental migration: deletion_retry_worker was already applied to staging.
-- Code review required. NOT applied to staging yet. No cron scheduled.
-- Service-role-only monitor counter: FAILED receipts finished in the last 24 hours.
-- Operational errors are not exposed to anon/authenticated users.
create index if not exists deletion_retry_runs_failed_finished_at
  on private.deletion_retry_runs(finished_at desc) where status='failed';
create or replace function public.count_failed_deletion_retry_runs_24h() returns bigint
language sql stable security definer set search_path='' as
'select count(*) from private.deletion_retry_runs
 where status = ''failed'' and finished_at >= now() - interval ''24 hours''';
revoke execute on function public.count_failed_deletion_retry_runs_24h() from public,anon,authenticated;
grant execute on function public.count_failed_deletion_retry_runs_24h() to service_role;
