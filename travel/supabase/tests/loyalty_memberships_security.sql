-- Loyalty memberships: strictly disposable local Supabase auth fixture.
-- Verifies RLS isolation, expiry guard, column grants, constraints, and PDF exclusion.
\set ON_ERROR_STOP on
begin;
do $privileges$
begin
 if has_table_privilege('anon','public.loyalty_memberships','SELECT') or
    has_table_privilege('anon','public.loyalty_memberships','INSERT') or
    has_table_privilege('anon','public.loyalty_memberships','UPDATE') or
    has_table_privilege('anon','public.loyalty_memberships','DELETE') then
   raise exception 'LOYALTY_ANON_ACCESS_ALLOWED';
 end if;
 if has_column_privilege('authenticated','public.loyalty_memberships','user_id','UPDATE') or
    has_column_privilege('authenticated','public.loyalty_memberships','id','UPDATE') or
    has_column_privilege('authenticated','public.loyalty_memberships','created_at','UPDATE') or
    has_column_privilege('authenticated','public.loyalty_memberships','updated_at','UPDATE') then
   raise exception 'LOYALTY_OWNER_OR_TIMESTAMP_MUTABLE';
 end if;
 if has_column_privilege('authenticated','public.loyalty_memberships','user_id','INSERT') then
   raise exception 'LOYALTY_OWNER_SPOOFING_PRIVILEGE';
 end if;
 if not has_table_privilege('authenticated','public.loyalty_memberships','SELECT') or
    not has_table_privilege('authenticated','public.loyalty_memberships','DELETE') or
    not has_column_privilege('authenticated','public.loyalty_memberships','member_number','UPDATE') then
   raise exception 'LOYALTY_OWNER_GRANTS_MISSING';
 end if;
 if exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='loyalty_memberships'
     and column_name ~* '(password|passwd|pin|secret|credential|otp)') then
   raise exception 'LOYALTY_UNSAFE_AUTH_FIELD';
 end if;
 if exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='travel_history_pdf'
     and column_name ~* '(loyalty|member_number|miles|tier)') then
   raise exception 'LOYALTY_DATA_IN_FACTUAL_EXPORT';
 end if;
end $privileges$;

insert into auth.users(id,email) values
 ('b7000000-0000-4000-8000-000000000001','loyalty-a@example.test'),
 ('b7000000-0000-4000-8000-000000000002','loyalty-b@example.test'),
 ('b7000000-0000-4000-8000-000000000003','loyalty-expired@example.test'),
 ('b7000000-0000-4000-8000-000000000004','loyalty-deleting@example.test');
update public.profiles set access_until=current_date+365
 where id in ('b7000000-0000-4000-8000-000000000001',
              'b7000000-0000-4000-8000-000000000002',
              'b7000000-0000-4000-8000-000000000004');
update public.profiles set access_until=current_date-1
 where id='b7000000-0000-4000-8000-000000000003';
update public.profiles
 set deleting=true,deletion_requested_at=now()
 where id='b7000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000001',true);
insert into public.loyalty_memberships(program_code,member_number,tier,miles_expiry)
 values ('AF','AB12-4821','Gold',current_date+31);
do $created$
begin
 if (select count(*) from public.loyalty_memberships)<>1
 or (select user_id from public.loyalty_memberships limit 1)<>auth.uid()
 then raise exception 'ACTIVE_OWNER_CREATE_FAILED';end if;
end $created$;

-- Illegal format, code and duplicate owner/program must fail at the DB.
do $invalid$
declare ok boolean; n text;
begin
 foreach n in array ARRAY['ABC','AB 1234','A@1234',repeat('X',31)] loop
  ok:=false;
  begin
   insert into public.loyalty_memberships(program_code,member_number)
    values('EK',n);
  exception when check_violation then ok:=true;end;
  if not ok then raise exception 'LOYALTY_NUMBER_VALIDATION_FAILED: %',n;end if;
 end loop;
 ok:=false;
 begin insert into public.loyalty_memberships(program_code,member_number)
  values('XX','TEST1234');
 exception when check_violation then ok:=true;end;
 if not ok then raise exception 'LOYALTY_CODE_VALIDATION_FAILED';end if;
 ok:=false;
 begin insert into public.loyalty_memberships(program_code,member_number)
  values('AF','TEST4321');
 exception when unique_violation then ok:=true;end;
 if not ok then raise exception 'LOYALTY_UNIQUE_PROGRAM_FAILED';end if;
 ok:=false;
 begin update public.loyalty_memberships set tier=repeat('T',41);
 exception when check_violation then ok:=true;end;
 if not ok then raise exception 'LOYALTY_TIER_LENGTH_FAILED';end if;
end $invalid$;
update public.loyalty_memberships set member_number='ZZ-8899',tier='Silver'
 where program_code='AF';
do $changed$
begin
 if (select member_number from public.loyalty_memberships where program_code='AF')<>'ZZ-8899'
 then raise exception 'LOYALTY_OWNER_UPDATE_FAILED';end if;
end $changed$;
reset role;

-- Second active user must not see, modify, or delete the owner's row.
set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000002',true);
do $isolation$
declare affected int;
begin
 if (select count(*) from public.loyalty_memberships)<>0
 then raise exception 'LOYALTY_CROSS_USER_READ';end if;
 update public.loyalty_memberships set member_number='STOLEN1234';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'LOYALTY_CROSS_USER_UPDATE';end if;
 delete from public.loyalty_memberships;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'LOYALTY_CROSS_USER_DELETE';end if;
end $isolation$;
insert into public.loyalty_memberships(program_code,member_number)
 values('AF','OTHER-1234');
reset role;

-- Expired and deletion-pending accounts are not allowed to read or write.
set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000003',true);
do $expired$
declare rejected boolean; affected int;
begin
 if exists(select 1 from public.loyalty_memberships)
 then raise exception 'LOYALTY_EXPIRED_READ';end if;
 rejected:=false;
 begin insert into public.loyalty_memberships(program_code,member_number)
  values('TK','EXPR1234');
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'LOYALTY_EXPIRED_INSERT';end if;
 update public.loyalty_memberships set member_number='NO1234';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'LOYALTY_EXPIRED_UPDATE';end if;
 delete from public.loyalty_memberships;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'LOYALTY_EXPIRED_DELETE';end if;
end $expired$;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000004',true);
do $deleting$
declare rejected boolean;
begin
 rejected:=false;
 begin insert into public.loyalty_memberships(program_code,member_number)
  values('TK','DELET1234');
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'LOYALTY_PENDING_DELETE_WRITE';end if;
end $deleting$;
reset role;

-- Owner A can delete only their own row and cascade removes rows with auth.users.
set local role authenticated;
select set_config('request.jwt.claim.sub','b7000000-0000-4000-8000-000000000001',true);
delete from public.loyalty_memberships where program_code='AF';
do $deleted$
begin
 if exists(select 1 from public.loyalty_memberships)
 then raise exception 'LOYALTY_OWNER_DELETE_FAILED';end if;
end $deleted$;
reset role;
rollback;
\echo 'PASS loyalty RLS: owner CRUD, tenant isolation, inactive denial, strict format and grants'
