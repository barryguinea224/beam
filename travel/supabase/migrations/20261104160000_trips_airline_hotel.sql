-- Optional descriptive airline and lodging names on a trip.
-- Apply in staging and production BEFORE deploying the new client.
-- No scans, booking references, payment details or attachments.
-- Existing rows remain unchanged: NULL is the default.
begin;
alter table public.trips add column if not exists airline text;
alter table public.trips add column if not exists hotel text;
do $stay_constraints$
begin
 if not exists (
  select 1 from pg_constraint where conrelid='public.trips'::regclass
  and conname='trips_airline_max_length'
 ) then
  alter table public.trips add constraint trips_airline_max_length
   check(char_length(airline)<=160);
 end if;
 if not exists (
  select 1 from pg_constraint where conrelid='public.trips'::regclass
  and conname='trips_hotel_max_length'
 ) then
  alter table public.trips add constraint trips_hotel_max_length
   check(char_length(hotel)<=160);
 end if;
end $stay_constraints$;
-- Existing owner-only RLS and access_until continue to protect writes.
-- Never grant table-wide UPDATE or browser DELETE.
grant update(airline,hotel) on public.trips to authenticated;
commit;
