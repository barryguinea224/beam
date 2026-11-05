-- BEAM BTH: two optional, private, same-trip media references.
-- Apply to staging first and to production BEFORE publishing the new client.
-- This migration is additive/idempotent; it never changes Storage policies.
begin;
alter table public.trips add column if not exists airline_media_id uuid;
alter table public.trips add column if not exists hotel_media_id uuid;
do $constraints$
begin
 if not exists(select 1 from pg_constraint
   where conrelid='public.trips'::regclass and conname='trips_airline_same_trip_owner') then
  alter table public.trips add constraint trips_airline_same_trip_owner
   foreign key (airline_media_id,id,user_id)
   references public.media(id,trip_id,user_id)
   on delete set null (airline_media_id);
 end if;
 if not exists(select 1 from pg_constraint
   where conrelid='public.trips'::regclass and conname='trips_hotel_same_trip_owner') then
  alter table public.trips add constraint trips_hotel_same_trip_owner
   foreign key (hotel_media_id,id,user_id)
   references public.media(id,trip_id,user_id)
   on delete set null (hotel_media_id);
 end if;
end $constraints$;
-- Preserve the existing RLS, write-expiry guard and column-only UPDATE model.
grant update(airline_media_id,hotel_media_id) on public.trips to authenticated;
commit;
