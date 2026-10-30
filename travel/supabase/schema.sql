-- BEAM Travel History V1 — canonical staging schema
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check(char_length(display_name)<=80),
  nationality text check(char_length(nationality)<=60),
  home_city text not null default 'Conakry' check(char_length(home_city)<=80),
  country_of_residence char(2) check(country_of_residence ~ '^[A-Z]{2}$'),
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
  country_code char(2) not null check(country_code ~ '^[A-Z]{2}$'),
  cities text[] not null default '{}' check(cardinality(cities)<=10),
  entry_date date not null,
  exit_date date not null,
  duration_days integer generated always as (exit_date-entry_date+1) stored,
  purpose text not null check(purpose in ('tourisme','affaires','etudes','famille','sante','transit','autre')),
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
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg|png)$')
  )
);

create function public.check_same_owner() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting)
 then raise exception 'Ce voyage n''appartient pas à cet utilisateur ou est en suppression'; end if;
 return new;
end $$;
create trigger activities_same_owner before insert or update on public.activities for each row execute function public.check_same_owner();
create trigger media_same_owner before insert or update on public.media for each row execute function public.check_same_owner();

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

create function public.account_accepts_writes(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=uid and not p.deleting);
$$;
revoke execute on function public.account_accepts_writes(uuid) from public,anon;
grant execute on function public.account_accepts_writes(uuid) to authenticated;

create function public.trip_accepts_writes(uid uuid, trip uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t join public.profiles p on p.id=t.user_id
   where t.id=trip and t.user_id=uid and not t.deleting and not p.deleting);
$$;
revoke execute on function public.trip_accepts_writes(uuid,uuid) from public,anon;
grant execute on function public.trip_accepts_writes(uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.activities enable row level security;
alter table public.media enable row level security;
create policy "profil lecture" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profil modification" on public.profiles for update to authenticated using(id=auth.uid() and public.account_accepts_writes(auth.uid())) with check(id=auth.uid() and public.account_accepts_writes(auth.uid()));
revoke update on public.profiles from authenticated;
grant update(display_name,nationality,home_city,country_of_residence) on public.profiles to authenticated;
revoke insert,delete on public.profiles from authenticated;
-- Reads: owner only. Writes: owner AND account not being deleted (db_write_barrier.sql).
create policy "voyages lecture" on public.trips for select to authenticated using(user_id=auth.uid());
create policy "voyages création" on public.trips for insert to authenticated with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()));
create policy "voyages modification" on public.trips for update to authenticated using(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and not deleting) with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and not deleting);
create policy "activités lecture" on public.activities for select to authenticated using(user_id=auth.uid());
create policy "activités création" on public.activities for insert to authenticated with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités modification" on public.activities for update to authenticated using(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id)) with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités suppression" on public.activities for delete to authenticated using(user_id=auth.uid() and public.account_accepts_writes(auth.uid()));
create policy "médias lecture" on public.media for select to authenticated using(user_id=auth.uid());
create policy "médias création" on public.media for insert to authenticated with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "médias modification" on public.media for update to authenticated using(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id)) with check(user_id=auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
revoke all on public.profiles,public.trips,public.activities,public.media from anon;
-- Destructive trip/media deletion is server-only: raw browser DELETE would orphan Storage.
revoke delete on public.trips, public.media from authenticated;
-- deleting is server-only. Keep ordinary trip editing available.
revoke update on public.trips from authenticated;
grant update(country_code,cities,entry_date,exit_date,purpose,note,is_favorite,is_domestic) on public.trips to authenticated;

create view public.travel_history_pdf with(security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose
from public.trips where not is_domestic and not deleting;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "storage lire" on storage.objects for select to authenticated using(
 bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text and public.account_accepts_writes(auth.uid()));
create policy "storage ajouter" on storage.objects for insert to authenticated with check(
 bucket_id='media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and public.trip_accepts_writes(
   auth.uid(),
   case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid else null end
 ));
create policy "storage supprimer" on storage.objects for delete to authenticated using(
 bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text and public.account_accepts_writes(auth.uid()));

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
      deletion_claim_token=gen_random_uuid(),
      deletion_last_error=null
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
      deletion_claim_token=gen_random_uuid(),
      deletion_last_error=null
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
    update public.profiles set deletion_attempts=deletion_attempts+1,deletion_last_attempt_at=now()
    where id=p_subject_id and id=p_user_id and deleting and deletion_claim_token=p_claim_token
      and deletion_claimed_until>=now();
  elsif p_subject_kind='trip' then
    update public.trips set deletion_attempts=deletion_attempts+1,deletion_last_attempt_at=now()
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
