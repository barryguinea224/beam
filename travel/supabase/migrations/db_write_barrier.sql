-- BEAM Travel History — database write barrier during account deletion
--
-- Problem: trips / activities / media policies were FOR ALL with only user_id = auth.uid().
-- While profiles.deleting = true, a still-valid session could keep writing rows during an
-- interrupted deletion. Storage was already guarded by account_accepts_writes(); the database
-- was not.
--
-- Fix: split each FOR ALL policy. Reads stay owner-only (a deleting account can still be shown
-- "suppression en cours"); every write additionally requires account_accepts_writes(auth.uid()).
-- Existing column/table grants are unchanged (trips/media DELETE stay server-only).
--
-- Idempotent: safe to run twice. Apply on STAGING first (SQL editor), then run the benches.

begin;

-- trips -------------------------------------------------------------------------------------
drop policy if exists "voyages propriétaire" on public.trips;
drop policy if exists "voyages lecture" on public.trips;
drop policy if exists "voyages création" on public.trips;
drop policy if exists "voyages modification" on public.trips;

create policy "voyages lecture" on public.trips for select to authenticated
  using (user_id = auth.uid());
create policy "voyages création" on public.trips for insert to authenticated
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()));
create policy "voyages modification" on public.trips for update to authenticated
  using (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and not deleting)
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and not deleting);
-- No DELETE policy: trip deletion goes through travel-delete (service role) only.

-- activities --------------------------------------------------------------------------------
drop policy if exists "activités propriétaire" on public.activities;
drop policy if exists "activités lecture" on public.activities;
drop policy if exists "activités création" on public.activities;
drop policy if exists "activités modification" on public.activities;
drop policy if exists "activités suppression" on public.activities;

create policy "activités lecture" on public.activities for select to authenticated
  using (user_id = auth.uid());
create policy "activités création" on public.activities for insert to authenticated
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités modification" on public.activities for update to authenticated
  using (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id))
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "activités suppression" on public.activities for delete to authenticated
  using (user_id = auth.uid() and public.account_accepts_writes(auth.uid()));

-- media -------------------------------------------------------------------------------------
drop policy if exists "médias propriétaire" on public.media;
drop policy if exists "médias lecture" on public.media;
drop policy if exists "médias création" on public.media;
drop policy if exists "médias modification" on public.media;

create policy "médias lecture" on public.media for select to authenticated
  using (user_id = auth.uid());
create policy "médias création" on public.media for insert to authenticated
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
create policy "médias modification" on public.media for update to authenticated
  using (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id))
  with check (user_id = auth.uid() and public.account_accepts_writes(auth.uid()) and public.trip_accepts_writes(auth.uid(), trip_id));
-- No DELETE policy: photo deletion goes through travel-delete (service role) only.

-- profiles: harmless fields only, but no writes at all once deletion has started -----------
drop policy if exists "profil modification" on public.profiles;
create policy "profil modification" on public.profiles for update to authenticated
  using (id = auth.uid() and public.account_accepts_writes(auth.uid()))
  with check (id = auth.uid() and public.account_accepts_writes(auth.uid()));

commit;
