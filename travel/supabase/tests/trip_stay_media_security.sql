-- Disposable local Supabase PostgreSQL only. Roll back every synthetic row.
\set ON_ERROR_STOP on
begin;
grant usage on schema public,private to authenticated;
grant select on public.trips,public.media to authenticated;
insert into auth.users(id,email) values
 ('82000000-0000-4000-8000-000000000001','stay-media-owner@example.test'),
 ('82000000-0000-4000-8000-000000000002','stay-media-stranger@example.test');
update public.profiles set access_until=(current_date+interval '1 year')::date
 where id in ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
 ('82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','FR','2026-01-01','2026-01-03','tourisme'),
 ('82100000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','MA','2026-02-01','2026-02-03','tourisme'),
 ('82100000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','SN','2026-01-01','2026-01-03','tourisme');
insert into public.media(id,user_id,trip_id,storage_path,kind,bytes) values
 ('82200000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001/82100000-0000-4000-8000-000000000001/82200000-0000-4000-8000-000000000001.webp','photo',1024),
 ('82200000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','82100000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001/82100000-0000-4000-8000-000000000002/82200000-0000-4000-8000-000000000002.webp','photo',1024),
 ('82200000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','82100000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002/82100000-0000-4000-8000-000000000003/82200000-0000-4000-8000-000000000003.webp','photo',1024);
do $contract$
declare field text;
begin
 foreach field in array array['airline_media_id','hotel_media_id'] loop
  if not has_column_privilege('authenticated','public.trips',field,'UPDATE')
    then raise exception 'NO_STAY_UPDATE_GRANT: %',field; end if;
 end loop;
 if has_column_privilege('authenticated','public.trips','user_id','UPDATE')
   or has_column_privilege('authenticated','public.trips','deleting','UPDATE')
   or has_table_privilege('authenticated','public.trips','DELETE')
 then raise exception 'PRIVILEGE_REGRESSION'; end if;
 if (select count(*) from pg_constraint
    where conrelid='public.trips'::regclass and conname in
      ('trips_airline_same_trip_owner','trips_hotel_same_trip_owner')
      and contype='f')<>2 then raise exception 'MISSING_STAY_COMPOSITE_FK'; end if;
 if exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='travel_history_pdf'
      and column_name in ('airline_media_id','hotel_media_id'))
 then raise exception 'FACTUAL_PDF_STAY_MEDIA_LEAK'; end if;
end $contract$;
-- Owner may select one owned photo for cover, airline and hotel simultaneously.
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);
update public.trips
 set cover_media_id='82200000-0000-4000-8000-000000000001',
 airline_media_id='82200000-0000-4000-8000-000000000001',
 hotel_media_id='82200000-0000-4000-8000-000000000001'
 where id='82100000-0000-4000-8000-000000000001';
do $valid$
begin
 if not exists(select 1 from public.trips where
  id='82100000-0000-4000-8000-000000000001'
  and cover_media_id='82200000-0000-4000-8000-000000000001'
  and airline_media_id='82200000-0000-4000-8000-000000000001'
  and hotel_media_id='82200000-0000-4000-8000-000000000001')
 then raise exception 'OWNER_SAME_PHOTO_ALL_ROLES_REJECTED'; end if;
end $valid$;
-- The composite FK must reject both other-trip and other-owner media, for EACH slot.
do $isolation$
declare field text; invalid boolean;
begin
 foreach field in array array['airline_media_id','hotel_media_id'] loop
  invalid:=false;
  begin
   execute format('update public.trips set %I=$1 where id=$2',field)
    using '82200000-0000-4000-8000-000000000002'::uuid,
          '82100000-0000-4000-8000-000000000001'::uuid;
  exception when foreign_key_violation then invalid:=true; end;
  if not invalid then raise exception 'CROSS_TRIP_ACCEPTED: %',field; end if;
  invalid:=false;
  begin
   execute format('update public.trips set %I=$1 where id=$2',field)
    using '82200000-0000-4000-8000-000000000003'::uuid,
          '82100000-0000-4000-8000-000000000001'::uuid;
  exception when foreign_key_violation then invalid:=true; end;
  if not invalid then raise exception 'CROSS_OWNER_MEDIA_ACCEPTED: %',field; end if;
 end loop;
end $isolation$;
-- Owner cannot update another user's trip (check ROW_COUNT under RLS).
do $rls$
declare affected integer;
begin
 update public.trips set airline_media_id=null
  where id='82100000-0000-4000-8000-000000000003';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'CROSS_OWNER_TRIP_WRITE_ALLOWED'; end if;
end $rls$;
reset role;
-- Server-side photo deletion must null both stay fields and cover, without
-- affecting this trip or the other user's stored photos.
delete from public.media where id='82200000-0000-4000-8000-000000000001';
do $deletion$
begin
 if not exists(select 1 from public.trips
   where id='82100000-0000-4000-8000-000000000001'
     and airline_media_id is null and hotel_media_id is null and cover_media_id is null)
 then raise exception 'SELECTED_STAY_PHOTO_NOT_NULL_AFTER_DELETE'; end if;
 if not exists(select 1 from public.media where id='82200000-0000-4000-8000-000000000003')
 then raise exception 'OTHER_OWNER_PHOTO_DELETED'; end if;
end $deletion$;
rollback;
