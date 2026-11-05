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
