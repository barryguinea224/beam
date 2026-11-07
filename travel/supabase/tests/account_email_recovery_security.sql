-- BTH account recovery on a disposable Supabase project ONLY.
-- No real customer data or credentials; all data is ROLLED BACK.
\set ON_ERROR_STOP on
begin;

-- Preflight privileges and owner: public, anon, authenticated, service_role denied.
do $grants$
declare r text;
begin
 if not has_function_privilege('postgres',
   'private.beam_change_client_email(text,text,text)','EXECUTE') then
  raise exception 'BEAM_POSTGRES_CANNOT_RECOVER';end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,
    'private.beam_change_client_email(text,text,text)','EXECUTE') or
     has_function_privilege(r,
    'private.beam_email_change_history(text)','EXECUTE') or
     has_table_privilege(r,'private.account_email_changes','SELECT') or
     has_table_privilege(r,'private.account_email_changes','INSERT') or
     has_table_privilege(r,'private.account_email_changes','UPDATE') or
     has_table_privilege(r,'private.account_email_changes','DELETE') then
   raise exception 'BEAM_RECOVERY_ROLE_GRANTED: %',r;end if;
 end loop;
 if (select p.prosecdef from pg_proc p
   where p.oid='private.beam_change_client_email(text,text,text)'::regprocedure) is distinct from true
 then raise exception 'BEAM_RECOVERY_NOT_SECURITY_DEFINER';end if;
 if (select pg_get_userbyid(p.proowner) from pg_proc p
   where p.oid='private.beam_change_client_email(text,text,text)'::regprocedure)<>'postgres'
 then raise exception 'BEAM_RECOVERY_WRONG_OWNER';end if;
end $grants$;

-- Confirm calls are denied even when private USAGE is granted by BTH for
-- unrelated account-write RLS functions. A schema permission error also counts.
set local role anon;
do $anonymous$
begin
 begin
  perform private.beam_change_client_email('a@example.com','b@example.com','Verified in person');
  raise exception 'ANON_WAS_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform private.beam_email_change_history('a@example.com');
  raise exception 'ANON_HISTORY_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform 1 from private.account_email_changes;
  raise exception 'ANON_AUDIT_READ_ALLOWED';
 exception when insufficient_privilege then null;end;
end $anonymous$;
reset role;
set local role authenticated;
do $authenticated$
begin
 begin
  perform private.beam_change_client_email('a@example.com','b@example.com','Verified in person');
  raise exception 'AUTHENTICATED_WAS_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform private.beam_email_change_history('a@example.com');
  raise exception 'AUTHENTICATED_HISTORY_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform 1 from private.account_email_changes;
  raise exception 'AUTHENTICATED_AUDIT_READ_ALLOWED';
 exception when insufficient_privilege then null;end;
end $authenticated$;
reset role;
set local role service_role;
do $service_role$
begin
 begin
  perform private.beam_change_client_email('a@example.com','b@example.com','Verified in person');
  raise exception 'SERVICE_ROLE_WAS_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform private.beam_email_change_history('a@example.com');
  raise exception 'SERVICE_ROLE_HISTORY_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  perform 1 from private.account_email_changes;
  raise exception 'SERVICE_ROLE_AUDIT_READ_ALLOWED';
 exception when insufficient_privilege then null;end;
end $service_role$;
reset role;

insert into auth.users(id,email,email_confirmed_at) values
 ('b8000000-0000-4000-8000-000000000001','client-ancien@example.com',now()),
 ('b8000000-0000-4000-8000-000000000002','email-occupe@example.com',now()),
 ('b8000000-0000-4000-8000-000000000003','compte-suppression@example.com',now());
insert into auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at)
values
 ('b8100000-0000-4000-8000-000000000001',
  'b8000000-0000-4000-8000-000000000001','email',
  'b8000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub','b8000000-0000-4000-8000-000000000001',
                     'email','client-ancien@example.com','email_verified',true),now(),now()),
 ('b8100000-0000-4000-8000-000000000002',
  'b8000000-0000-4000-8000-000000000002','email',
  'b8000000-0000-4000-8000-000000000002',
  jsonb_build_object('sub','b8000000-0000-4000-8000-000000000002',
                     'email','email-occupe@example.com','email_verified',true),now(),now()),
 ('b8100000-0000-4000-8000-000000000003',
  'b8000000-0000-4000-8000-000000000003','email',
  'b8000000-0000-4000-8000-000000000003',
  jsonb_build_object('sub','b8000000-0000-4000-8000-000000000003',
                     'email','compte-suppression@example.com','email_verified',true),now(),now());

update public.profiles set display_name='Client fictif',access_until=current_date+100
 where id='b8000000-0000-4000-8000-000000000001';
update public.profiles set deleting=true,deletion_requested_at=now()
 where id='b8000000-0000-4000-8000-000000000003';
insert into public.trips(id,user_id,country_code,cities,entry_date,exit_date,purpose)
 values('b8200000-0000-4000-8000-000000000001',
  'b8000000-0000-4000-8000-000000000001','FR',array['Paris'],
  '2025-06-01','2025-06-07','tourisme');
insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
 values('b8300000-0000-4000-8000-000000000001',
  'b8200000-0000-4000-8000-000000000001',
  'b8000000-0000-4000-8000-000000000001',
  'media/b8000000-0000-4000-8000-000000000001/b8300000-0000-4000-8000-000000000001.webp',
  'photo',1024);

-- Session fixture + historical refresh token: one grant per session.
insert into auth.sessions(id,user_id,created_at,updated_at)
 values('b8400000-0000-4000-8000-000000000001',
  'b8000000-0000-4000-8000-000000000001',now(),now());
insert into auth.refresh_tokens("token",user_id,session_id,revoked)
 values('fixture-non-secret-token-before-rotation',
  'b8000000-0000-4000-8000-000000000001',
  'b8400000-0000-4000-8000-000000000001',false);

do $successful$
declare message text; uuid_before uuid:='b8000000-0000-4000-8000-000000000001';
begin
 message:=private.beam_change_client_email(
  ' CLIENT-ANCIEN@example.com ',' CLIENT-NOUVEAU@example.com ',
  'Vérifié en agence avec CNI et deux voyages fictifs.');
 if message not like 'E-mail changé pour Client fictif : client-ancien@example.com → client-nouveau@example.com.%'
 then raise exception 'BEAM_WRONG_RETURN_MESSAGE: %',message;end if;
 if not exists(select 1 from auth.users u where u.id=uuid_before and
  u.email='client-nouveau@example.com' and u.email_confirmed_at is not null)
 then raise exception 'BEAM_NEW_EMAIL_NOT_LOGIN_READY';end if;
 if exists(select 1 from auth.users u where u.email='client-ancien@example.com')
 then raise exception 'BEAM_OLD_EMAIL_STILL_WORKS';end if;
 if not exists(select 1 from auth.identities i where i.user_id=uuid_before and
  i.provider='email' and i.provider_id=uuid_before::text and
  i.identity_data->>'email'='client-nouveau@example.com' and
  i.email='client-nouveau@example.com')
 then raise exception 'BEAM_AUTH_IDENTITY_NOT_UPDATED';end if;
 if exists(select 1 from auth.sessions s where s.user_id=uuid_before)
  or exists(select 1 from auth.refresh_tokens t where t.user_id=uuid_before::text)
 then raise exception 'BEAM_SESSIONS_NOT_REVOKED';end if;
 if not exists(select 1 from public.trips where user_id=uuid_before and
   id='b8200000-0000-4000-8000-000000000001')
  or not exists(select 1 from public.media where user_id=uuid_before and
   trip_id='b8200000-0000-4000-8000-000000000001')
 then raise exception 'BEAM_EXISTING_DATA_LOST';end if;
 if (select count(*) from private.account_email_changes where user_id=uuid_before)<>1
  or not exists(select 1 from private.account_email_changes
    where user_id=uuid_before and old_email='client-ancien@example.com'
     and new_email='client-nouveau@example.com' and changed_by='postgres')
 then raise exception 'BEAM_AUDIT_MISSING';end if;
end $successful$;

-- All refusals must not change e-mail or add audit rows.
do $refusals$
declare rejected boolean;
begin
 rejected:=false;
 begin perform private.beam_change_client_email(
  'client-nouveau@example.com','email-occupe@example.com','Vérifié en agence avec une CNI.');
 exception when unique_violation then rejected:=true;end;
 if not rejected then raise exception 'BEAM_DUPLICATE_EMAIL_ACCEPTED';end if;

 rejected:=false;
 begin perform private.beam_change_client_email(
  'introuvable@example.com','nouveau@example.com','Vérifié en agence avec une CNI.');
 exception when no_data_found then rejected:=true;end;
 if not rejected then raise exception 'BEAM_UNKNOWN_EMAIL_ACCEPTED';end if;

 rejected:=false;
 begin perform private.beam_change_client_email(
  'client-nouveau@example.com','adresse-invalide','Vérifié en agence avec une CNI.');
 exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'BEAM_INVALID_EMAIL_ACCEPTED';end if;

 rejected:=false;
 begin perform private.beam_change_client_email(
  'client-nouveau@example.com','encore@example.com','CNI');
 exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'BEAM_SHORT_REASON_ACCEPTED';end if;

 rejected:=false;
 begin perform private.beam_change_client_email(
  'compte-suppression@example.com','relance@example.com','Vérifié en agence avec une CNI.');
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'BEAM_DELETING_ACCOUNT_ACCEPTED';end if;

 if (select count(*) from private.account_email_changes)<>1 then
  raise exception 'BEAM_REFUSAL_CREATED_AUDIT_ROW';end if;
end $refusals$;

-- Deliberately fail AFTER auth.users and identities have changed and
-- AFTER session deletions, at the final audit INSERT. The function must
-- roll back everything, including the session and refresh token removals.
create function private.email_recovery_test_audit_failure()
returns trigger language plpgsql as $$
begin
 if new.new_email='echec-milieu@example.com' then
  raise exception using errcode='P0001',message='FORCED_AUDIT_ROLLBACK_FIXTURE';
 end if;
 return new;
end $$;
create trigger email_recovery_test_failure before insert on private.account_email_changes
 for each row execute function private.email_recovery_test_audit_failure();
insert into auth.sessions(id,user_id,created_at,updated_at)
 values('b8400000-0000-4000-8000-000000000002',
  'b8000000-0000-4000-8000-000000000001',now(),now());
insert into auth.refresh_tokens("token",user_id,session_id,revoked)
 values('fixture-non-secret-token-for-rollback',
 'b8000000-0000-4000-8000-000000000001',
 'b8400000-0000-4000-8000-000000000002',false);
do $atomic$
declare rejected boolean:=false;
begin
 begin
  perform private.beam_change_client_email('client-nouveau@example.com',
    'echec-milieu@example.com','Vérification en personne avec deux voyages fictifs.');
 exception when raise_exception then
  rejected:=true;
 end;
 if not rejected then raise exception 'BEAM_FORCED_AUDIT_FAILURE_NOT_DETECTED';end if;
 if not exists(select 1 from auth.users where email='client-nouveau@example.com')
  or exists(select 1 from auth.users where email='echec-milieu@example.com')
  or not exists(select 1 from auth.identities
    where identity_data->>'email'='client-nouveau@example.com')
  or not exists(select 1 from auth.sessions
    where id='b8400000-0000-4000-8000-000000000002')
  or not exists(select 1 from auth.refresh_tokens
    where token='fixture-non-secret-token-for-rollback')
  or (select count(*) from private.account_email_changes)<>1 then
  raise exception 'BEAM_ATOMIC_ROLLBACK_FAILED';end if;
end $atomic$;
drop trigger email_recovery_test_failure on private.account_email_changes;
drop function private.email_recovery_test_audit_failure();

-- History by old, new and intermediate email follows the same auth UUID.
do $history$
declare c1 integer;c2 integer;
begin
 select count(*) into c1 from private.beam_email_change_history('client-ancien@example.com');
 select count(*) into c2 from private.beam_email_change_history('client-nouveau@example.com');
 if c1<>1 or c2<>1 then raise exception 'BEAM_HISTORY_LOOKUP_FAILED';end if;
end $history$;

rollback;
\echo 'PASS BTH recovery: postgres-only, Auth identity consistency, retained trips/photos, sessions, audit, refusals and atomic rollback'
