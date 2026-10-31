-- BEAM Travel History · optional declared profile contacts for factual PDF.
-- REVIEW ONLY: never apply this migration automatically to staging or production.
-- Apply explicitly after human security review, before enabling the new profile UI.
-- Re-runnable on staging; no access to Auth emails or changes to the factual view.
begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists postal_address text;

alter table public.profiles
  drop constraint if exists profiles_phone_valid,
  drop constraint if exists profiles_postal_address_valid;

alter table public.profiles
  add constraint profiles_phone_valid
    check (phone is null or (char_length(phone)<=30 and phone ~ '^\+[0-9]{6,15}$')),
  add constraint profiles_postal_address_valid
    check (postal_address is null or
      (char_length(postal_address)<=300 and btrim(postal_address)<>'' ));

-- Existing RLS remains owner-only and forbids writes on deleted accounts.
-- Reaffirm both WITH CHECK and USING after previous SQL hardening migrations.
alter table public.profiles enable row level security;
alter policy "profil modification" on public.profiles
  using (id=auth.uid() and private.account_accepts_writes(auth.uid()))
  with check (id=auth.uid() and private.account_accepts_writes(auth.uid()));

-- Column-level privileges, never a table-wide UPDATE grant.
revoke update on public.profiles from authenticated;
-- Preserve the existing profile-column permissions, especially display_name.
grant update(display_name,nationality,home_city,country_of_residence,phone,postal_address)
  on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- Intentionally no access to auth.users, no new RPC, no profile INSERT/DELETE,
-- and no modification to the security_invoker travel_history_pdf projection.
commit;
