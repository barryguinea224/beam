-- J'y étais · P0 album: reuse trips.cover_media_id and its existing composite FK.
-- No photo copies, no changes to 15-photo quota or factual PDF view.
-- Run in staging first. Additive and safe to replay.
begin;
set local lock_timeout='10s';

alter table public.trips add column if not exists title text;
do $guard$
begin
 if not exists(select 1 from pg_constraint
   where conrelid='public.trips'::regclass and conname='trips_album_title_length') then
  alter table public.trips add constraint trips_album_title_length
   check(title is null or char_length(title)<=60);
 end if;
end $guard$;

alter table public.media add column if not exists activity_id uuid;
create index if not exists media_activity_id_idx
 on public.media(activity_id) where activity_id is not null;

do $guard$
begin
 if not exists(select 1 from pg_constraint
   where conrelid='public.activities'::regclass
    and conname='activities_album_identity_unique') then
  alter table public.activities add constraint activities_album_identity_unique
   unique(id,trip_id,user_id);
 end if;
 if not exists(select 1 from pg_constraint
   where conrelid='public.media'::regclass
    and conname='media_album_activity_identity_fk') then
  alter table public.media add constraint media_album_activity_identity_fk
   foreign key(activity_id,trip_id,user_id)
   references public.activities(id,trip_id,user_id)
   on delete set null(activity_id);
 end if;
end $guard$;

-- A trigger makes the cross-trip/owner policy explicit. The composite FK
-- independently enforces the same invariant, even under concurrent writes.
create or replace function public.check_media_album_activity()
returns trigger language plpgsql security invoker set search_path='' as $body$
begin
 if new.activity_id is not null and not exists (
  select 1 from public.activities a
  where a.id=new.activity_id and a.trip_id=new.trip_id
    and a.user_id=new.user_id
 ) then
  raise exception using errcode='23514',message='PHOTO_ACTIVITY_TRIP_MISMATCH';
 end if;
 return new;
end $body$;
revoke execute on function public.check_media_album_activity()
 from public,anon,authenticated;

do $guard$
begin
 if not exists(select 1 from pg_trigger
   where tgrelid='public.media'::regclass and tgname='media_album_activity_guard'
    and not tgisinternal) then
  create trigger media_album_activity_guard
   before insert or update of activity_id,trip_id,user_id on public.media
   for each row execute function public.check_media_album_activity();
 end if;
end $guard$;

-- Existing owner-only RLS and account_accepts_writes() barriers remain intact.
grant insert(title),update(title) on public.trips to authenticated;
grant update(activity_id) on public.media to authenticated;
commit;
