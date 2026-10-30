-- Review-only migration. Do not apply before deletion protocol review.
alter table public.trips add column if not exists deleting boolean not null default false;
alter table public.trips add column if not exists deletion_requested_at timestamptz;

alter table public.media drop constraint if exists path_belongs_to_owner;
alter table public.media add constraint path_belongs_to_trip check(
  storage_path ~ ('^' || user_id::text || '/' || trip_id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg|png)$')
);

create or replace function public.check_same_owner() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from public.trips t where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting)
 then raise exception 'Ce voyage n''appartient pas à cet utilisateur ou est en suppression'; end if;
 return new;
end $$;

create or replace function public.trip_accepts_writes(uid uuid, trip uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t join public.profiles p on p.id=t.user_id
   where t.id=trip and t.user_id=uid and not t.deleting and not p.deleting);
$$;
revoke execute on function public.trip_accepts_writes(uuid,uuid) from public,anon;
grant execute on function public.trip_accepts_writes(uuid,uuid) to authenticated;

drop policy if exists "storage ajouter" on storage.objects;
create policy "storage ajouter" on storage.objects for insert to authenticated with check(
 bucket_id='media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 and public.trip_accepts_writes(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

revoke delete on public.trips, public.media from authenticated;
revoke update on public.trips from authenticated;
grant update(country_code,cities,entry_date,exit_date,purpose,note,is_favorite,is_domestic) on public.trips to authenticated;

create or replace view public.travel_history_pdf with(security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose
from public.trips where not is_domestic and not deleting;
