-- BTH A+B: disposable PostgreSQL fixture; never run against hosted projects.
\set ON_ERROR_STOP on
begin;
do $rights$
begin
 if not has_column_privilege('authenticated','public.activities','duration_days','INSERT')
    or not has_column_privilege('authenticated','public.activities','duration_days','UPDATE')
    or not has_column_privilege('authenticated','public.trips','companions','INSERT')
    or not has_column_privilege('authenticated','public.trips','companions','UPDATE')
 then raise exception 'ACTIVITY_COMPANION_GRANTS_MISSING'; end if;
 if has_column_privilege('authenticated','public.trips','user_id','UPDATE')
    or has_column_privilege('authenticated','public.trips','deleting','UPDATE')
 then raise exception 'TRIP_PRIVILEGES_TOO_BROAD'; end if;
 if has_table_privilege('anon','public.activities','UPDATE')
    or has_table_privilege('anon','public.trips','UPDATE')
 then raise exception 'ANON_CAN_EDIT_PRIVATE_DATA'; end if;
 if exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='travel_history_pdf'
   and column_name in ('companions','duration_days_activities','activity_duration_days','activity_title'))
 then raise exception 'FACTUAL_PDF_LEAK'; end if;
end $rights$;
insert into auth.users(id,email) values
 ('cd000000-0000-4000-8000-000000000001','duration-owner@example.test'),
 ('cd000000-0000-4000-8000-000000000002','duration-other@example.test'),
 ('cd000000-0000-4000-8000-000000000003','duration-expired@example.test');
update public.profiles set access_until=current_date+365 where id in
 ('cd000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000002',
  'cd000000-0000-4000-8000-000000000003');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
 values('cd100000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001',
 'FR','2025-12-20','2025-12-31','tourisme');
set local role authenticated;
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000001',true);
update public.trips set companions='Maman, Aïssatou' where id='cd100000-0000-4000-8000-000000000001';
insert into public.activities(trip_id,title,happened_on,duration_days)
 values('cd100000-0000-4000-8000-000000000001','Fête fictive','2025-12-24',3);
do $owner$
declare denied boolean;
begin
 if (select companions from public.trips where id='cd100000-0000-4000-8000-000000000001')<>'Maman, Aïssatou'
  or (select duration_days from public.activities where trip_id='cd100000-0000-4000-8000-000000000001')<>3
 then raise exception 'OWNER_FIELDS_NOT_SAVED';end if;
 denied:=false;
 begin insert into public.activities(trip_id,title,happened_on,duration_days)
   values('cd100000-0000-4000-8000-000000000001','Invalide','2025-12-26',0);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'DURATION_BELOW_1_ALLOWED';end if;
 denied:=false;
 begin insert into public.activities(trip_id,title,happened_on,duration_days)
   values('cd100000-0000-4000-8000-000000000001','Invalide','2025-12-25',31);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'DURATION_ABOVE_30_ALLOWED';end if;
 denied:=false;
 begin insert into public.activities(trip_id,title,happened_on,duration_days)
   values('cd100000-0000-4000-8000-000000000001','Invalide','2025-12-30',3);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'DURATION_OVER_TRIP_END_ALLOWED';end if;
 denied:=false;
 begin update public.trips set companions=repeat('X',201)
   where id='cd100000-0000-4000-8000-000000000001';
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'COMPANIONS_LONGER_THAN_200_ALLOWED';end if;
 denied:=false;
 begin update public.trips set exit_date='2025-12-25'
   where id='cd100000-0000-4000-8000-000000000001';
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'TRIP_END_EXCLUDES_MULTIDAY_ACTIVITY';end if;
end $owner$;
-- No date = duration is legitimate.
insert into public.activities(trip_id,title,duration_days)
 values('cd100000-0000-4000-8000-000000000001','Activité sans date',30);
-- Existing activity default remains exactly one day.
insert into public.activities(trip_id,title,happened_on)
 values('cd100000-0000-4000-8000-000000000001','Une journée','2025-12-27');
do $default$
begin
 if (select duration_days from public.activities where title='Une journée')<>1 then
 raise exception 'LEGACY_DEFAULT_CHANGED';end if;
end $default$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000002',true);
do $isolation$
declare n int; denied boolean;
begin
 if exists (select 1 from public.activities where title='Fête fictive')
 then raise exception 'OTHER_USER_CAN_READ';end if;
 update public.trips set companions='Modification interdite' where id='cd100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'OTHER_USER_UPDATED_COMPANIONS';end if;
 update public.activities set duration_days=1 where title='Fête fictive';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'OTHER_USER_UPDATED_ACTIVITY';end if;
 denied:=false;
 begin insert into public.activities(trip_id,title,happened_on,duration_days)
  values('cd100000-0000-4000-8000-000000000001','Interdit','2025-12-22',2);
 exception when insufficient_privilege or check_violation then denied:=true;end;
 if not denied then raise exception 'OTHER_USER_INSERTED_ACTIVITY';end if;
end $isolation$;
reset role;
update public.profiles set access_until=current_date-1 where id='cd000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','cd000000-0000-4000-8000-000000000001',true);
do $expired$
declare n int; denied boolean;
begin
 update public.activities set duration_days=1 where title='Fête fictive';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'EXPIRED_UPDATED_ACTIVITY';end if;
 update public.trips set companions='Interdit' where id='cd100000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'EXPIRED_UPDATED_TRIP';end if;
 denied:=false;
 begin insert into public.activities(trip_id,title,duration_days)
 values('cd100000-0000-4000-8000-000000000001','Interdit',2);
 exception when insufficient_privilege or check_violation then denied:=true;end;
 if not denied then raise exception 'EXPIRED_INSERTED_ACTIVITY';end if;
end $expired$;
reset role;
rollback;
\echo 'PASS: duration bounds, owned CRUD, cross-owner/expired denial, date fences, companions, no factual PDF changes'
