-- BEAM Travel History V1 — Supabase
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(char_length(display_name)<=80),
 nationality text check(char_length(nationality)<=60),
 home_city text not null default 'Conakry' check(char_length(home_city)<=80),
 country_of_residence char(2) check(country_of_residence ~ '^[A-Z]{2}
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
 place text check(char_length(place)<=160),
 happened_on date,
 note text check(char_length(note)<=5000),
 is_favorite boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.media (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 storage_path text not null unique,
 kind text not null default 'photo' check(kind='photo'),
 caption text check(char_length(caption)<=500),
 taken_on date,
 width integer, height integer,
 bytes bigint check(bytes>0 and bytes<=10485760),
 is_favorite boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 constraint path_belongs_to_owner check(split_part(storage_path,'/',1)=user_id::text)
);

create function public.check_same_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.user_id=new.user_id)
 then raise exception 'Ce voyage n''appartient pas à cet utilisateur'; end if;
 return new;
end $$;
create trigger activities_same_owner before insert or update on public.activities for each row execute function public.check_same_owner();
create trigger media_same_owner before insert or update on public.media for each row execute function public.check_same_owner();

create function public.check_trip_dates() returns trigger language plpgsql as $$
begin
 if new.exit_date>(now() at time zone 'utc')::date
 then raise exception 'L''historique ne contient que des voyages terminés'; end if;
 return new;
end $$;
create trigger trips_dates before insert or update of entry_date,exit_date on public.trips for each row execute function public.check_trip_dates();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name)
 values(new.id,nullif(new.raw_user_meta_data->>'display_name',''));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.activities enable row level security;
alter table public.media enable row level security;

create policy "profil lecture" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profil modification" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- Le navigateur ne peut modifier que les champs de profil explicitement exposés.
-- deleting, deletion_requested_at, public_code et id restent réservés au serveur.
revoke update on public.profiles from authenticated;
grant update(display_name,nationality,home_city,country_of_residence) on public.profiles to authenticated;
revoke insert,delete on public.profiles from authenticated;
create policy "voyages propriétaire" on public.trips for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "activités propriétaire" on public.activities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "médias propriétaire" on public.media for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.profiles,public.trips,public.activities,public.media from anon;

create view public.travel_history_pdf with(security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose from public.trips
where not is_domestic;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function public.account_accepts_writes(uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.deleting=false
  );
$$;
revoke execute on function public.account_accepts_writes(uuid) from public,anon;
grant execute on function public.account_accepts_writes(uuid) to authenticated;

create policy "storage lire" on storage.objects for select to authenticated
 using(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));
create policy "storage ajouter" on storage.objects for insert to authenticated
 with check(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));

-- V1: aucun upsert/remplacement d'objet. UPDATE est volontairement absent.
create policy "storage supprimer" on storage.objects for delete to authenticated
 using(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));

-- Suppression serveur uniquement:
-- 1) profiles.deleting=true; 2) supprimer les objets via l'API Storage;
-- 3) vérifier le préfixe vide; 4) supprimer auth.users.
-- L'ancien JWT ne peut plus écrire car account_accepts_writes() exige un profil actif.
-- Le flux doit être idempotent. service_role ne doit jamais être exposée au navigateur.
),
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
 place text check(char_length(place)<=160),
 happened_on date,
 note text check(char_length(note)<=5000),
 is_favorite boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.media (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 storage_path text not null unique,
 kind text not null default 'photo' check(kind='photo'),
 caption text check(char_length(caption)<=500),
 taken_on date,
 width integer, height integer,
 bytes bigint check(bytes>0 and bytes<=10485760),
 is_favorite boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 constraint path_belongs_to_owner check(split_part(storage_path,'/',1)=user_id::text)
);

create function public.check_same_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.user_id=new.user_id)
 then raise exception 'Ce voyage n''appartient pas à cet utilisateur'; end if;
 return new;
end $$;
create trigger activities_same_owner before insert or update on public.activities for each row execute function public.check_same_owner();
create trigger media_same_owner before insert or update on public.media for each row execute function public.check_same_owner();

create function public.check_trip_dates() returns trigger language plpgsql as $$
begin
 if new.exit_date>(now() at time zone 'utc')::date
 then raise exception 'L''historique ne contient que des voyages terminés'; end if;
 return new;
end $$;
create trigger trips_dates before insert or update of entry_date,exit_date on public.trips for each row execute function public.check_trip_dates();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name)
 values(new.id,nullif(new.raw_user_meta_data->>'display_name',''));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.activities enable row level security;
alter table public.media enable row level security;

create policy "profil lecture" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profil modification" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- Le navigateur ne peut modifier que les champs de profil explicitement exposés.
-- deleting, deletion_requested_at, public_code et id restent réservés au serveur.
revoke update on public.profiles from authenticated;
grant update(display_name,nationality,home_city) on public.profiles to authenticated;
revoke insert,delete on public.profiles from authenticated;
create policy "voyages propriétaire" on public.trips for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "activités propriétaire" on public.activities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "médias propriétaire" on public.media for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.profiles,public.trips,public.activities,public.media from anon;

create view public.travel_history_pdf with(security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose from public.trips;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function public.account_accepts_writes(uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.deleting=false
  );
$$;
revoke execute on function public.account_accepts_writes(uuid) from public,anon;
grant execute on function public.account_accepts_writes(uuid) to authenticated;

create policy "storage lire" on storage.objects for select to authenticated
 using(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));
create policy "storage ajouter" on storage.objects for insert to authenticated
 with check(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));

-- V1: aucun upsert/remplacement d'objet. UPDATE est volontairement absent.
create policy "storage supprimer" on storage.objects for delete to authenticated
 using(bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
   and public.account_accepts_writes(auth.uid()));

-- Suppression serveur uniquement:
-- 1) profiles.deleting=true; 2) supprimer les objets via l'API Storage;
-- 3) vérifier le préfixe vide; 4) supprimer auth.users.
-- L'ancien JWT ne peut plus écrire car account_accepts_writes() exige un profil actif.
-- Le flux doit être idempotent. service_role ne doit jamais être exposée au navigateur.
