-- BTH: multi-day activities and private trip companions.
-- Replay-safe. Apply to an EXISTING project; fresh installs use schema.sql.
-- Only public.activities.duration_days and public.trips.companions are added.
alter table public.activities add column if not exists duration_days integer not null default 1;
alter table public.activities alter column duration_days set default 1;
update public.activities set duration_days=1 where duration_days is null;
alter table public.activities alter column duration_days set not null;
do $constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.activities'::regclass
   and conname='activities_duration_days_range') then
  alter table public.activities add constraint activities_duration_days_range
   check(duration_days between 1 and 30);
 end if;
end $constraints$;

alter table public.trips add column if not exists companions text;
do $constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.trips'::regclass
   and conname='trips_companions_length') then
  alter table public.trips add constraint trips_companions_length
   check(companions is null or char_length(companions) between 1 and 200);
 end if;
end $constraints$;

-- SECURITY INVOKER: only the owner can see the parent trip through existing
-- RLS. All writes remain governed by the existing active-account RLS policies.
create or replace function public.enforce_activity_duration_end()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare end_of_trip date;
begin
 if new.happened_on is null then return new; end if;
 select t.exit_date into end_of_trip from public.trips t
  where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting;
 if end_of_trip is null then
  raise exception using errcode='23514',
    message='ACTIVITY_TRIP_UNAVAILABLE',
    detail='Voyage introuvable ou indisponible pour cette activité.';
 end if;
 if new.happened_on + (new.duration_days-1) > end_of_trip then
  raise exception using errcode='23514',
    message='ACTIVITY_DURATION_EXCEEDS_TRIP',
    detail='La durée de l’activité dépasse la date de fin du voyage.';
 end if;
 return new;
end $fn$;
revoke execute on function public.enforce_activity_duration_end() from public,anon,authenticated;
drop trigger if exists activities_duration_end_before_write on public.activities;
create trigger activities_duration_end_before_write
 before insert or update of trip_id,user_id,happened_on,duration_days
 on public.activities for each row execute function public.enforce_activity_duration_end();

-- Keep an existing multi-day activity valid if the voyage end date is edited.
create or replace function public.enforce_trip_activity_duration()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if exists(select 1 from public.activities a
   where a.trip_id=new.id and a.user_id=new.user_id and a.happened_on is not null
     and a.happened_on + (a.duration_days-1) > new.exit_date) then
  raise exception using errcode='23514',
    message='TRIP_EXIT_BEFORE_ACTIVITY_END',
    detail='La nouvelle date de fin exclurait une activité de plusieurs jours.';
 end if;
 return new;
end $fn$;
revoke execute on function public.enforce_trip_activity_duration() from public,anon,authenticated;
drop trigger if exists trips_activity_duration_before_end_change on public.trips;
create trigger trips_activity_duration_before_end_change
 before update of exit_date on public.trips
 for each row execute function public.enforce_trip_activity_duration();

-- The pre-existing INSERT/UPDATE policies remain unchanged. Only these two
-- columns are explicitly granted; in particular keep trips.user_id/deleting
-- non-updatable and do not expand any other activities field.
grant insert(duration_days),update(duration_days) on public.activities to authenticated;
grant insert(companions),update(companions) on public.trips to authenticated;
revoke all on public.activities,public.trips from anon;
