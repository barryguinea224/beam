-- BEAM Travel History V1 — canonical staging schema
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check(char_length(display_name)<=80),
  phone text constraint profiles_phone_valid
    check(phone is null or (char_length(phone)<=30 and phone ~ '^\+[0-9]{6,15}$')),
  postal_address text constraint profiles_postal_address_valid
    check(postal_address is null or (char_length(postal_address)<=300 and btrim(postal_address)<>'')),
  nationality text check(char_length(nationality)<=60),
  home_city text not null default 'Conakry' check(char_length(home_city)<=80),
  country_of_residence char(2) check(country_of_residence ~ '^[A-Z]{2}$'),
  access_until date, -- NULL means read-only until the owner sets a valid date
  deleting boolean not null default false,
  deletion_requested_at timestamptz,
  deletion_claimed_until timestamptz,
  deletion_claim_token uuid,
  deletion_attempts integer not null default 0,
  deletion_last_attempt_at timestamptz,
  deletion_last_error text,
  public_code text not null unique default encode(gen_random_bytes(9),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_deletion_timestamp_required check(not deleting or deletion_requested_at is not null)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cover_media_id uuid,
  airline_media_id uuid,
  hotel_media_id uuid,
  country_code char(2) not null check(country_code ~ '^[A-Z]{2}$'),
  cities text[] not null default '{}' check(cardinality(cities)<=10),
  entry_date date not null,
  exit_date date not null,
  duration_days integer generated always as (exit_date-entry_date+1) stored,
  purpose text not null check(purpose in ('tourisme','affaires','etudes','famille','sante','transit','autre')),
  -- Optional names only, not booking documents, personal IDs or ticket numbers.
  airline text constraint trips_airline_max_length check(char_length(airline)<=160),
  hotel text constraint trips_hotel_max_length check(char_length(hotel)<=160),
  note text check(char_length(note)<=20000),
  is_favorite boolean not null default false,
  is_domestic boolean not null default false,
  deleting boolean not null default false,
  deletion_requested_at timestamptz,
  deletion_claimed_until timestamptz,
  deletion_claim_token uuid,
  deletion_attempts integer not null default 0,
  deletion_last_attempt_at timestamptz,
  deletion_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exit_after_entry check(exit_date>=entry_date),
  constraint trips_deletion_timestamp_required check(not deleting or deletion_requested_at is not null),
  constraint no_overlap exclude using gist (
    user_id with =,
    (case when entry_date=exit_date then daterange(entry_date,entry_date,'[]')
          else daterange(entry_date,exit_date,'[)') end) with &&
  )
);
create index trips_user_entry on public.trips(user_id,entry_date desc);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'lieu' check(kind in ('lieu','evenement','experience')),
  title text not null check(char_length(title) between 1 and 160),
  place text check(char_length(place)<=160), happened_on date,
  note text check(char_length(note)<=5000), is_favorite boolean not null default false,
  position integer not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,
  kind text not null default 'photo' check(kind='photo'),
  caption text check(char_length(caption)<=500), taken_on date,
  width integer, height integer, bytes bigint check(bytes>0 and bytes<=10485760),
  is_favorite boolean not null default false, position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint path_belongs_to_trip check(
    storage_path ~ ('^' || user_id::text || '/' || trip_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$')
  )
);

-- A cover must be a photo from exactly the same trip and owner.
-- Delete of a photo resets ONLY cover_media_id; trip identity is unchanged.
alter table public.media add constraint media_cover_identity unique (id,trip_id,user_id);
alter table public.trips add constraint trips_cover_same_trip_owner
  foreign key (cover_media_id,id,user_id) references public.media(id,trip_id,user_id)
  on delete set null (cover_media_id);
-- Same trip and same owner for optional airline / lodging pictures.
-- The same media row may also be the cover or serve both optional slots.
alter table public.trips add constraint trips_airline_same_trip_owner
  foreign key (airline_media_id,id,user_id) references public.media(id,trip_id,user_id)
  on delete set null (airline_media_id);
alter table public.trips add constraint trips_hotel_same_trip_owner
  foreign key (hotel_media_id,id,user_id) references public.media(id,trip_id,user_id)
  on delete set null (hotel_media_id);

create function public.check_same_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting)
 then raise exception 'Ce voyage n''appartient pas à cet utilisateur ou est en suppression'; end if;
 return new;
end $$;
create trigger activities_same_owner before insert or update on public.activities for each row execute function public.check_same_owner();

-- Serialize the maximum of 50 private activities per trip at the database layer.
-- Same-trip edits (e.g. title/place/date) do not consume a slot.
create index if not exists activities_trip_quota_idx on public.activities(trip_id);
create or replace function public.enforce_activity_quota()
returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare
  locked_trip uuid;
  existing_count integer;
begin
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
create trigger activities_quota_before_write
  before insert or update of trip_id,user_id on public.activities
  for each row execute function public.enforce_activity_quota();
create trigger media_same_owner before insert or update on public.media for each row execute function public.check_same_owner();

-- Serialize quota decisions on the owned trip row, not the media count.
-- Concurrent INSERTs targeting the same trip then see the committed count in order.
create index if not exists media_trip_quota_idx on public.media(trip_id);

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
  if existing_count >= 10 then
    raise exception using errcode='23514',message='PHOTO_LIMIT_REACHED';
  end if;

  return new;
end $$;

revoke execute on function public.enforce_media_photo_quota()
  from public,anon,authenticated;
drop trigger if exists media_photo_quota_before_write on public.media;
create trigger media_photo_quota_before_write
  before insert or update of trip_id,user_id on public.media
  for each row execute function public.enforce_media_photo_quota();


create function public.check_trip_dates() returns trigger language plpgsql set search_path='' as $$
begin if new.exit_date>(now() at time zone 'utc')::date then raise exception 'L''historique ne contient que des voyages terminés'; end if; return new; end $$;
create trigger trips_dates before insert or update of entry_date,exit_date on public.trips for each row execute function public.check_trip_dates();

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,display_name) values(new.id,nullif(new.raw_user_meta_data->>'display_name','')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.check_same_owner(), public.check_trip_dates(),
  public.touch_updated_at() from public,anon,authenticated;

-- Definer RLS helpers live outside the exposed Data API, fail closed on other users.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.account_accepts_writes(uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select uid = (select auth.uid())
    and exists(select 1 from public.profiles p
      where p.id=uid and not p.deleting and p.access_until >= current_date);
$$;
revoke execute on function private.account_accepts_writes(uuid) from public,anon,authenticated;
grant execute on function private.account_accepts_writes(uuid) to authenticated;

create function private.trip_accepts_writes(uid uuid, trip uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.account_accepts_writes(uid)
    and exists(select 1 from public.trips t
      where t.id=trip and t.user_id=uid and not t.deleting);
$$;
revoke execute on function private.trip_accepts_writes(uuid,uuid) from public,anon,authenticated;
grant execute on function private.trip_accepts_writes(uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.activities enable row level security;
alter table public.media enable row level security;
create policy "profil lecture" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profil modification" on public.profiles for update to authenticated using(id=auth.uid() and private.account_accepts_writes(auth.uid())) with check(id=auth.uid() and private.account_accepts_writes(auth.uid()));
revoke update on public.profiles from authenticated;
grant update(display_name,nationality,home_city,country_of_residence,phone,postal_address) on public.profiles to authenticated;
revoke insert,delete on public.profiles from authenticated;
-- Reads: owner only. Writes: owner AND account not being deleted (db_write_barrier.sql).
create policy "voyages lecture" on public.trips for select to authenticated using(user_id=auth.uid());
create policy "voyages création" on public.trips for insert to authenticated with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()));
create policy "voyages modification" on public.trips for update to authenticated using(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and not deleting) with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and not deleting);
create policy "activités lecture" on public.activities for select to authenticated using(user_id=auth.uid());
create policy "activités création" on public.activities for insert to authenticated with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités modification" on public.activities for update to authenticated using(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id)) with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités suppression" on public.activities for delete to authenticated using(user_id=auth.uid() and private.account_accepts_writes(auth.uid()));
create policy "médias lecture" on public.media for select to authenticated using(user_id=auth.uid());
create policy "médias création" on public.media for insert to authenticated with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id));
create policy "médias modification" on public.media for update to authenticated using(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id)) with check(user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and private.trip_accepts_writes(auth.uid(), trip_id));
revoke all on public.profiles,public.trips,public.activities,public.media from anon;
-- Destructive trip/media deletion is server-only: raw browser DELETE would orphan Storage.
revoke delete on public.trips, public.media from authenticated;
-- deleting is server-only. Keep ordinary trip editing available.
revoke update on public.trips from authenticated;
grant update(country_code,cities,entry_date,exit_date,purpose,airline,hotel,note,is_favorite,is_domestic,cover_media_id,airline_media_id,hotel_media_id) on public.trips to authenticated;
-- Photo reservation identity, path and file properties are immutable for browser clients.
revoke update on public.media from authenticated;
grant update(caption,taken_on,is_favorite,position) on public.media to authenticated;

create view public.travel_history_pdf with(security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose
from public.trips where not is_domestic and not deleting;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,10485760,array['image/webp']) on conflict(id) do nothing;
create policy "storage lire" on storage.objects for select to authenticated using(
 bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.profiles p where p.id=auth.uid() and not p.deleting));
create policy "storage ajouter" on storage.objects for insert to authenticated with check(
 bucket_id='media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and private.trip_accepts_writes(
   auth.uid(),
   case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid else null end
) and exists (
   select 1 from public.media m
   where m.storage_path=storage.objects.name and m.user_id=auth.uid()
)
);
-- No client DELETE policy: Storage objects must be removed by the verified
-- service-role travel-delete protocol, before a related media row is removed.



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
 -- The row's bytes value comes from the client; verify Storage's real metadata.
 if not exists(
   select 1 from storage.objects o
   where o.bucket_id='media' and o.name=chosen.storage_path
     and o.metadata->>'mimetype'='image/webp'
     and case
       when o.metadata->>'size' ~ '^[0-9]{1,7}$'
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


-- Server-only ownership guard used immediately before Auth user deletion.
-- Keep this RPC in public so PostgREST can reach it, but only service_role may execute it.
create function public.count_owned_storage_objects(uid uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select count(*)
  from storage.objects
  where owner_id = uid::text or owner = uid
$$;
revoke execute on function public.count_owned_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.count_owned_storage_objects(uuid) to service_role;


-- Automatic deletion retry worker support.
create schema if not exists private;

create table if not exists private.deletion_retry_log (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('account','trip')),
  subject_id uuid not null,
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  error_code text,
  constraint retry_log_error_shape check ((success and error_code is null) or (not success and error_code is not null))
);
create index if not exists deletion_retry_log_attempted_at on private.deletion_retry_log(attempted_at desc);
revoke all on private.deletion_retry_log from public,anon,authenticated;

-- Durable per-invocation receipt. No deletion subjects or secrets are persisted here.
-- A run without finished_at is an observable incomplete/terminated background task.
create table if not exists private.deletion_retry_runs (
  run_id uuid primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','completed','failed')),
  claimed integer not null default 0 check (claimed between 0 and 5),
  started integer not null default 0 check (started >= 0),
  destructive_succeeded integer not null default 0 check (destructive_succeeded >= 0),
  destructive_failed integer not null default 0 check (destructive_failed >= 0),
  error_code text,
  constraint deletion_retry_run_lifecycle check (
    (status = 'running' and finished_at is null and error_code is null)
    or (status = 'completed' and finished_at is not null and error_code is null)
    or (status = 'failed' and finished_at is not null and error_code is not null)
  ),
  constraint deletion_retry_run_counts check (
    started <= claimed and destructive_succeeded + destructive_failed <= started
  )
);
revoke all on private.deletion_retry_runs from public,anon,authenticated;

create index if not exists deletion_retry_runs_started_at on private.deletion_retry_runs(started_at);
-- Stale asynchronous executions are visible to monitoring even after the Edge Runtime stops.
create or replace function public.count_stale_deletion_retry_runs() returns bigint
language sql stable security definer set search_path='' as
'select count(*) from private.deletion_retry_runs
 where status = ''running'' and started_at < now() - interval ''15 minutes''';
revoke execute on function public.count_stale_deletion_retry_runs() from public,anon,authenticated;
grant execute on function public.count_stale_deletion_retry_runs() to service_role;

-- Service-role-only monitor counter: FAILED receipts finished in the last 24 hours.
-- Operational errors are not exposed to anon/authenticated users.
create index if not exists deletion_retry_runs_failed_finished_at
  on private.deletion_retry_runs(finished_at desc) where status='failed';
create or replace function public.count_failed_deletion_retry_runs_24h() returns bigint
language sql stable security definer set search_path='' as
'select count(*) from private.deletion_retry_runs
 where status = ''failed'' and finished_at >= now() - interval ''24 hours''';
revoke execute on function public.count_failed_deletion_retry_runs_24h() from public,anon,authenticated;
grant execute on function public.count_failed_deletion_retry_runs_24h() to service_role;


create or replace function public.begin_deletion_retry_run(p_run_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Keep completed/failed receipts for 30 days; unresolved running receipts remain
  -- visible until an operator investigates them.
  delete from private.deletion_retry_runs
  where status in ('completed','failed') and started_at < now() - interval '30 days';
  insert into private.deletion_retry_runs(run_id) values (p_run_id);
end $$;
revoke execute on function public.begin_deletion_retry_run(uuid) from public,anon,authenticated;
grant execute on function public.begin_deletion_retry_run(uuid) to service_role;

create or replace function public.finish_deletion_retry_run(
  p_run_id uuid, p_claimed integer, p_started integer, p_succeeded integer,
  p_failed integer, p_error_code text default null
) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update private.deletion_retry_runs set
    finished_at=now(),
    status=case when p_error_code is null then 'completed' else 'failed' end,
    claimed=p_claimed, started=p_started,
    destructive_succeeded=p_succeeded, destructive_failed=p_failed,
    error_code=case when p_error_code is null then null
      else left(coalesce(nullif(p_error_code,''),'UNKNOWN_ERROR'),80) end
  where run_id=p_run_id and status='running';
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke execute on function public.finish_deletion_retry_run(uuid,integer,integer,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.finish_deletion_retry_run(uuid,integer,integer,integer,integer,text)
  to service_role;

create or replace function public.get_deletion_retry_run(p_run_id uuid)
returns table(run_id uuid, status text, started_at timestamptz, finished_at timestamptz,
  claimed integer, started integer, destructive_succeeded integer,
  destructive_failed integer, error_code text)
language sql stable security definer set search_path='' as $$
  select r.run_id,r.status,r.started_at,r.finished_at,r.claimed,r.started,
    r.destructive_succeeded,r.destructive_failed,r.error_code
  from private.deletion_retry_runs r where r.run_id=p_run_id
$$;
revoke execute on function public.get_deletion_retry_run(uuid) from public,anon,authenticated;
grant execute on function public.get_deletion_retry_run(uuid) to service_role;


-- Retry delay after a real failed attempt: 10m,20m,40m,80m,160m,320m, then 6h cap.
create or replace function private.retry_delay(attempts integer) returns interval
language sql immutable set search_path='' as $$
  select make_interval(secs => least(21600, 600 * (2 ^ greatest(attempts - 1,0))::integer))
$$;
revoke execute on function private.retry_delay(integer) from public,anon,authenticated;

create or replace function public.claim_stale_deletions(batch_size integer default 5, lease_minutes integer default 10)
returns table(subject_kind text,subject_id uuid,user_id uuid,claim_token uuid)
language plpgsql security definer set search_path='' as $$
declare account_slots integer;
begin
  if batch_size < 1 or batch_size > 5 then raise exception 'INVALID_BATCH_SIZE'; end if;
  if lease_minutes < 1 or lease_minutes > 30 then raise exception 'INVALID_LEASE_MINUTES'; end if;

  return query
  with candidates as (
    select p.id
    from public.profiles p
    where p.deleting and p.deletion_requested_at is not null and p.deletion_attempts < 12
      and p.deletion_requested_at <= now()-interval '1 hour'
      and (p.deletion_last_attempt_at is null or p.deletion_last_attempt_at + private.retry_delay(p.deletion_attempts) <= now())
      and (p.deletion_claimed_until is null or p.deletion_claimed_until < now())
    order by p.deletion_requested_at,p.id for update skip locked limit batch_size
  ), claimed as (
    update public.profiles p set
      deletion_claimed_until=now()+make_interval(mins=>lease_minutes),
      deletion_claim_token=gen_random_uuid()
    from candidates c where p.id=c.id
    returning p.id,p.deletion_claim_token
  )
  select 'account'::text,c.id,c.id,c.deletion_claim_token from claimed c;
  get diagnostics account_slots=row_count;

  return query
  with candidates as (
    select t.id,t.user_id
    from public.trips t join public.profiles p on p.id=t.user_id
    where t.deleting and t.deletion_requested_at is not null and t.deletion_attempts < 12 and not p.deleting
      and t.deletion_requested_at <= now()-interval '1 hour'
      and (t.deletion_last_attempt_at is null or t.deletion_last_attempt_at + private.retry_delay(t.deletion_attempts) <= now())
      and (t.deletion_claimed_until is null or t.deletion_claimed_until < now())
    order by t.deletion_requested_at,t.id for update of t skip locked
    limit greatest(batch_size-account_slots,0)
  ), claimed as (
    update public.trips t set
      deletion_claimed_until=now()+make_interval(mins=>lease_minutes),
      deletion_claim_token=gen_random_uuid()
    from candidates c where t.id=c.id
    returning t.id,t.user_id,t.deletion_claim_token
  )
  select 'trip'::text,c.id,c.user_id,c.deletion_claim_token from claimed c;
end $$;
revoke execute on function public.claim_stale_deletions(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_stale_deletions(integer,integer) to service_role;

-- A reserved item becomes an attempt only when processing actually starts.
create or replace function public.start_deletion_retry(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid,p_claim_token uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_subject_kind='account' then
    update public.profiles set deletion_attempts=deletion_attempts+1,deletion_last_attempt_at=now(),deletion_last_error=null
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token
      and deletion_claimed_until>=now();
  elsif p_subject_kind='trip' then
    update public.trips set deletion_attempts=deletion_attempts+1,deletion_last_attempt_at=now(),deletion_last_error=null
    where id=p_subject_id and user_id=p_user_id and deleting and deletion_claim_token=p_claim_token
      and deletion_claimed_until>=now();
  else raise exception 'INVALID_SUBJECT_KIND';
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke execute on function public.start_deletion_retry(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_deletion_retry(text,uuid,uuid,uuid) to service_role;

-- Release work that was leased but never started. Token matching prevents an old worker
-- from releasing a lease subsequently acquired by another invocation.
create or replace function public.release_unstarted_deletion_claim(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid,p_claim_token uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_subject_kind='account' then
    update public.profiles set
      deletion_claimed_until=null,deletion_claim_token=null
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  elsif p_subject_kind='trip' then
    update public.trips set
      deletion_claimed_until=null,deletion_claim_token=null
    where id=p_subject_id and user_id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  else raise exception 'INVALID_SUBJECT_KIND';
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke execute on function public.release_unstarted_deletion_claim(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_unstarted_deletion_claim(text,uuid,uuid,uuid) to service_role;

-- This records the outcome of the destructive operation. Logging failure is not allowed
-- to reinterpret a successful deletion as a destructive failure.
create or replace function public.record_deletion_retry_failure(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid,p_claim_token uuid,p_error_code text
) returns boolean language plpgsql security definer set search_path='' as $$
declare safe_error text; changed integer;
begin
  safe_error:=left(coalesce(nullif(p_error_code,''),'UNKNOWN_ERROR'),240);
  if p_subject_kind='account' then
    update public.profiles set deletion_claimed_until=null,deletion_claim_token=null,deletion_last_error=safe_error
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  elsif p_subject_kind='trip' then
    update public.trips set deletion_claimed_until=null,deletion_claim_token=null,deletion_last_error=safe_error
    where id=p_subject_id and user_id=p_user_id and deleting and deletion_claim_token=p_claim_token;
  else raise exception 'INVALID_SUBJECT_KIND';
  end if;
  get diagnostics changed=row_count;
  if changed=1 then
    insert into private.deletion_retry_log(subject_kind,subject_id,user_id,success,error_code)
    values(p_subject_kind,p_subject_id,p_user_id,false,safe_error);
  end if;
  return changed=1;
end $$;
revoke execute on function public.record_deletion_retry_failure(text,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_deletion_retry_failure(text,uuid,uuid,uuid,text) to service_role;

create or replace function public.record_deletion_retry_success(
  p_subject_kind text,p_subject_id uuid,p_user_id uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_subject_kind not in ('account','trip') then raise exception 'INVALID_SUBJECT_KIND'; end if;
  insert into private.deletion_retry_log(subject_kind,subject_id,user_id,success,error_code)
  values(p_subject_kind,p_subject_id,p_user_id,true,null);
end $$;
revoke execute on function public.record_deletion_retry_success(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_deletion_retry_success(text,uuid,uuid) to service_role;

create or replace view private.stuck_deletions as
select 'account'::text subject_kind,p.id subject_id,p.id user_id,p.deletion_requested_at,
 p.deletion_attempts,p.deletion_last_attempt_at,p.deletion_last_error
from public.profiles p where p.deleting and
 (p.deletion_requested_at is null or p.deletion_attempts>=12 or p.deletion_requested_at<=now()-interval '24 hours')
union all
select 'trip'::text,t.id,t.user_id,t.deletion_requested_at,t.deletion_attempts,t.deletion_last_attempt_at,t.deletion_last_error
from public.trips t where t.deleting and
 (t.deletion_requested_at is null or t.deletion_attempts>=12 or t.deletion_requested_at<=now()-interval '24 hours');
revoke all on private.stuck_deletions from public,anon,authenticated;

create or replace function public.count_stuck_deletions() returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from private.stuck_deletions
$$;
revoke execute on function public.count_stuck_deletions() from public,anon,authenticated;
grant execute on function public.count_stuck_deletions() to service_role;

create or replace function private.dispatch_travel_deletion_retry() returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; worker_secret text; request_id bigint;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='travel_retry_project_url';
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='travel_retry_secret';
 if project_url is null or worker_secret is null then raise exception 'RETRY_WORKER_VAULT_NOT_CONFIGURED'; end if;
 select net.http_post(
  url:=rtrim(project_url,'/')||'/functions/v1/travel-deletion-retry',
  headers:=jsonb_build_object('Content-Type','application/json','x-travel-retry-secret',worker_secret),
  body:='{"source":"pg_cron"}'::jsonb,timeout_milliseconds:=5000
 ) into request_id;
 return request_id;
end $$;
revoke execute on function private.dispatch_travel_deletion_retry() from public,anon,authenticated;

-- Scheduling is an environment operation performed only after review and Vault setup.

-- BTH loyalty memberships — apply to existing staging/production AFTER review.
-- Idempotent: safe to replay. Canonical fresh installs also include this block.
-- Only a loyalty programme number is stored; NEVER credentials, PINs or passwords.
create table if not exists public.loyalty_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_code text not null constraint loyalty_program_code_valid
    check (program_code in ('AF','EK','ET','SN','TK','AT','HC','KP')),
  member_number text not null constraint loyalty_member_number_valid
    check (member_number ~ '^[A-Za-z0-9-]{4,30}$'),
  tier text constraint loyalty_tier_valid
    check (tier is null or (char_length(tier) between 1 and 40 and btrim(tier)<>''))
  ,
  miles_expiry date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_owner_program_unique unique (user_id,program_code)
);
create index if not exists loyalty_memberships_owner_idx
  on public.loyalty_memberships(user_id);
drop trigger if exists loyalty_memberships_touch on public.loyalty_memberships;
create trigger loyalty_memberships_touch before update on public.loyalty_memberships
  for each row execute function public.touch_updated_at();
alter table public.loyalty_memberships enable row level security;
-- Reading is owner-only and follows the same active-access barrier as writes.
drop policy if exists "loyalty owner select active" on public.loyalty_memberships;
create policy "loyalty owner select active" on public.loyalty_memberships
  for select to authenticated
  using (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())));
drop policy if exists "loyalty owner insert active" on public.loyalty_memberships;
create policy "loyalty owner insert active" on public.loyalty_memberships
  for insert to authenticated
  with check (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())));
drop policy if exists "loyalty owner update active" on public.loyalty_memberships;
create policy "loyalty owner update active" on public.loyalty_memberships
  for update to authenticated
  using (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())))
  with check (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())));
drop policy if exists "loyalty owner delete active" on public.loyalty_memberships;
create policy "loyalty owner delete active" on public.loyalty_memberships
  for delete to authenticated
  using (user_id=(select auth.uid()) and (select private.account_accepts_writes(auth.uid())));
-- Do not inherit broad schema grants. The browser cannot change ownership or timestamps.
revoke all on public.loyalty_memberships from public,anon,authenticated;
grant select,delete on public.loyalty_memberships to authenticated;
grant insert(program_code,member_number,tier,miles_expiry)
  on public.loyalty_memberships to authenticated;
grant update(member_number,tier,miles_expiry)
  on public.loyalty_memberships to authenticated;

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

-- BTH · récupération d'un compte avec e-mail perdu
-- Migration idempotente à lancer exclusivement dans le SQL Editor en rôle postgres.
-- Ni nouvelle inscription, ni suppression/recréation du compte, ni clé API.
-- Les comptes voyages, media et carnets conservent leur UUID auth.users.
create schema if not exists private;

create table if not exists private.account_email_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  old_email text not null,
  new_email text not null,
  reason text not null constraint account_email_changes_reason_length
    check (char_length(btrim(reason)) between 10 and 300),
  changed_at timestamptz not null default now(),
  changed_by text not null default current_user
);
create index if not exists account_email_changes_user_date_idx
  on private.account_email_changes(user_id,changed_at desc);
create index if not exists account_email_changes_old_idx
  on private.account_email_changes(lower(old_email));
create index if not exists account_email_changes_new_idx
  on private.account_email_changes(lower(new_email));

-- Double protection : pas de politiques RLS et aucun droit aux rôles web,
-- y compris service_role. Ne PAS révoquer USAGE sur tout le schéma private :
-- les politiques RLS existantes de BTH utilisent ses fonctions internes.
alter table private.account_email_changes enable row level security;
revoke all on table private.account_email_changes from public,anon,authenticated,service_role;
grant all on table private.account_email_changes to postgres;

-- Vérification explicite de la forme de schéma Auth de cette version Supabase.
-- Faire échouer la migration si le fournisseur fait évoluer ces colonnes.
do $schema_check$
declare required_count integer;
begin
 select count(*) into required_count
 from information_schema.columns
 where (table_schema,table_name,column_name) in (
  ('auth','users','id'),('auth','users','email'),
  ('auth','users','email_confirmed_at'),('auth','users','updated_at'),
  ('auth','identities','id'),('auth','identities','user_id'),
  ('auth','identities','provider'),('auth','identities','provider_id'),
  ('auth','identities','identity_data'),('auth','identities','updated_at'),
  ('auth','sessions','user_id'),
  ('auth','refresh_tokens','user_id'));
 if required_count<>12 then
  raise exception using errcode='0A000',
    message='BEAM_AUTH_SCHEMA_INCOMPATIBLE',
    detail='Schéma Supabase Auth différent : interrompre et vérifier auth.users, auth.identities, auth.sessions et auth.refresh_tokens.';
 end if;
end $schema_check$;

create or replace function private.beam_change_client_email(
 p_old_email text,p_new_email text,p_reason text
) returns text
language plpgsql volatile security definer set search_path=''
as $fn$
declare
 v_old text := lower(btrim(coalesce(p_old_email,''),E' \t\n\r'));
 v_new text := lower(btrim(coalesce(p_new_email,''),E' \t\n\r'));
 v_reason text := btrim(coalesce(p_reason,''),E' \t\n\r');
 v_uid uuid;
 v_display text;
 v_deleting boolean;
 v_identities integer;
 v_emails_taken boolean;
begin
 -- Aucune connexion par anon, authenticated ou service_role ne peut passer
 -- le contrôle de droits. SECURITY DEFINER accède à Auth uniquement
 -- sous le propriétaire postgres, pas sous le client.
 if length(v_old)>254 or length(v_new)>254 or
    v_old !~ '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    or v_new !~ '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    or position('..' in v_old)>0 or position('..' in v_new)>0 then
   raise exception using errcode='22023',
    message='BEAM_EMAIL_FORMAT_INVALIDE',
    detail='Saisissez deux adresses e-mail valides (sans espaces, en minuscules après normalisation).';
 end if;
 if v_old=v_new then
   raise exception using errcode='22023',message='BEAM_EMAIL_IDENTIQUE',
    detail='L’ancienne et la nouvelle adresse sont identiques.';
 end if;
 if char_length(v_reason)<10 or char_length(v_reason)>300 then
   raise exception using errcode='22023',message='BEAM_MOTIF_INVALIDE',
    detail='Le motif de vérification en personne doit contenir entre 10 et 300 caractères.';
 end if;

 -- Un seul compte, verrouillé : prévient une récupération concurrente du même
 -- identifiant. On ne change jamais auth.users.id.
 select u.id into v_uid from auth.users u
  where lower(btrim(u.email))=v_old
  for update;
 if not found then
   raise exception using errcode='P0002',message='BEAM_ANCIEN_EMAIL_INTROUVABLE',
     detail='Aucun compte n’utilise cet ancien e-mail.';
 end if;

 select p.display_name,p.deleting into v_display,v_deleting
  from public.profiles p where p.id=v_uid for update;
 if not found then
   raise exception using errcode='P0002',message='BEAM_PROFIL_INTROUVABLE',
    detail='Le profil correspondant est absent. Ne pas recréer le compte.';
 end if;
 if v_deleting then
   raise exception using errcode='23514',message='BEAM_COMPTE_EN_SUPPRESSION',
    detail='Un compte en cours de suppression ne peut pas être récupéré.';
 end if;

 select exists(
  select 1 from auth.users u where lower(btrim(u.email))=v_new and u.id<>v_uid
 ) or exists(
  select 1 from auth.identities i where i.provider='email'
    and lower(coalesce(i.identity_data->>'email',''))=v_new
    and i.user_id<>v_uid
 ) into v_emails_taken;
 if v_emails_taken then
   raise exception using errcode='23505',message='BEAM_NOUVEL_EMAIL_DEJA_UTILISE',
     detail='Cette adresse appartient déjà à un autre compte.';
 end if;

 -- Dans Supabase, provider='email' utilise normalement provider_id = UUID
 -- de l’utilisateur (ne PAS le remplacer par l’adresse). Compatibilité :
 -- l’actualiser uniquement si la base historique l’avait mis à l’ancien e-mail.
 select count(*) into v_identities from auth.identities i
  where i.user_id=v_uid and i.provider='email'
    and lower(coalesce(i.identity_data->>'email',''))=v_old;
 if v_identities<>1 then
   raise exception using errcode='23514',message='BEAM_IDENTITE_EMAIL_INCOHERENTE',
     detail='Une identité e-mail existante et cohérente est requise. Ne modifier aucune table manuellement.';
 end if;

 update auth.users set
  email=v_new,email_confirmed_at=now(),updated_at=now()
 where id=v_uid;

 update auth.identities i set
  identity_data=jsonb_set(coalesce(i.identity_data,'{}'::jsonb),
                          '{email}',to_jsonb(v_new),true),
  provider_id=case when i.provider_id=v_old then v_new else i.provider_id end,
  updated_at=now()
 where i.user_id=v_uid and i.provider='email'
   and lower(coalesce(i.identity_data->>'email',''))=v_old;
 get diagnostics v_identities=row_count;
 if v_identities<>1 then
   raise exception using errcode='23514',message='BEAM_IDENTITE_NON_MISE_A_JOUR';
 end if;

 -- Les sessions v2 utilisent auth.sessions ; les sessions historiques
 -- peuvent en outre avoir des lignes dans auth.refresh_tokens.
 delete from auth.refresh_tokens where user_id=v_uid::text;
 delete from auth.sessions where user_id=v_uid;

 insert into private.account_email_changes
   (user_id,old_email,new_email,reason,changed_by)
 values(v_uid,v_old,v_new,v_reason,current_user);

 return format('E-mail changé pour %s : %s → %s. Toutes les sessions ont été fermées.',
  coalesce(nullif(btrim(v_display),''),'ce client'),v_old,v_new);
 -- Aucune interception d’exception : PostgreSQL annule toute l’instruction
 -- (users, identities, sessions, refresh_tokens et audit) à la moindre erreur.
end
$fn$;

create or replace function private.beam_email_change_history(p_email text)
returns table (
 id uuid,user_id uuid,old_email text,new_email text,
 reason text,changed_at timestamptz,changed_by text
)
language plpgsql stable security definer set search_path=''
as $history$
declare
 v_email text := lower(btrim(coalesce(p_email,''),E' \t\n\r'));
 v_users uuid[];
begin
 if v_email='' then
  raise exception using errcode='22023',message='BEAM_EMAIL_REQUIS';
 end if;
 -- Retrouve toutes les étapes d’historique d’un même UUID, même si
 -- l’e-mail recherché est une adresse ancienne ou intermédiaire.
 select array_agg(distinct matches.uid) into v_users
 from (
  select u.id as uid from auth.users u where lower(btrim(u.email))=v_email
  union all
  select h.user_id as uid from private.account_email_changes h
  where h.old_email=v_email or h.new_email=v_email
 ) as matches;
 if coalesce(cardinality(v_users),0)>1 then
  raise exception using errcode='22023',message='BEAM_HISTORIQUE_EMAIL_AMBIGU',
    detail='Cette adresse a été utilisée par plusieurs comptes; faire une vérification manuelle par UUID.';
 end if;
 if coalesce(cardinality(v_users),0)=0 then
  raise exception using errcode='P0002',message='BEAM_HISTORIQUE_EMAIL_INTROUVABLE';
 end if;
 return query
  select h.id,h.user_id,h.old_email,h.new_email,h.reason,h.changed_at,h.changed_by
  from private.account_email_changes h
  where h.user_id=v_users[1]
  order by h.changed_at,h.id;
end
$history$;

-- Dans une migration antérieure, CREATE OR REPLACE ne remplace pas forcément
-- le propriétaire. Ces deux fonctions ne doivent appartenir qu'à postgres.
alter function private.beam_change_client_email(text,text,text) owner to postgres;
alter function private.beam_email_change_history(text) owner to postgres;

revoke all on function private.beam_change_client_email(text,text,text)
 from public,anon,authenticated,service_role;
revoke all on function private.beam_email_change_history(text)
 from public,anon,authenticated,service_role;
grant execute on function private.beam_change_client_email(text,text,text) to postgres;
grant execute on function private.beam_email_change_history(text) to postgres;
