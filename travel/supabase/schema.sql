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
  public_code text not null unique default encode(gen_random_bytes(9),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exit_after_entry check(exit_date>=entry_date),
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
create policy "profil modification" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke update on public.profiles from authenticated;
grant update(display_name,nationality,home_city,country_of_residence) on public.profiles to authenticated;
revoke insert,delete on public.profiles from authenticated;
create policy "voyages propriétaire" on public.trips for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "activités propriétaire" on public.activities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "médias propriétaire" on public.media for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
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
