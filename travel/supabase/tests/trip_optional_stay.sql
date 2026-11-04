-- Optional airline and hotel names. Only disposable local SQL fixtures.
-- Existing owner RLS, access_until guard, and PDF projection must remain unchanged.
\set ON_ERROR_STOP on
begin;
do $contract$
begin
 if not has_column_privilege('authenticated','public.trips','airline','UPDATE')
   or not has_column_privilege('authenticated','public.trips','hotel','UPDATE')
 then raise exception 'MISSING_STAY_UPDATE_GRANTS'; end if;
 if has_column_privilege('authenticated','public.trips','deleting','UPDATE')
   or has_column_privilege('authenticated','public.trips','user_id','UPDATE')
 then raise exception 'UNSAFE_STAY_UPDATE_GRANTS'; end if;
 if exists (select 1 from information_schema.columns
   where table_schema='public' and table_name='travel_history_pdf'
   and column_name in ('airline','hotel'))
 then raise exception 'PRIVATE_STAY_DATA_IN_FACTUAL_PDF'; end if;
end $contract$;

insert into auth.users(id,email) values
 ('f9000000-0000-4000-8000-000000000001','stay-fixture@example.test');
update public.profiles set access_until=(current_date+365)
 where id='f9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);

insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose,airline,hotel)
values('f9100000-0000-4000-8000-000000000001',
 'f9000000-0000-4000-8000-000000000001','FR','2025-02-01','2025-02-08','tourisme',
 'Compagnie fictive','Hôtel fictif');

do $valid$
declare found integer;
begin
 select count(*) into found from public.trips
  where id='f9100000-0000-4000-8000-000000000001'
   and airline='Compagnie fictive' and hotel='Hôtel fictif';
 if found<>1 then raise exception 'STAY_DATA_NOT_PRIVATE_OR_NOT_WRITTEN'; end if;
end $valid$;

do $bounds$
declare invalid boolean;
begin
 invalid:=false;
 begin
  update public.trips set airline=repeat('X',161)
   where id='f9100000-0000-4000-8000-000000000001';
 exception when check_violation then invalid:=true; end;
 if not invalid then raise exception 'AIRLINE_LENGTH_NOT_ENFORCED'; end if;
 invalid:=false;
 begin
  update public.trips set hotel=repeat('X',161)
   where id='f9100000-0000-4000-8000-000000000001';
 exception when check_violation then invalid:=true; end;
 if not invalid then raise exception 'HOTEL_LENGTH_NOT_ENFORCED'; end if;
end $bounds$;

update public.trips set airline=null,hotel=null
 where id='f9100000-0000-4000-8000-000000000001';
do $clear$
begin
 if exists(select 1 from public.trips
  where id='f9100000-0000-4000-8000-000000000001'
    and (airline is not null or hotel is not null))
 then raise exception 'OPTIONAL_STAY_CLEAR_FAILED'; end if;
end $clear$;
reset role;
-- Expired users must not be able to edit stay fields.
update public.profiles set access_until=current_date-1
 where id='f9000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
update public.trips set airline='Interdit'
 where id='f9100000-0000-4000-8000-000000000001';
do $expired$
begin
 if exists(select 1 from public.trips
   where id='f9100000-0000-4000-8000-000000000001' and airline is not null)
 then raise exception 'EXPIRED_STAY_WRITE_ALLOWED'; end if;
end $expired$;
reset role;
rollback;
