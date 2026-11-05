-- Local disposable Supabase only. Idempotent visual roles with owner+trip FK.
-- Simulate the authenticated Data API, never connect to staging or production.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('b1000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000002');
update public.profiles set access_until=current_date+365
 where id in ('b1000000-0000-4000-8000-000000000001',
              'b1000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','FR','2024-01-01','2024-01-05','tourisme'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','MA','2024-02-01','2024-02-05','tourisme'),
 ('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','SN','2024-01-01','2024-01-05','tourisme');
insert into public.media(id,user_id,trip_id,storage_path,kind,bytes) values
 ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001/b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001.webp','photo',512),
 ('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001/b2000000-0000-4000-8000-000000000002/b3000000-0000-4000-8000-000000000002.webp','photo',512),
 ('b3000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002/b2000000-0000-4000-8000-000000000003/b3000000-0000-4000-8000-000000000003.webp','photo',512);

do $preflight$
declare k text;
begin
 foreach k in array array['airline','hotel'] loop
  if not exists(select 1 from pg_constraint where
    conrelid='public.trips'::regclass and conname='trips_'||k||'_media_same_trip_owner'
    and contype='f') then raise exception 'MISSING_ROLE_FK: %',k; end if;
  if not has_column_privilege('authenticated','public.trips',k||'_media_id','UPDATE')
  then raise exception 'MISSING_ROLE_GRANT: %',k; end if;
 end loop;
 if has_table_privilege('authenticated','public.media','DELETE')
   or has_column_privilege('authenticated','public.trips','user_id','UPDATE')
   or has_column_privilege('authenticated','public.trips','deleting','UPDATE')
 then raise exception 'UNSAFE_ROLE_GRANT'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='travel_history_pdf' and column_name in ('airline_media_id','hotel_media_id'))
 then raise exception 'STAY_ROLE_LEAK_TO_FACTUAL_PDF'; end if;
end $preflight$;

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);

-- Same source may be cover, airline and hotel at once, for SAME owner/trip.
update public.trips set
 cover_media_id='b3000000-0000-4000-8000-000000000001',
 airline_media_id='b3000000-0000-4000-8000-000000000001',
 hotel_media_id='b3000000-0000-4000-8000-000000000001'
where id='b2000000-0000-4000-8000-000000000001';
do $owner$
declare k text; rejected boolean; affected integer;
begin
 if (select count(*) from public.trips
   where id='b2000000-0000-4000-8000-000000000001'
    and cover_media_id='b3000000-0000-4000-8000-000000000001'
    and airline_media_id='b3000000-0000-4000-8000-000000000001'
    and hotel_media_id='b3000000-0000-4000-8000-000000000001')<>1
 then raise exception 'SAME_PHOTO_ROLES_FAILED'; end if;
 foreach k in array array['airline_media_id','hotel_media_id'] loop
  -- Same owner but different trip must fail for EACH reference.
  rejected:=false;
  begin
   execute format('update public.trips set %I=$1 where id=$2',k)
    using 'b3000000-0000-4000-8000-000000000002'::uuid,
          'b2000000-0000-4000-8000-000000000001'::uuid;
  exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'CROSS_TRIP_ROLE_ALLOWED: %',k; end if;
  -- Another owner's media must fail, even when the UUID is known.
  rejected:=false;
  begin
   execute format('update public.trips set %I=$1 where id=$2',k)
    using 'b3000000-0000-4000-8000-000000000003'::uuid,
          'b2000000-0000-4000-8000-000000000001'::uuid;
  exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'CROSS_OWNER_MEDIA_ROLE_ALLOWED: %',k; end if;
  -- Another owner's trip is invisible to the UPDATE (RLS).
  execute format('update public.trips set %I=$1 where id=$2',k)
   using 'b3000000-0000-4000-8000-000000000003'::uuid,
         'b2000000-0000-4000-8000-000000000003'::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'CROSS_OWNER_TRIP_ROLE_ALLOWED: %',k; end if;
 end loop;
end $owner$;
reset role;

-- Deleting a selected photo via privileged cleanup clears all role pointers.
delete from public.media where id='b3000000-0000-4000-8000-000000000001';
do $deleted$
begin
 if not exists(select 1 from public.trips
  where id='b2000000-0000-4000-8000-000000000001'
    and cover_media_id is null and airline_media_id is null and hotel_media_id is null)
 then raise exception 'DELETING_SELECTED_PHOTO_DID_NOT_CLEAR_ROLES'; end if;
 if (select count(*) from public.trips where user_id in (
   'b1000000-0000-4000-8000-000000000001'::uuid,
   'b1000000-0000-4000-8000-000000000002'::uuid))<>3
 then raise exception 'PHOTO_DELETE_REMOVED_TRIP'; end if;
end $deleted$;

-- Account/trip cascading deletion must still work with BOTH selected roles.
update public.trips set
 airline_media_id='b3000000-0000-4000-8000-000000000002',
 hotel_media_id='b3000000-0000-4000-8000-000000000002'
 where id='b2000000-0000-4000-8000-000000000002';
delete from public.trips where id='b2000000-0000-4000-8000-000000000002';
do $cascade$
begin
 if exists(select 1 from public.media where id='b3000000-0000-4000-8000-000000000002')
  or exists(select 1 from public.trips where id='b2000000-0000-4000-8000-000000000002')
 then raise exception 'TRIP_DELETE_STAY_ROLES_BROKEN'; end if;
end $cascade$;
rollback;
