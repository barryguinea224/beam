-- Regression tests for the canonical schema and the reviewed migration.
-- Disposable PostgreSQL only; the fixture deliberately changes auth.uid().
begin;
-- On the real Supabase local stack auth.uid() already exists and belongs to
-- Supabase Auth. Never replace a protected built-in in this disposable fixture.
-- A minimal standalone PostgreSQL fixture may still create it when absent.
do $auth_fixture$
begin
 if to_regprocedure('auth.uid()') is null or exists (
   select 1 from pg_proc
    where oid=to_regprocedure('auth.uid()')
      and pg_get_userbyid(proowner)=current_user
 ) then
   execute format('CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS %L',
     $body$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$body$);
 end if;
end $auth_fixture$;

do $$
declare f record;
begin
  if to_regprocedure('public.account_accepts_writes(uuid)') is not null
     or to_regprocedure('public.trip_accepts_writes(uuid,uuid)') is not null then
    raise exception 'PUBLIC_PRIVILEGED_RLS_RPC_STILL_PRESENT';
  end if;
  if to_regprocedure('private.account_accepts_writes(uuid)') is null
     or to_regprocedure('private.trip_accepts_writes(uuid,uuid)') is null then
    raise exception 'PRIVATE_RLS_GUARDS_NOT_INSTALLED';
  end if;
  if has_function_privilege('anon','private.account_accepts_writes(uuid)','EXECUTE')
     or has_function_privilege('anon','private.trip_accepts_writes(uuid,uuid)','EXECUTE') then
    raise exception 'ANON_CAN_CALL_PRIVATE_GUARDS';
  end if;
  if not has_function_privilege('authenticated','private.account_accepts_writes(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','private.trip_accepts_writes(uuid,uuid)','EXECUTE') then
    raise exception 'AUTHENTICATED_RLS_GUARDS_NOT_EXECUTABLE';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and cmd in ('DELETE','ALL') and 'authenticated'=any(roles)
  ) then
    raise exception 'DIRECT_CLIENT_STORAGE_DELETE_POLICY_PRESENT';
  end if;
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prosecdef
  loop
    if has_function_privilege('anon',f.oid,'EXECUTE')
       or has_function_privilege('authenticated',f.oid,'EXECUTE') then
      raise exception 'PUBLIC_DEFINER_EXECUTE_EXPOSED: %', f.proname;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
    ('check_same_owner','check_trip_dates','touch_updated_at','handle_new_user')
      and not exists (select 1 from unnest(p.proconfig) cfg
        where cfg='search_path=""' or cfg='search_path=')
  ) then
    raise exception 'TRIGGER_FUNCTION_SEARCH_PATH_MUTABLE';
  end if;
end $$;

insert into auth.users(id) values
  ('71111111-1111-4111-8111-111111111111'),
  ('72222222-2222-4222-8222-222222222222');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
values('73333333-3333-4333-8333-333333333333',
       '71111111-1111-4111-8111-111111111111',
       'GN','2020-01-01','2020-01-02','autre');

grant usage on schema public,private to authenticated;
do $auth_usage_fixture$
begin
 if not has_schema_privilege('authenticated','auth','USAGE') then
   execute 'grant usage on schema auth to authenticated';
 end if;
end $auth_usage_fixture$;
grant execute on function auth.uid() to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);
do $$
begin
  if not private.account_accepts_writes('71111111-1111-4111-8111-111111111111') then
    raise exception 'OWN_ACCOUNT_WRITE_DENIED';
  end if;
  if private.account_accepts_writes('72222222-2222-4222-8222-222222222222') then
    raise exception 'OTHER_ACCOUNT_STATUS_LEAK';
  end if;
  if not private.trip_accepts_writes(
      '71111111-1111-4111-8111-111111111111',
      '73333333-3333-4333-8333-333333333333') then
    raise exception 'OWN_TRIP_WRITE_DENIED';
  end if;
  if private.trip_accepts_writes(
      '72222222-2222-4222-8222-222222222222',
      '73333333-3333-4333-8333-333333333333') then
    raise exception 'OTHER_USER_TRIP_STATUS_LEAK';
  end if;
end $$;
rollback;
