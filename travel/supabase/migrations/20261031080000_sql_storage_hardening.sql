-- BEAM Travel History — Audit A hardening (review required before STAGING deployment)
-- No storage object is removed by this migration. It only changes the authorizations.
-- Migration is idempotent. Apply on STAGING first, then run RLS / deletion hostile benches.
begin;

-- 1. Move the two privileged RLS predicates out of the exposed public RPC schema.
-- They also deny attempts to evaluate another user's account or trip status.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.account_accepts_writes(uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select uid = (select auth.uid())
    and exists(select 1 from public.profiles p where p.id=uid and not p.deleting);
$$;
revoke execute on function private.account_accepts_writes(uuid) from public,anon,authenticated;
grant execute on function private.account_accepts_writes(uuid) to authenticated;

create or replace function private.trip_accepts_writes(uid uuid, trip uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select uid = (select auth.uid())
    and exists(select 1 from public.trips t join public.profiles p on p.id=t.user_id
      where t.id=trip and t.user_id=uid and not t.deleting and not p.deleting);
$$;
revoke execute on function private.trip_accepts_writes(uuid,uuid) from public,anon,authenticated;
grant execute on function private.trip_accepts_writes(uuid,uuid) to authenticated;

-- 2. Replace all RLS dependencies before removing the obsolete public functions.
alter policy "profil modification" on public.profiles
  using (id=auth.uid() and private.account_accepts_writes(auth.uid()))
  with check (id=auth.uid() and private.account_accepts_writes(auth.uid()));

alter policy "voyages création" on public.trips
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid()));
alter policy "voyages modification" on public.trips
  using (user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and not deleting)
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid()) and not deleting);

alter policy "activités création" on public.activities
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id));
alter policy "activités modification" on public.activities
  using (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id))
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id));
alter policy "activités suppression" on public.activities
  using (user_id=auth.uid() and private.account_accepts_writes(auth.uid()));

alter policy "médias création" on public.media
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id));
alter policy "médias modification" on public.media
  using (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id))
  with check (user_id=auth.uid() and private.account_accepts_writes(auth.uid())
    and private.trip_accepts_writes(auth.uid(),trip_id));

alter policy "storage lire" on storage.objects
  using (
    bucket_id='media'
    and (storage.foldername(name))[1]=auth.uid()::text
    and private.account_accepts_writes(auth.uid())
  );
alter policy "storage ajouter" on storage.objects
  with check (
    bucket_id='media'
    and (storage.foldername(name))[1]=auth.uid()::text
    and private.trip_accepts_writes(
      auth.uid(),
      case
        when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid
        else null
      end
    )
    and exists (
      select 1 from public.media m
      where m.storage_path=storage.objects.name and m.user_id=auth.uid()
    )
  );

-- 3. Browser must never DELETE a Storage object: service-role travel-delete
-- removes and verifies it first, then deletes the media row.
drop policy if exists "storage supprimer" on storage.objects;

-- Do not allow a public definer RPC even if a previous migration created one.
drop function if exists public.account_accepts_writes(uuid);
drop function if exists public.trip_accepts_writes(uuid,uuid);

-- 4. Staging advisor drift: pin trigger function paths and close direct RPC grants.
alter function public.check_same_owner() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.check_trip_dates() set search_path = '';
alter function public.touch_updated_at() set search_path = '';
revoke execute on function public.check_same_owner(), public.handle_new_user(),
  public.check_trip_dates(), public.touch_updated_at()
  from public, anon, authenticated;

commit;
