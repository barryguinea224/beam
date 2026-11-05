-- BTH: optional airline/hotel imagery, always an existing photo of SAME trip/owner.
-- Run ONLY after review. Idempotent by column/constraint names; no Storage changes.
-- The existing cover FK references unique media(id,trip_id,user_id).
begin;
alter table public.trips
 add column if not exists airline_media_id uuid,
 add column if not exists hotel_media_id uuid;
do $constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.trips'::regclass
     and conname='trips_airline_media_same_trip_owner') then
   alter table public.trips add constraint trips_airline_media_same_trip_owner
     foreign key (airline_media_id,id,user_id)
     references public.media(id,trip_id,user_id)
     on delete set null (airline_media_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.trips'::regclass
     and conname='trips_hotel_media_same_trip_owner') then
   alter table public.trips add constraint trips_hotel_media_same_trip_owner
     foreign key (hotel_media_id,id,user_id)
     references public.media(id,trip_id,user_id)
     on delete set null (hotel_media_id);
 end if;
end $constraints$;
-- Per-column access only: existing RLS + access_until write guard remain intact.
grant update(airline_media_id,hotel_media_id) on public.trips to authenticated;
commit;
