-- BEAM Travel History — automatic deletion retry worker.
-- CODED ONLY: do not apply to staging before PR review.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.profiles
  add column if not exists deletion_claimed_until timestamptz,
  add column if not exists deletion_attempts integer not null default 0,
  add column if not exists deletion_last_attempt_at timestamptz,
  add column if not exists deletion_last_error text;

alter table public.trips
  add column if not exists deletion_claimed_until timestamptz,
  add column if not exists deletion_attempts integer not null default 0,
  add column if not exists deletion_last_attempt_at timestamptz,
  add column if not exists deletion_last_error text;

create schema if not exists private;

create table if not exists private.deletion_retry_log (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('account','trip')),
  subject_id uuid not null,
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  error_code text,
  constraint retry_log_error_shape check (
    (success and error_code is null) or (not success and error_code is not null)
  )
);
create index if not exists deletion_retry_log_attempted_at
  on private.deletion_retry_log(attempted_at desc);

revoke all on private.deletion_retry_log from public, anon, authenticated;

-- Atomically lease stale work. Accounts have priority. Trips are claimed only when
-- their owning account is not itself being deleted.
create or replace function public.claim_stale_deletions(
  batch_size integer default 20,
  lease_minutes integer default 10
)
returns table(subject_kind text, subject_id uuid, user_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
  account_slots integer;
begin
  if batch_size < 1 or batch_size > 100 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;
  if lease_minutes < 1 or lease_minutes > 60 then
    raise exception 'INVALID_LEASE_MINUTES';
  end if;

  return query
  with candidates as (
    select p.id
    from public.profiles p
    where p.deleting
      and p.deletion_requested_at <= now() - interval '1 hour'
      and (p.deletion_claimed_until is null or p.deletion_claimed_until < now())
    order by p.deletion_requested_at, p.id
    for update skip locked
    limit batch_size
  ), claimed as (
    update public.profiles p
       set deletion_claimed_until = now() + make_interval(mins => lease_minutes),
           deletion_attempts = p.deletion_attempts + 1,
           deletion_last_attempt_at = now(),
           deletion_last_error = null
      from candidates c
     where p.id = c.id
    returning p.id
  )
  select 'account'::text, c.id, c.id from claimed c;

  get diagnostics account_slots = row_count;

  return query
  with candidates as (
    select t.id, t.user_id
    from public.trips t
    join public.profiles p on p.id = t.user_id
    where t.deleting
      and not p.deleting
      and t.deletion_requested_at <= now() - interval '1 hour'
      and (t.deletion_claimed_until is null or t.deletion_claimed_until < now())
    order by t.deletion_requested_at, t.id
    for update of t skip locked
    limit greatest(batch_size - account_slots, 0)
  ), claimed as (
    update public.trips t
       set deletion_claimed_until = now() + make_interval(mins => lease_minutes),
           deletion_attempts = t.deletion_attempts + 1,
           deletion_last_attempt_at = now(),
           deletion_last_error = null
      from candidates c
     where t.id = c.id
    returning t.id, t.user_id
  )
  select 'trip'::text, c.id, c.user_id from claimed c;
end
$$;

revoke execute on function public.claim_stale_deletions(integer,integer) from public, anon, authenticated;
grant execute on function public.claim_stale_deletions(integer,integer) to service_role;

create or replace function public.record_deletion_retry_result(
  p_subject_kind text,
  p_subject_id uuid,
  p_user_id uuid,
  p_success boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  safe_error text;
begin
  if p_subject_kind not in ('account','trip') then
    raise exception 'INVALID_SUBJECT_KIND';
  end if;

  safe_error := case
    when p_success then null
    else left(coalesce(nullif(p_error_code,''),'UNKNOWN_ERROR'), 240)
  end;

  insert into private.deletion_retry_log(subject_kind,subject_id,user_id,success,error_code)
  values(p_subject_kind,p_subject_id,p_user_id,p_success,safe_error);

  if not p_success then
    if p_subject_kind = 'account' then
      update public.profiles
         set deletion_claimed_until = null,
             deletion_last_error = safe_error
       where id = p_subject_id and deleting;
    else
      update public.trips
         set deletion_claimed_until = null,
             deletion_last_error = safe_error
       where id = p_subject_id and user_id = p_user_id and deleting;
    end if;
  end if;
end
$$;

revoke execute on function public.record_deletion_retry_result(text,uuid,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.record_deletion_retry_result(text,uuid,uuid,boolean,text)
  to service_role;

-- Monitoring query: any row returned here deserves attention.
create or replace view private.stuck_deletions as
select 'account'::text as subject_kind, p.id as subject_id, p.id as user_id,
       p.deletion_requested_at, p.deletion_attempts, p.deletion_last_attempt_at,
       p.deletion_last_error
from public.profiles p
where p.deleting and p.deletion_requested_at <= now() - interval '24 hours'
union all
select 'trip'::text, t.id, t.user_id, t.deletion_requested_at, t.deletion_attempts,
       t.deletion_last_attempt_at, t.deletion_last_error
from public.trips t
where t.deleting and t.deletion_requested_at <= now() - interval '24 hours';

revoke all on private.stuck_deletions from public, anon, authenticated;

-- Called by pg_cron. pg_net is asynchronous, so this function only dispatches.
-- The worker persists the real outcome with record_deletion_retry_result().
create or replace function private.dispatch_travel_deletion_retry()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  project_url text;
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'travel_retry_project_url';
  select decrypted_secret into worker_secret
    from vault.decrypted_secrets where name = 'travel_retry_secret';

  if project_url is null or worker_secret is null then
    raise exception 'RETRY_WORKER_VAULT_NOT_CONFIGURED';
  end if;

  select net.http_post(
    url := rtrim(project_url,'/') || '/functions/v1/travel-deletion-retry',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-travel-retry-secret',worker_secret
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end
$$;

revoke execute on function private.dispatch_travel_deletion_retry() from public, anon, authenticated;

-- Intentionally NOT scheduled by this migration.
-- After staging review, configure Vault and then install:
-- select cron.schedule(
--   'travel-deletion-retry',
--   '*/5 * * * *',
--   'select private.dispatch_travel_deletion_retry();'
-- );
