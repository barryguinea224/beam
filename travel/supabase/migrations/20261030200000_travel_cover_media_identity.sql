-- BEAM Travel History · issue #17 · cover photo identity (review before staging).
-- Only metadata; existing private media objects and voyages are untouched.
-- A cover must be an existing media row from exactly the SAME trip and owner.
-- ON DELETE SET NULL (cover_media_id) clears ONLY the cover, never the trip owner.
begin;
set local lock_timeout = '10s';

-- Stop if this schema was already modified outside the reviewed migration.
do $$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='trips' and column_name='cover_media_id'
  ) then
    raise exception using errcode='23514',message='COVER_COLUMN_ALREADY_PRESENT';
  end if;
end $$;

alter table public.trips
  add column cover_media_id uuid;

-- Composite identity ensures the referenced photo is in THIS trip, for THIS
-- user. The media primary key alone would NOT enforce these two properties.
alter table public.media
  add constraint media_cover_identity unique (id,trip_id,user_id);

alter table public.trips
  add constraint trips_cover_same_trip_owner
  foreign key (cover_media_id,id,user_id)
  references public.media (id,trip_id,user_id)
  on delete set null (cover_media_id);

-- Current web role may edit only explicitly granted trip columns.
-- This adds ONLY the new cover id; user_id/trip id/deleting remain protected.
grant update(cover_media_id) on public.trips to authenticated;

commit;
