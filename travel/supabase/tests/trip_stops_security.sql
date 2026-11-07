-- Disposable SQL security fixture: synthetic users & countries only.
\set ON_ERROR_STOP on
begin;
do $permissions$
begin
 if not (select relrowsecurity from pg_class where oid='public.trip_stops'::regclass)
 then raise exception 'TRIP_STOPS_RLS_OFF';end if;
 if has_table_privilege('anon','public.trip_stops','SELECT')
   or has_table_privilege('anon','public.trip_stops','INSERT')
   or has_table_privilege('anon','public.trip_stops','UPDATE')
   or has_table_privilege('anon','public.trip_stops','DELETE') then
  raise exception 'TRIP_STOPS_ANON_ACCESS';end if;
 if has_column_privilege('authenticated','public.trip_stops','user_id','INSERT')
   or has_column_privilege('authenticated','public.trip_stops','user_id','UPDATE')
   or has_column_privilege('authenticated','public.trip_stops','trip_id','UPDATE')
   or has_column_privilege('authenticated','public.trip_stops','created_at','UPDATE')
   or has_column_privilege('authenticated','public.trip_stops','updated_at','UPDATE') then
  raise exception 'TRIP_STOPS_OWNER_MUTABLE';end if;
 if not has_column_privilege('authenticated','public.trip_stops','cities','UPDATE')
   or not has_column_privilege('authenticated','public.trip_stops','country_code','INSERT')
   or not has_table_privilege('authenticated','public.trip_stops','DELETE') then
  raise exception 'TRIP_STOPS_GRANTS_INCOMPLETE';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.trips'::regclass
    and conname='no_overlap') then
  raise exception 'TRIPS_NO_OVERLAP_WAS_REMOVED';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.trip_stops'::regclass
    and conname='trip_stops_trip_owner_fk' and confdeltype='c') then
  raise exception 'TRIP_STOPS_OWNER_CASCADE_MISSING';end if;
end $permissions$;

insert into auth.users(id,email) values
 ('a9000000-0000-4000-8000-000000000001','stops-owner@example.test'),
 ('a9000000-0000-4000-8000-000000000002','stops-other@example.test'),
 ('a9000000-0000-4000-8000-000000000003','stops-expired@example.test');
update public.profiles set access_until=current_date+365 where id in(
 'a9000000-0000-4000-8000-000000000001',
 'a9000000-0000-4000-8000-000000000002');
update public.profiles set access_until=current_date-1
 where id='a9000000-0000-4000-8000-000000000003';
insert into public.trips(id,user_id,country_code,cities,entry_date,exit_date,purpose)
 values
 ('a9100000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001',
  'FR',array['Paris'],'2025-11-05','2025-11-15','tourisme'),
 ('a9100000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000002',
  'FR',array['Lyon'],'2026-10-01','2026-10-15','tourisme'),
 ('a9100000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000003',
  'FR',array['Bordeaux'],'2026-10-01','2026-10-15','tourisme');

set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
insert into public.trip_stops(trip_id,country_code,cities,entry_date,exit_date,position)
values('a9100000-0000-4000-8000-000000000001','DE',array['Berlin'],'2025-11-10','2025-11-14',1);
do $owner$
declare v uuid; blocked boolean;
begin
 select user_id into v from public.trip_stops
 where trip_id='a9100000-0000-4000-8000-000000000001';
 if v is distinct from auth.uid() then raise exception 'OWNER_INSERT_DEFAULT_FAILED';end if;
 update public.trip_stops set cities=array['Berlin','Potsdam'] where country_code='DE';
 if not exists(select 1 from public.trip_stops where 'Potsdam'=any(cities))
 then raise exception 'OWNER_UPDATE_FAILED';end if;
 -- Same country, outside trip, overlapping dates and >10 cities must fail.
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000001','FR','2025-11-06','2025-11-07');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'SAME_COUNTRY_ALLOWED';end if;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000001','GB','2025-11-01','2025-11-06');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'OUTSIDE_DATES_ALLOWED';end if;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000001','BE','2025-11-14','2025-11-15');
 exception when exclusion_violation then blocked:=true;end;
 if not blocked then raise exception 'OVERLAP_ALLOWED';end if;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,cities,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000001','BE',
 array['1','2','3','4','5','6','7','8','9','10','11'],'2025-11-05','2025-11-06');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'CITIES_OVER_10_ALLOWED';end if;
 blocked:=false;
 begin update public.trips set exit_date='2025-11-12' where
 id='a9100000-0000-4000-8000-000000000001';
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'PARENT_DATE_SHRINK_ALLOWED';end if;
 blocked:=false;
 begin update public.trips set country_code='DE' where
 id='a9100000-0000-4000-8000-000000000001';
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'PARENT_COUNTRY_CHANGE_ALLOWED';end if;
end $owner$;
reset role;

-- Another user cannot read, change, erase or create a stage on someone else's trip.
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000002',true);
do $isolation$
declare n int; blocked boolean;
begin
 if exists(select 1 from public.trip_stops where trip_id=
   'a9100000-0000-4000-8000-000000000001')
 then raise exception 'OTHER_USER_READ';end if;
 update public.trip_stops set country_code='US' where trip_id=
   'a9100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'OTHER_USER_UPDATE';end if;
 delete from public.trip_stops where trip_id='a9100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'OTHER_USER_DELETE';end if;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000001','IT','2025-11-05','2025-11-06');
 exception when insufficient_privilege or foreign_key_violation or check_violation then blocked:=true;end;
 if not blocked then raise exception 'OTHER_USER_INSERT';end if;
end $isolation$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000003',true);
do $expired$
declare n int; blocked boolean;
begin
 if exists(select 1 from public.trip_stops) then raise exception 'EXPIRED_READ';end if;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
 values('a9100000-0000-4000-8000-000000000003','BE','2026-10-05','2026-10-06');
 exception when insufficient_privilege or check_violation then blocked:=true;end;
 if not blocked then raise exception 'EXPIRED_INSERT';end if;
 update public.trip_stops set country_code='IT';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'EXPIRED_UPDATE';end if;
end $expired$;
reset role;

-- 10 separate 1-day stop dates are valid, number 11 must be refused.
-- A separate trip avoids conflicting with the Berlin stage.
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
 values('a9100000-0000-4000-8000-000000000004',
 'a9000000-0000-4000-8000-000000000001',
 'FR','2026-10-01','2026-10-20','tourisme');
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
do $quota$
declare k integer;blocked boolean;
begin
 for k in 1..10 loop
  insert into public.trip_stops(trip_id,country_code,entry_date,exit_date,position)
  values('a9100000-0000-4000-8000-000000000004','DE',
    '2026-10-01'::date+(k-1),'2026-10-01'::date+(k-1),k);
 end loop;
 blocked:=false;
 begin insert into public.trip_stops(trip_id,country_code,entry_date,exit_date)
  values('a9100000-0000-4000-8000-000000000004','IT',
   '2026-10-15','2026-10-16');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'QUOTA_OVER_10_ALLOWED';end if;
end $quota$;
reset role;

-- Cascade delete of a complete trip removes its stages. Fixture rolled back.
delete from public.trips where id='a9100000-0000-4000-8000-000000000001';
do $cascade$
begin
 if exists(select 1 from public.trip_stops where trip_id='a9100000-0000-4000-8000-000000000001')
 then raise exception 'CASCADE_FAILED';end if;
end $cascade$;
rollback;
\echo 'PASS trip stops owner/inactive RLS, dates, country, overlap, 10 max and trip cascade'
