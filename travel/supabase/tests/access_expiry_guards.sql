-- Expiration de l'accès : tests RLS exécutables uniquement sur une base Supabase locale jetable.
-- Tester les appels SQL équivalents aux appels directs PostgREST/Storage du rôle authenticated.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('ac000000-0000-4000-8000-000000000001','active-access-fixture@example.test'),
 ('ac000000-0000-4000-8000-000000000002','expired-access-fixture@example.test'),
 ('ac000000-0000-4000-8000-000000000003','null-access-fixture@example.test');
update public.profiles set access_until=(current_date+interval '2 years')::date
 where id in ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
 ('ac100000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','FR','2024-01-01','2024-01-05','tourisme'),
 ('ac100000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000002','MA','2024-01-01','2024-01-05','tourisme'),
 ('ac100000-0000-4000-8000-000000000003','ac000000-0000-4000-8000-000000000003','GN','2024-01-01','2024-01-05','tourisme');
insert into public.activities(id,trip_id,user_id,title) values
 ('ac200000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000002','Souvenir');
insert into public.media(id,trip_id,user_id,storage_path,kind,bytes) values
 ('ac300000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000002',
  'ac000000-0000-4000-8000-000000000002',
  'ac000000-0000-4000-8000-000000000002/ac100000-0000-4000-8000-000000000002/ac300000-0000-4000-8000-000000000002.webp',
  'photo',1024),
 ('ac300000-0000-4000-8000-000000000003','ac100000-0000-4000-8000-000000000002',
  'ac000000-0000-4000-8000-000000000002',
  'ac000000-0000-4000-8000-000000000002/ac100000-0000-4000-8000-000000000002/ac300000-0000-4000-8000-000000000003.webp',
  'photo',1024);
-- In local CI, required public/storage read grants are granted only in the rollback fixture.
grant usage on schema public,private to authenticated;
grant select on public.profiles,public.trips,public.activities,public.media,public.travel_history_pdf to authenticated;
do $grants$
begin
 if not has_schema_privilege('authenticated','storage','USAGE')
 then grant usage on schema storage to authenticated; end if;
 if not has_table_privilege('authenticated','storage.objects','SELECT')
 then grant select on storage.objects to authenticated; end if;
 if not has_table_privilege('authenticated','storage.objects','INSERT')
 then grant insert on storage.objects to authenticated; end if;
end $grants$;
-- Reserve and upload photo BEFORE the account expires.
set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
insert into storage.objects(id,bucket_id,name,owner,owner_id) values
 ('ac400000-0000-4000-8000-000000000002','media',
  'ac000000-0000-4000-8000-000000000002/ac100000-0000-4000-8000-000000000002/ac300000-0000-4000-8000-000000000002.webp',
  'ac000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000002');
reset role;
update public.profiles set access_until=current_date-1
 where id='ac000000-0000-4000-8000-000000000002';

-- Fail-closed semantics: expired AND NULL are not writable.
do $invariants$
begin
 if has_column_privilege('authenticated','public.profiles','access_until','UPDATE')
 then raise exception 'EXPIRED_USER_CAN_EXTEND_ACCESS'; end if;
 if not has_column_privilege('authenticated','public.profiles','access_until','SELECT')
 then raise exception 'EXPIRED_USER_CANNOT_SEE_END_DATE'; end if;
 if not exists (select 1 from pg_policies where schemaname='storage'
   and tablename='objects' and policyname='storage lire' and qual not like '%account_accepts_writes%')
 then raise exception 'STORAGE_READ_REQUIRES_WRITE_PERMISSION'; end if;
end $invariants$;

set local role authenticated;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
do $expired$
declare rejected boolean; affected integer;
begin
 if private.account_accepts_writes(auth.uid()) then raise exception 'EXPIRED_WRITE_ALLOWED'; end if;
 if (select count(*) from public.trips where user_id=auth.uid())<>1
    or (select count(*) from public.activities where user_id=auth.uid())<>1
    or (select count(*) from public.media where user_id=auth.uid())<>2
    or (select count(*) from public.travel_history_pdf where user_id=auth.uid())<>1
 then raise exception 'EXPIRED_READ_OR_PDF_VIEW_DENIED'; end if;
 if (select access_until from public.profiles where id=auth.uid()) is null
 then raise exception 'EXPIRED_PROFILE_DATE_HIDDEN'; end if;
 if (select count(*) from storage.objects where bucket_id='media'
    and (storage.foldername(name))[1]=auth.uid()::text)<>1
 then raise exception 'EXPIRED_PRIVATE_PHOTO_HIDDEN'; end if;

 -- Each INSERT triggers RLS rejection (direct API attempt), not merely UI hide.
 rejected:=false;
 begin
   insert into public.trips(user_id,country_code,entry_date,exit_date,purpose)
    values(auth.uid(),'FR','2025-06-01','2025-06-03','tourisme');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'EXPIRED_TRIP_INSERT_SUCCEEDED'; end if;

 update public.trips set note='API direct' where user_id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'EXPIRED_TRIP_UPDATE_SUCCEEDED'; end if;

 rejected:=false;
 begin
  insert into public.activities(trip_id,user_id,title)
   values('ac100000-0000-4000-8000-000000000002',auth.uid(),'API direct');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'EXPIRED_ACTIVITY_INSERT_SUCCEEDED'; end if;
 update public.activities set title='API direct' where user_id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'EXPIRED_ACTIVITY_UPDATE_SUCCEEDED'; end if;
 delete from public.activities where user_id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'EXPIRED_ACTIVITY_DELETE_SUCCEEDED'; end if;

 rejected:=false;
 begin
  insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
   values('ac300000-0000-4000-8000-000000000004',
     'ac100000-0000-4000-8000-000000000002',auth.uid(),
     auth.uid()::text||'/ac100000-0000-4000-8000-000000000002/ac300000-0000-4000-8000-000000000004.webp','photo',500);
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'EXPIRED_MEDIA_INSERT_SUCCEEDED'; end if;
 update public.media set caption='API direct' where user_id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'EXPIRED_MEDIA_UPDATE_SUCCEEDED'; end if;

 rejected:=false;
 begin
  insert into storage.objects(id,bucket_id,name,owner,owner_id) values
   ('ac400000-0000-4000-8000-000000000003','media',
    'ac000000-0000-4000-8000-000000000002/ac100000-0000-4000-8000-000000000002/ac300000-0000-4000-8000-000000000003.webp',
    auth.uid()::text,auth.uid()::text);
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'EXPIRED_STORAGE_UPLOAD_SUCCEEDED'; end if;

 update public.profiles set display_name='API direct' where id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'EXPIRED_PROFILE_UPDATE_SUCCEEDED'; end if;
 rejected:=false;
 begin
  update public.profiles set access_until=current_date+365 where id=auth.uid();
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'CLIENT_CAN_EXTEND_ITS_OWN_EXPIRY'; end if;
end $expired$;

-- Other-account isolation remains intact and NULL is always read-only.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
do $null$
begin
 if private.account_accepts_writes(auth.uid()) then raise exception 'NULL_ACCESS_WRITE_ALLOWED'; end if;
 if exists (select 1 from public.trips where user_id='ac000000-0000-4000-8000-000000000002')
 then raise exception 'EXPIRED_OTHER_OWNER_TRIPS_LEAK'; end if;
end $null$;

-- An active client still has all of its original rights.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
do $active$
declare id uuid; affected int;
begin
 if not private.account_accepts_writes(auth.uid()) then raise exception 'ACTIVE_WRITE_DENIED'; end if;
 insert into public.trips(user_id,country_code,entry_date,exit_date,purpose)
  values(auth.uid(),'ES','2025-08-01','2025-08-05','tourisme') returning id into id;
 update public.trips set note='ok' where id=id;
 insert into public.activities(trip_id,user_id,title) values(id,auth.uid(),'Nouvelle activité');
 update public.profiles set display_name='Client actif' where id=auth.uid();
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'ACTIVE_PROFILE_UPDATE_DENIED'; end if;
end $active$;

-- Server-only deletion remains possible even for expired accounts:
-- service_role bypasses RLS as travel-delete does, without exposing browser DELETE.
reset role;
do $delete$
declare accepted int;
begin
 if has_table_privilege('authenticated','public.trips','DELETE') or
    has_table_privilege('authenticated','public.media','DELETE')
 then raise exception 'DIRECT_CLIENT_DELETE_EXPOSED'; end if;
 if not (select rolbypassrls from pg_roles where rolname='service_role')
 then raise exception 'DELETION_SERVICE_ROLE_CANNOT_BYPASS_RLS'; end if;
end $delete$;
set local role service_role;
delete from public.activities where user_id='ac000000-0000-4000-8000-000000000002';
-- The deletion worker still owns the explicit Storage-then-row cleanup protocol.
rollback;
\echo 'PASS expiry: direct API writes blocked, expired reads/photos/PDF view, active edits, service-only deletion'
