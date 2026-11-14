-- J'y étais: profile cover pointer and 15 trip photos.
-- Run only after reviewed rollout to staging; never run schema.sql on production.
-- All changes are DDL-only. No real media object is read or copied.
begin;
set local lock_timeout='10s';

do $guard$
begin
 if not exists(select 1 from pg_constraint
  where conrelid='public.media'::regclass and conname='media_id_user_unique') then
  alter table public.media add constraint media_id_user_unique unique(id,user_id);
 end if;
end $guard$;

alter table public.profiles add column if not exists cover_media_id uuid;

do $guard$
begin
 if not exists(select 1 from pg_constraint
  where conrelid='public.profiles'::regclass and conname='profiles_cover_owner_fk') then
  alter table public.profiles
   add constraint profiles_cover_owner_fk
   foreign key(cover_media_id,id) references public.media(id,user_id)
   on delete set null(cover_media_id);
 end if;
end $guard$;

-- The pre-existing "profil modification" RLS policy enforces ownership,
-- and private.account_accepts_writes() enforces an active subscription.
grant update(cover_media_id) on public.profiles to authenticated;

-- EXACT previous trigger body: only the threshold changes from 10 to 15.
-- Keep the trip row lock, UPDATE behavior, error codes, security definer
-- search_path and prohibition on calling the trigger directly.
create or replace function public.enforce_media_photo_quota() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare
  locked_trip uuid;
  existing_count integer;
begin
  -- Editing captions/order does not consume a new slot. Moving media to a
  -- different trip does, and must never bypass the destination quota.
  if tg_op='UPDATE' and new.trip_id=old.trip_id and new.user_id=old.user_id then
    return new;
  end if;

  select t.id into locked_trip
  from public.trips t
  where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting
  for update;

  if locked_trip is null then
    raise exception using errcode='23514',message='PHOTO_TRIP_UNAVAILABLE';
  end if;

  select count(*) into existing_count
  from public.media m where m.trip_id=new.trip_id;
  if existing_count >= 15 then
    raise exception using errcode='23514',message='PHOTO_LIMIT_REACHED';
  end if;

  return new;
end $$;

revoke execute on function public.enforce_media_photo_quota()
  from public,anon,authenticated;

commit;
