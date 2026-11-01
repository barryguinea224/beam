-- BEAM Travel History — expiry read-only, to run in SQL Editor before app merge.
-- NULL access_until makes all pre-existing accounts read-only until admin assigns a date.
begin;
alter table public.profiles add column if not exists access_until date;
revoke update(access_until) on public.profiles from authenticated;
create or replace function private.account_accepts_writes(uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select uid = (select auth.uid())
    and exists(select 1 from public.profiles p
      where p.id=uid and not p.deleting and p.access_until >= current_date);
$$;
create or replace function private.trip_accepts_writes(uid uuid, trip uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.account_accepts_writes(uid)
    and exists(select 1 from public.trips t
      where t.id=trip and t.user_id=uid and not t.deleting);
$$;
drop policy if exists "storage lire" on storage.objects;
create policy "storage lire" on storage.objects for select to authenticated using(
 bucket_id='media' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.profiles p where p.id=auth.uid() and not p.deleting));
commit;
