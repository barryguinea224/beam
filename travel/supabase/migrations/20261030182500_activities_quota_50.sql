-- BEAM Travel History V1 · Issue #15 · maximum 50 activities per trip.
-- DRAFT — review, then apply on staging. NEVER run automatically on staging/production.
-- All statements are atomic. Existing data is checked before any schema change.
begin;
set local lock_timeout = '10s';

-- Stop concurrent activity writes during the legacy-data preflight.
-- If even one trip has 51+, refuse the entire migration; never delete memories.
lock table public.activities in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.activities a
    group by a.trip_id
    having count(*) > 50
  ) then
    raise exception using
      errcode='23514',
      message='ACTIVITY_QUOTA_ALREADY_EXCEEDED';
  end if;
end $$;

create index if not exists activities_trip_quota_idx on public.activities(trip_id);

-- Lock the PARENT trip before counting, so concurrent inserts serialize.
-- Invocations from client roles never have EXECUTE; the row trigger alone uses
-- this function. Owner/deletion checks are in the row lock and existing RLS.
create or replace function public.enforce_activity_quota()
returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare
  locked_trip uuid;
  existing_count integer;
begin
  -- Editing title/place/date/position in the same trip consumes no new slot.
  if tg_op='UPDATE' and new.trip_id=old.trip_id and new.user_id=old.user_id then
    return new;
  end if;

  select t.id into locked_trip
  from public.trips t
  where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting
  for update;

  if locked_trip is null then
    raise exception using errcode='23514',message='ACTIVITY_TRIP_UNAVAILABLE';
  end if;

  select count(*) into existing_count
  from public.activities a where a.trip_id=new.trip_id;

  if existing_count >= 50 then
    raise exception using errcode='23514',message='ACTIVITY_LIMIT_REACHED';
  end if;
  return new;
end $$;

revoke execute on function public.enforce_activity_quota()
  from public,anon,authenticated;

drop trigger if exists activities_quota_before_write on public.activities;
create trigger activities_quota_before_write
  before insert or update of trip_id,user_id on public.activities
  for each row execute function public.enforce_activity_quota();

commit;
