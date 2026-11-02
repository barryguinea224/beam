-- BEAM BTH: avatar row-first reservation; apply to STAGING then PRODUCTION.
-- No secret values. Safe to run once as a single atomic transaction.
begin;

-- Optional private avatar, row-first reservation and server-only activation.
-- The account may have ONE active avatar and ONE uncommitted reservation.
alter table public.profiles add column if not exists avatar_id uuid;

create table if not exists public.avatar_media (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null unique,
 state text not null default 'pending' check(state in ('pending','active','retired')),
 width integer not null check(width between 1 and 512),
 height integer not null check(height between 1 and 512),
 bytes bigint not null check(bytes between 1 and 2097152),
 created_at timestamptz not null default now(),
 constraint avatar_media_square check(width=height),
 constraint avatar_media_owned_path check(
  storage_path = user_id::text||'/profile/'||id::text||'.webp'
 ),
 constraint avatar_media_id_user_unique unique(id,user_id)
);
create unique index if not exists avatar_one_active_per_user
 on public.avatar_media(user_id) where state='active';
create unique index if not exists avatar_one_pending_per_user
 on public.avatar_media(user_id) where state='pending';
do $avatar_fk$
begin
 if not exists(select 1 from pg_constraint
  where conname='profile_avatar_owner_fk' and conrelid='public.profiles'::regclass) then
  alter table public.profiles
    add constraint profile_avatar_owner_fk foreign key(avatar_id,id)
    references public.avatar_media(id,user_id) on delete set null (avatar_id);
 end if;
end $avatar_fk$;

alter table public.avatar_media enable row level security;
drop policy if exists "avatar lecture propriétaire" on public.avatar_media;
create policy "avatar lecture propriétaire" on public.avatar_media
  for select to authenticated using (user_id=auth.uid());
drop policy if exists "avatar réservation active" on public.avatar_media;
create policy "avatar réservation active" on public.avatar_media
  for insert to authenticated with check(
    user_id=auth.uid() and state='pending'
    and private.account_accepts_writes(auth.uid())
  );
revoke all on public.avatar_media from public,anon,authenticated;
grant select,insert on public.avatar_media to authenticated;
-- The client cannot change the profile pointer or reserved paths/state,
-- including an attempt through an ordinary UPDATE profile query.
revoke update(avatar_id) on public.profiles from authenticated;

create or replace function private.avatar_accepts_upload(uid uuid, object_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select uid=auth.uid() and private.account_accepts_writes(uid)
  and exists(select 1 from public.avatar_media a
    where a.user_id=uid and a.state='pending'
      and a.storage_path=object_path)
$$;
revoke execute on function private.avatar_accepts_upload(uuid,text) from public,anon,authenticated;
grant execute on function private.avatar_accepts_upload(uuid,text) to authenticated;

-- Extend the existing media Storage row-first INSERT policy only for /profile/.
drop policy if exists "storage ajouter" on storage.objects;
create policy "storage ajouter" on storage.objects for insert to authenticated with check(
 bucket_id='media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and (
    (
      private.trip_accepts_writes(
        auth.uid(),
        case when (storage.foldername(name))[2] ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[2])::uuid else null end
      )
      and exists(select 1 from public.media m
         where m.storage_path=storage.objects.name and m.user_id=auth.uid())
    )
    or (
      (storage.foldername(name))[2]='profile'
      and private.avatar_accepts_upload(auth.uid(),storage.objects.name)
    )
 )
);

-- Service-role-only atomic promotion. Validate real object existence before
-- changing the pointer. Serialize competing requests under a profile row lock.
create or replace function public.activate_reserved_avatar(p_uid uuid,p_avatar_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; chosen public.avatar_media%rowtype;
  previous uuid;
begin
 select * into p from public.profiles where id=p_uid for update;
 if not found or p.deleting or p.access_until is null or p.access_until<current_date
   then raise exception 'AVATAR_READ_ONLY'; end if;
 select * into chosen from public.avatar_media
  where id=p_avatar_id and user_id=p_uid and state='pending' for update;
 if not found then raise exception 'AVATAR_RESERVATION_NOT_FOUND'; end if;
 if not exists(select 1 from storage.objects o
      where o.bucket_id='media' and o.name=chosen.storage_path)
    then raise exception 'AVATAR_UPLOAD_NOT_FOUND'; end if;
 -- Never trust avatar_media.bytes: the browser supplies it. Validate the
 -- *actual* stored object metadata before atomically making it active.
 -- Malformed/null sizes must fail as AVATAR_UPLOAD_INVALID, not cast errors.
 if not exists(
   select 1 from storage.objects o
   where o.bucket_id='media' and o.name=chosen.storage_path
     and o.metadata->>'mimetype'='image/webp'
     and case
       when o.metadata->>'size' ~ '^[0-9]{1,7}
 previous:=p.avatar_id;
 if previous is not null then
   update public.avatar_media set state='retired' where id=previous and user_id=p_uid;
 end if;
 update public.avatar_media set state='active'
   where id=chosen.id and user_id=p_uid;
 update public.profiles set avatar_id=chosen.id where id=p_uid;
 return previous;
end $$;
revoke execute on function public.activate_reserved_avatar(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.activate_reserved_avatar(uuid,uuid) to service_role;

-- Mark avatar retired atomically BEFORE removing a private Storage object.
-- Pending/retired cleanup remains possible after expiry to avoid orphans.
create or replace function public.retire_reserved_avatar(p_uid uuid,p_avatar_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.avatar_media%rowtype;
begin
 select * into p from public.profiles where id=p_uid for update;
 if not found then return null; end if;
 select * into a from public.avatar_media
   where id=p_avatar_id and user_id=p_uid for update;
 if not found then return null; end if;
 if a.state='active' then
  if p.deleting or p.access_until is null or p.access_until<current_date
    then raise exception 'AVATAR_READ_ONLY'; end if;
  if p.avatar_id<>a.id then raise exception 'AVATAR_POINTER_MISMATCH'; end if;
  update public.profiles set avatar_id=null where id=p_uid;
 end if;
 update public.avatar_media set state='retired' where id=a.id and user_id=p_uid;
 return a.storage_path;
end $$;
revoke execute on function public.retire_reserved_avatar(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.retire_reserved_avatar(uuid,uuid) to service_role;

commit;

       then (o.metadata->>'size')::bigint between 1 and 2097152
       else false
     end
 ) then raise exception 'AVATAR_UPLOAD_INVALID'; end if;
 previous:=p.avatar_id;
 if previous is not null then
   update public.avatar_media set state='retired' where id=previous and user_id=p_uid;
 end if;
 update public.avatar_media set state='active'
   where id=chosen.id and user_id=p_uid;
 update public.profiles set avatar_id=chosen.id where id=p_uid;
 return previous;
end $$;
revoke execute on function public.activate_reserved_avatar(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.activate_reserved_avatar(uuid,uuid) to service_role;

-- Mark avatar retired atomically BEFORE removing a private Storage object.
-- Pending/retired cleanup remains possible after expiry to avoid orphans.
create or replace function public.retire_reserved_avatar(p_uid uuid,p_avatar_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.avatar_media%rowtype;
begin
 select * into p from public.profiles where id=p_uid for update;
 if not found then return null; end if;
 select * into a from public.avatar_media
   where id=p_avatar_id and user_id=p_uid for update;
 if not found then return null; end if;
 if a.state='active' then
  if p.deleting or p.access_until is null or p.access_until<current_date
    then raise exception 'AVATAR_READ_ONLY'; end if;
  if p.avatar_id<>a.id then raise exception 'AVATAR_POINTER_MISMATCH'; end if;
  update public.profiles set avatar_id=null where id=p_uid;
 end if;
 update public.avatar_media set state='retired' where id=a.id and user_id=p_uid;
 return a.storage_path;
end $$;
revoke execute on function public.retire_reserved_avatar(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.retire_reserved_avatar(uuid,uuid) to service_role;

commit;
