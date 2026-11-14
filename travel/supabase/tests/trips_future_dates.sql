-- Voyage à l'avance / PDF factuel : uniquement des données fictives et jetables.
-- Exécuter sur la base Docker locale après schema.sql (ou sa migration). Aucune requête réseau.
\set ON_ERROR_STOP on
begin;

do $contract$
declare columns text[];
begin
  select array_agg(attname::text order by attnum) into columns
  from pg_attribute
  where attrelid='public.travel_history_pdf'::regclass
    and attnum>0 and not attisdropped;
  if columns is distinct from array['user_id','country_code','cities','entry_date','exit_date','duration_days','purpose']
  then raise exception 'PDF_FACTUAL_COLUMNS_CHANGED: %',columns; end if;

  if not (select c.reloptions @> array['security_invoker=true']::text[]
          from pg_class c where c.oid='public.travel_history_pdf'::regclass)
  then raise exception 'PDF_VIEW_NOT_SECURITY_INVOKER'; end if;

  -- The original view ACL may include anon; migration must preserve it exactly.
  if has_function_privilege('anon','public.check_trip_dates()','EXECUTE')
  then raise exception 'TRIP_DATES_FUNCTION_EXPOSED_TO_ANON'; end if;
end $contract$;

insert into auth.users(id,email) values
 ('a9400000-0000-4000-8000-000000000001','future-fixture@example.test');
update public.profiles set access_until=(current_date+365)
 where id='a9400000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','a9400000-0000-4000-8000-000000000001',true);

insert into public.trips(id,user_id,country_code,cities,entry_date,exit_date,purpose,is_domestic)
values
 ('a9410000-0000-4000-8000-000000000001',
  'a9400000-0000-4000-8000-000000000001','FR',array['Paris'],
  (now() at time zone 'utc')::date-20,(now() at time zone 'utc')::date-15,'tourisme',false),
 ('a9410000-0000-4000-8000-000000000002',
  'a9400000-0000-4000-8000-000000000001','SN',array['Dakar'],
  (now() at time zone 'utc')::date-4,(now() at time zone 'utc')::date+4,'tourisme',false),
 ('a9410000-0000-4000-8000-000000000003',
  'a9400000-0000-4000-8000-000000000001','MA',array['Rabat'],
  (now() at time zone 'utc')::date+20,(now() at time zone 'utc')::date+25,'tourisme',false);

do $checks$
declare n integer; message text; denied boolean:=false;
begin
  select count(*) into n from public.trips
   where user_id='a9400000-0000-4000-8000-000000000001';
  if n<>3 then raise exception 'FUTURE_TRIP_INSERT_REJECTED'; end if;

  -- Un voyage peut être modifié pendant son déroulement et conservé ensuite.
  update public.trips set exit_date=(now() at time zone 'utc')::date+8
   where id='a9410000-0000-4000-8000-000000000002';

  begin
    insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
    values('a9410000-0000-4000-8000-000000000004',
      'a9400000-0000-4000-8000-000000000001','BE',
      ((now() at time zone 'utc')::date+interval '2 years'+interval '1 day')::date,
      ((now() at time zone 'utc')::date+interval '2 years'+interval '2 days')::date,
      'tourisme');
  exception when others then
    get stacked diagnostics message=message_text;
    denied:=message='Un voyage ne peut pas commencer dans plus de deux ans.';
  end;
  if not denied then raise exception 'TWO_YEAR_START_CAP_NOT_ENFORCED'; end if;

  select count(*) into n from public.travel_history_pdf
   where user_id='a9400000-0000-4000-8000-000000000001';
  if n<>1 then raise exception 'FACTUAL_PDF_MUST_ONLY_INCLUDE_COMPLETED_TRIPS: %',n; end if;
  if not exists(select 1 from public.travel_history_pdf
   where country_code='FR' and user_id='a9400000-0000-4000-8000-000000000001')
  then raise exception 'COMPLETED_TRIP_MISSING_FROM_FACTUAL_PDF'; end if;
  if exists(select 1 from public.travel_history_pdf
   where country_code in ('SN','MA') and user_id='a9400000-0000-4000-8000-000000000001')
  then raise exception 'ONGOING_OR_PLANNED_TRIP_EXPOSED_IN_FACTUAL_PDF'; end if;
end $checks$;
reset role;
rollback;
