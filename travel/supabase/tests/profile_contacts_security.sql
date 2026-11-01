-- Disposable Postgres ONLY. Never connect this test to staging.
-- Run after canonical schema and the review-only optional contacts migration.
\set ON_ERROR_STOP on
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
   execute 'create function auth.uid() returns uuid language sql stable as $ select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid $';
 end if;
end $auth_fixture$;

-- Fixtures can be inserted only as postgres. The trigger creates each profile.
insert into auth.users(id,raw_user_meta_data) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','{}');
update public.profiles
 set deleting=true,deletion_requested_at=now()
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- Supabase supplies these default table permissions in production. The
-- minimal CI database has no Supabase default privileges: grant SELECT only
-- here so UPDATE+SELECT RLS behavior can be verified as in the real API.
grant usage on schema public,private to authenticated;
grant select on public.profiles to authenticated;

do $$
begin
 if not (select relrowsecurity from pg_class where oid='public.profiles'::regclass)
   then raise exception 'RLS must remain enabled'; end if;
 if has_table_privilege('authenticated','public.profiles','UPDATE')
   then raise exception 'table-wide UPDATE would bypass column grants'; end if;
 if not has_column_privilege('authenticated','public.profiles','phone','UPDATE')
    or not has_column_privilege('authenticated','public.profiles','postal_address','UPDATE')
   then raise exception 'new columns must be individually writable'; end if;
 if has_column_privilege('authenticated','public.profiles','deleting','UPDATE')
   or has_column_privilege('authenticated','public.profiles','id','UPDATE')
   then raise exception 'privileged profile columns must remain non-writable'; end if;
 if has_table_privilege('anon','public.profiles','SELECT')
    or has_column_privilege('anon','public.profiles','phone','UPDATE')
   then raise exception 'anonymous role must not access contacts'; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles'
   and policyname='profil modification' and cmd='UPDATE'
   and qual like '%private.account_accepts_writes%')
   then raise exception 'owner and deletion RLS predicates missing'; end if;
 if exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='travel_history_pdf'
     and column_name in ('phone','postal_address','email'))
   then raise exception 'factual view must never carry contacts'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-- Account A may update only its own optional data.
update public.profiles
 set phone='+224612345678',postal_address='Conakry, Guinée'
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$
declare count_rows int;
begin
 select count(*) into count_rows from public.profiles
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   and phone='+224612345678' and postal_address='Conakry, Guinée';
 if count_rows<>1 then raise exception 'owner update failed';end if;
 -- A cannot write to B, even if they guess the UUID.
 update public.profiles set phone='+224600000000'
 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 get diagnostics count_rows=row_count;
 if count_rows<>0 then raise exception 'cross-owner profile update succeeded';end if;
end $$;

-- Phone needs an international + and digits only.
do $$
declare blocked boolean;
begin
 blocked=false;
 begin
  update public.profiles set phone='612 345 678'
   where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 exception when check_violation then blocked=true; end;
 if not blocked then raise exception 'phone with spaces bypassed check';end if;
 blocked=false;
 begin
  update public.profiles set phone='+'||repeat('8',30)
   where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 exception when check_violation then blocked=true; end;
 if not blocked then raise exception '31-char phone bypassed check';end if;
 blocked=false;
 begin
  update public.profiles set postal_address=repeat('a',301)
   where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 exception when check_violation then blocked=true; end;
 if not blocked then raise exception 'overlong address bypassed check';end if;
 blocked=false;
 begin
  update public.profiles set deleting=true
   where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'protected deleting column was editable';end if;
end $$;

-- A locked account cannot change its declared data.
set local request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$
declare changed int;
begin
 update public.profiles set phone='+224600000000'
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'locked account wrote contacts';end if;
end $$;
rollback;
\echo 'PASS optional contact length/format checks, per-column privileges, owner-only/locked RLS and unchanged factual view'
