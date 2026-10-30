-- BEAM Travel History — automatic deletion retry worker.
-- CODED ONLY: do not apply to staging before PR review.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.profiles
  add column if not exists deletion_claimed_until timestamptz,
  add column if not exists deletion_claim_token uuid,
  add column if not exists deletion_attempts integer not null default 0,
  add column if not exists deletion_last_attempt_at timestamptz,
  add column if not exists deletion_last_error text;

alter table public.trips
  add column if not exists deletion_claimed_until timestamptz,
  add column if not exists deletion_claim_token uuid,
  add column if not exists deletion_attempts integer not null default 0,
  add column if not exists deletion_last_attempt_at timestamptz,
  add column if not exists deletion_last_error text;

-- Repair legacy/incomplete locked rows before enforcing the invariant.
update public.profiles set deletion_requested_at=coalesce(deletion_last_attempt_at,updated_at,created_at,now())
where deleting and deletion_requested_at is null;
update public.trips set deletion_requested_at=coalesce(deletion_last_attempt_at,updated_at,created_at,now())
where deleting and deletion_requested_at is null;

alter table public.profiles drop constraint if exists profiles_deletion_timestamp_required;
alter table public.profiles add constraint profiles_deletion_timestamp_required
  check (not deleting or deletion_requested_at is not null);
alter table public.trips drop constraint if exists trips_deletion_timestamp_required;
alter table public.trips add constraint trips_deletion_timestamp_required
  check (not deleting or deletion_requested_at is not null);

create schema if not exists private;

create table if not exists private.deletion_retry_log (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('account','trip')),
  subject_id uuid not null,
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  error_code text,
  constraint retry_log_error_shape check ((success and error_code is null) or (not success and error_code is not null))
);
create index if not exists deletion_retry_log_attempted_at on private.deletion_retry_log(attempted_at desc);
revoke all on private.deletion_retry_log from public,anon,authenticated;

-- Retry delay after a real failed attempt: 10m,20m,40m,80m,160m,320m, then 6h cap.
create or replace function private.retry_delay(attempts integer) returns interval
language sql immutable set search_path='' as $$
  select make_interval(secs => least(21600, 600 * (2 ^ greatest(attempts - 1,0))::integer))
$$;
revoke execute on function private.retry_delay(integer) from public,anon,authenticated;

create or replace function public.claim_stale_deletions(batch_size integer default 5, lease_minutes integer default 10)
returns table(subject_kind text,subject_id uuid,user_id uuid,claim_token uuid)
language plpgsql security definer set search_path='' as $$
declare account_slots integer;
begin
  if batch_size < 1 or batch_size > 5 then raise exception 'INVALID_BATCH_SIZE'; end if;
  if lease_minutes < 1 or lease_minutes > 30 then raise exception 'INVALID_LEASE_MINUTES'; end if;

  return query
  with candidates as (
    select p.id
    from public.profiles p
    where p.deleting and p.deletion_requested_at is not null and p.deletion_attempts < 12
      and p.deletion_requested_at <= now()-interval '1 hour'
      and (p.deletion_last_attempt_at is null or p.deletion_last_attempt_at + private.retry_delay(p.deletion_attempts) <= now())
      and (p.deletion_claimed_until is null or p.deletion_claimed_until < now())
    order by p.deletion_requested_at,p.id for update skip locked limit batch_size
  ), claimed as (
    update public.profiles p set
      deletion_claimed_until=now()+make_interval(mins=>lease_minutes),
      deletion_claim_token=gen_random_uuid(),
      deletion_attempts=p.deletion_attempts+1,
      deletion_last_attempt_at=now(),
      deletion_last_error=null
    from candidates c where p.id=c.id
    returning p.id,p.deletion_claim_token
  )
  select 'account'::text,c.id,c.id,c.deletion_claim_token from claimed c;
  get diagnostics account_slots=row_count;

  return query
  with candidates as (
    select t.id,t.user_id
    from public.trips t join public.profiles p on p.id=t.user_id
    where t.deleting and t.deletion_requested_at is not null and t.deletion_attempts < 12 and not p.deleting
      and t.deletion_requested_at <= now()-interval '1 hour'
      and (t.deletion_last_attempt_at is null or t.deletion_last_attempt_at + private.retry_delay(t.deletion_attempts) <= now())
      and (t.deletion_claimed_until is null or t.deletion_claimed_until < now())
    order by t.deletion_requested_at,t.id for update of t skip locked
    limit greatest(batch_size-account_slots,0)
  ), claimed as (
    update public.trips t set
      deletion_claimed_until=now()+make_interval(mins=>lease_minutes),
      deletion_claim_token=gen_random_uuid(),
      deletion_attempts=t.deletion_attempts+1,
      deletion_last_attempt_at=now(),
      deletion_last_error=null
    from candidates c where t.id=c.id
    returning t.id,t.user_id,t.deletion_claim_token
  )
  select 'trip'::text,c.id,c.user_id,c.deletion_claim_token from claimed c;
end $$;
revoke execute on function public.claim_stale_deletions(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_stale_deletions(integer,integer) to service_role;

-- Release work that was leased but never started. Token matching prevents an old worker
-- from releasing a lease subsequently acquired by another invocation.
create or replace function public.release_unstarted_deletion_claim(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid,p_claim_token uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_subject_kind='account' then
    update public.profiles set
      deletion_claimed_until=null,deletion_claim_token=null,
      deletion_attempts=greatest(deletion_attempts-1,0),deletion_last_attempt_at=null
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  elsif p_subject_kind='trip' then
    update public.trips set
      deletion_claimed_until=null,deletion_claim_token=null,
      deletion_attempts=greatest(deletion_attempts-1,0),deletion_last_attempt_at=null
    where id=p_subject_id and user_id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  else raise exception 'INVALID_SUBJECT_KIND';
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke execute on function public.release_unstarted_deletion_claim(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_unstarted_deletion_claim(text,uuid,uuid,uuid) to service_role;

-- This records the outcome of the destructive operation. Logging failure is not allowed
-- to reinterpret a successful deletion as a destructive failure.
create or replace function public.record_deletion_retry_failure(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid,p_claim_token uuid,p_error_code text
) returns boolean language plpgsql security definer set search_path='' as $$
declare safe_error text; changed integer;
begin
  safe_error:=left(coalesce(nullif(p_error_code,''),'UNKNOWN_ERROR'),240);
  if p_subject_kind='account' then
    update public.profiles set deletion_claimed_until=null,deletion_claim_token=null,deletion_last_error=safe_error
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  elsif p_subject_kind='trip' then
    update public.trips set deletion_claimed_until=null,deletion_claim_token=null,deletion_last_error=safe_error
    where id=p_subject_id and user_id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  else raise exception 'INVALID_SUBJECT_KIND';
  end if;
  get diagnostics changed=row_count;
  if changed=1 then
    insert into private.deletion_retry_log(subject_kind,subject_id,user_id,success,error_code)
    values(p_subject_kind,p_subject_id,p_user_id,false,safe_error);
  end if;
  return changed=1;
end $$;
revoke execute on function public.record_deletion_retry_failure(text,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_deletion_retry_failure(text,uuid,uuid,uuid,text) to service_role;

create or replace function public.record_deletion_retry_success(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_subject_kind not in ('account','trip') then raise exception 'INVALID_SUBJECT_KIND'; end if;
  insert into private.deletion_retry_log(subject_kind,subject_id,user_id,success,error_code)
  values(p_subject_kind,p_subject_id,p_user_id,true,null);
end $$;
revoke execute on function public.record_deletion_retry_success(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_deletion_retry_success(text,uuid,uuid) to service_role;

create or replace view private.stuck_deletions as
select 'account'::text subject_kind,p.id subject_id,p.id user_id,p.deletion_requested_at,
 p.deletion_attempts,p.deletion_last_attempt_at,p.deletion_last_error
from public.profiles p where p.deleting and
 (p.deletion_requested_at is null or p.deletion_attempts>=12 or p.deletion_requested_at<=now()-interval '24 hours')
union all
select 'trip'::text,t.id,t.user_id,t.deletion_requested_at,t.deletion_attempts,t.deletion_last_attempt_at,t.deletion_last_error
from public.trips t where t.deleting and
 (t.deletion_requested_at is null or t.deletion_attempts>=12 or t.deletion_requested_at<=now()-interval '24 hours');
revoke all on private.stuck_deletions from public,anon,authenticated;

create or replace function public.count_stuck_deletions() returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from private.stuck_deletions
$$;
revoke execute on function public.count_stuck_deletions() from public,anon,authenticated;
grant execute on function public.count_stuck_deletions() to service_role;

create or replace function private.dispatch_travel_deletion_retry() returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; worker_secret text; request_id bigint;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='travel_retry_project_url';
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='travel_retry_secret';
 if project_url is null or worker_secret is null then raise exception 'RETRY_WORKER_VAULT_NOT_CONFIGURED'; end if;
 select net.http_post(
  url:=rtrim(project_url,'/')||'/functions/v1/travel-deletion-retry',
  headers:=jsonb_build_object('Content-Type','application/json','x-travel-retry-secret',worker_secret),
  body:='{"source":"pg_cron"}'::jsonb,timeout_milliseconds:=5000
 ) into request_id;
 return request_id;
end $$;
revoke execute on function private.dispatch_travel_deletion_retry() from public,anon,authenticated;

-- Intentionally NOT scheduled by this migration.
