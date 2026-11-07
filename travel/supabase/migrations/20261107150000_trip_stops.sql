-- BTH trip_stops: approved route stages inside an existing journey.
-- For an EXISTING database use only this idempotent migration.
-- Does not modify trips.no_overlap, existing column grants, or the factual six-field view.
create extension if not exists btree_gist;
do $constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.trips'::regclass
    and conname='trips_id_user_id_unique') then
  alter table public.trips add constraint trips_id_user_id_unique unique(id,user_id);
 end if;
end $constraints$;

create table if not exists public.trip_stops (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null,
 user_id uuid not null default auth.uid(),
 country_code char(2) not null constraint trip_stops_country_code_valid
   check(country_code ~ '^[A-Z]{2}$'),
 cities text[] not null default '{}' constraint trip_stops_cities_limit
   check(cardinality(cities)<=10),
 entry_date date not null,
 exit_date date not null,
 position integer not null default 1 constraint trip_stops_position_positive check(position>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint trip_stops_date_order check(entry_date<=exit_date),
 constraint trip_stops_trip_owner_fk foreign key(trip_id,user_id)
   references public.trips(id,user_id) on delete cascade,
 -- Same rule as trips.no_overlap: a stage may start the day the previous one
 -- ends (leaving Germany and arriving in Belgium on the 14th); a one-day
 -- stage still blocks its whole day.
 constraint trip_stops_no_overlap exclude using gist (
   trip_id with =,
   (case when entry_date=exit_date then daterange(entry_date,entry_date,'[]')
         else daterange(entry_date,exit_date,'[)') end) with &&
 )
);
create index if not exists trip_stops_owner_trip_sort_idx
 on public.trip_stops(user_id,trip_id,position,entry_date);

-- Serialize stage quota/date validation by taking a row lock on the parent.
-- Elevated trigger needs access across RLS but is inaccessible through API.
create or replace function public.enforce_trip_stop()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
declare parent_row record; other_count integer;
begin
 select id,user_id,country_code,entry_date,exit_date,deleting
 into parent_row from public.trips
 where id=new.trip_id and user_id=new.user_id for update;
 if not found then raise exception using errcode='23503',
  message='ETAPE_VOYAGE_INTROUVABLE',detail='Voyage inconnu ou mauvais propriétaire.';end if;
 if parent_row.deleting then raise exception using errcode='23514',
  message='ETAPE_VOYAGE_EN_SUPPRESSION';end if;
 if new.country_code=parent_row.country_code then raise exception using errcode='23514',
  message='ETAPE_PAYS_IDENTIQUE_AU_VOYAGE',
  detail='Choisissez un autre pays que le pays principal du voyage.';end if;
 if new.entry_date<parent_row.entry_date or new.exit_date>parent_row.exit_date then
  raise exception using errcode='23514',message='ETAPE_HORS_DATES_VOYAGE',
  detail='Les dates de l’étape doivent rester dans celles du voyage.';end if;
 if tg_op='INSERT' or new.trip_id is distinct from old.trip_id then
  select count(*) into other_count from public.trip_stops where trip_id=new.trip_id;
  if other_count>=10 then raise exception using errcode='23514',
   message='ETAPE_LIMITE_10',detail='Un voyage ne peut pas avoir plus de dix étapes.';end if;
 end if;
 return new;
end $fn$;
revoke execute on function public.enforce_trip_stop() from public,anon,authenticated;
drop trigger if exists trip_stops_guard_before_write on public.trip_stops;
create trigger trip_stops_guard_before_write
 before insert or update of trip_id,user_id,country_code,entry_date,exit_date,position
 on public.trip_stops for each row execute function public.enforce_trip_stop();

drop trigger if exists trip_stops_touch on public.trip_stops;
create trigger trip_stops_touch before update on public.trip_stops
 for each row execute function public.touch_updated_at();

create or replace function public.enforce_trip_parent_stops()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
begin
 if exists (select 1 from public.trip_stops s where s.trip_id=new.id
    and (s.entry_date<new.entry_date or s.exit_date>new.exit_date)) then
  raise exception using errcode='23514',message='VOYAGE_DATES_INCOMPATIBLES_ETAPES',
    detail='Une étape sortirait des nouvelles dates du voyage.';
 end if;
 if exists (select 1 from public.trip_stops s where s.trip_id=new.id
    and s.country_code=new.country_code) then
  raise exception using errcode='23514',message='VOYAGE_PAYS_IDENTIQUE_A_ETAPE',
    detail='Le pays principal ne peut pas être celui d’une étape.';
 end if;
 return new;
end $fn$;
revoke execute on function public.enforce_trip_parent_stops() from public,anon,authenticated;
drop trigger if exists trips_guard_stops_before_change on public.trips;
create trigger trips_guard_stops_before_change
 before update of entry_date,exit_date,country_code on public.trips
 for each row execute function public.enforce_trip_parent_stops();

alter table public.trip_stops enable row level security;
drop policy if exists "trip stops owner select active" on public.trip_stops;
create policy "trip stops owner select active" on public.trip_stops
 for select to authenticated using
 (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())));
drop policy if exists "trip stops owner insert active" on public.trip_stops;
create policy "trip stops owner insert active" on public.trip_stops
 for insert to authenticated with check
 (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid()))
  and (select private.trip_accepts_writes(auth.uid(),trip_id)));
drop policy if exists "trip stops owner update active" on public.trip_stops;
create policy "trip stops owner update active" on public.trip_stops
 for update to authenticated
 using(user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid()))
  and (select private.trip_accepts_writes(auth.uid(),trip_id)))
 with check(user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid()))
  and (select private.trip_accepts_writes(auth.uid(),trip_id)));
drop policy if exists "trip stops owner delete active" on public.trip_stops;
create policy "trip stops owner delete active" on public.trip_stops
 for delete to authenticated using
 (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid()))
  and (select private.trip_accepts_writes(auth.uid(),trip_id)));

-- New table ONLY. Existing trips/activities grants remain byte-for-byte intact.
revoke all on public.trip_stops from public,anon,authenticated;
grant select,delete on public.trip_stops to authenticated;
grant insert(trip_id,country_code,cities,entry_date,exit_date,position)
 on public.trip_stops to authenticated;
grant update(country_code,cities,entry_date,exit_date,position)
 on public.trip_stops to authenticated;
