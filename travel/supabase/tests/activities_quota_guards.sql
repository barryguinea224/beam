-- Rollback-only quota checks; run on disposable PostgreSQL with canonical schema.
begin;
insert into auth.users(id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','FR','2026-01-01','2026-01-02','tourisme'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','MA','2026-02-01','2026-02-02','tourisme'),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','SN','2026-01-01','2026-01-02','tourisme');

do $$
declare
  owner_id uuid := 'a0000000-0000-4000-8000-000000000001';
  other_owner uuid := 'a0000000-0000-4000-8000-000000000002';
  full_trip uuid := 'b0000000-0000-4000-8000-000000000001';
  spare_trip uuid := 'b0000000-0000-4000-8000-000000000002';
  other_trip uuid := 'b0000000-0000-4000-8000-000000000003';
  moved_activity uuid;
  i integer;
  blocked boolean;
begin
  if not exists(
    select 1 from pg_trigger where tgrelid='public.activities'::regclass
      and tgname='activities_quota_before_write' and tgenabled='O'
  ) then raise exception 'ACTIVITY_QUOTA_TRIGGER_NOT_ENABLED'; end if;

  if has_function_privilege('anon','public.enforce_activity_quota()','EXECUTE')
    or has_function_privilege('authenticated','public.enforce_activity_quota()','EXECUTE')
  then raise exception 'ACTIVITY_QUOTA_FUNCTION_CALLABLE_DIRECTLY'; end if;

  for i in 1..50 loop
    insert into public.activities(trip_id,user_id,title,kind)
    values(full_trip,owner_id,'Activité '||i,'lieu');
  end loop;
  if (select count(*) from public.activities where trip_id=full_trip)<>50
  then raise exception 'FIFTY_ACTIVITY_INSERTS_MUST_SUCCEED'; end if;

  blocked:=false;
  begin
    insert into public.activities(trip_id,user_id,title)
      values(full_trip,owner_id,'Refusée 51e');
  exception when check_violation then
    blocked := SQLERRM='ACTIVITY_LIMIT_REACHED';
  end;
  if not blocked then raise exception 'FIFTY_FIRST_ACTIVITY_NOT_REJECTED'; end if;

  -- Title/place/date/order updates on a full trip must remain possible.
  update public.activities
    set title='Titre corrigé',place='Paris',happened_on='2026-01-01',position=1
    where trip_id=full_trip and title='Activité 1';
  if (select count(*) from public.activities where trip_id=full_trip)<>50
  then raise exception 'EDIT_CHANGED_ACTIVITY_COUNT'; end if;

  insert into public.activities(trip_id,user_id,title)
    values(spare_trip,owner_id,'Activité à déplacer') returning id into moved_activity;

  blocked:=false;
  begin
    update public.activities set trip_id=full_trip where id=moved_activity;
  exception when check_violation then
    blocked := SQLERRM='ACTIVITY_LIMIT_REACHED';
  end;
  if not blocked then raise exception 'MOVING_TO_FULL_TRIP_NOT_REJECTED'; end if;
  if (select trip_id from public.activities where id=moved_activity)<>spare_trip
  then raise exception 'REJECTED_MOVE_CHANGED_TRIP'; end if;

  -- Moving without changing the destination quota is safe.
  update public.activities set title='Titre après échec' where id=moved_activity;

  -- Owner checks still apply independently of the quota.
  blocked:=false;
  begin
    insert into public.activities(trip_id,user_id,title)
      values(other_trip,owner_id,'Tentative inter-compte');
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'CROSS_OWNER_ACTIVITY_INSERT_ACCEPTED'; end if;

  if (select count(*) from public.activities where trip_id=full_trip)<>50
  then raise exception 'QUOTA_REGRESSION'; end if;
  raise notice 'ACTIVITY_QUOTA_GUARDS_PASS_50_OF_50';
end $$;
rollback;
