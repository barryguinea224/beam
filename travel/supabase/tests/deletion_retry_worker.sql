-- Local deterministic checks for retry state transitions.
begin;

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');

update public.profiles set deleting=true,deletion_requested_at=now()-interval '2 hours',
  deletion_last_error='PREVIOUS_FAILURE'
where id='00000000-0000-4000-8000-000000000001';

insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose,deleting,deletion_requested_at)
values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
'SN','2020-01-01','2020-01-02','autre',true,now()-interval '2 hours');

create temporary table claimed as select * from public.claim_stale_deletions(5,10);

do $$
begin
 if (select count(*) from claimed)<>2 then raise exception 'expected 2 claims'; end if;
 if (select deletion_attempts from public.profiles where id='00000000-0000-4000-8000-000000000001')<>0
 then raise exception 'claim must not count as attempt'; end if;
 if (select deletion_last_error from public.profiles where id='00000000-0000-4000-8000-000000000001')
    is distinct from 'PREVIOUS_FAILURE'
 then raise exception 'claim erased preceding failure'; end if;
 if exists(select 1 from public.claim_stale_deletions(5,10)) then raise exception 'leased rows claimed twice'; end if;
end $$;

-- Starting, not merely reserving, clears the prior error.
do $$
declare tok uuid; ok boolean;
begin
 select claim_token into tok from claimed where subject_kind='account';
 select public.start_deletion_retry('account','00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001',tok) into ok;
 if not ok then raise exception 'account did not start'; end if;
 if (select deletion_last_error from public.profiles where id='00000000-0000-4000-8000-000000000001') is not null
 then raise exception 'account error not cleared at start'; end if;
end $$;

do $$
declare tok uuid; ok boolean;
begin
 select claim_token into tok from claimed where subject_kind='trip';
 select public.start_deletion_retry('trip','10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002',tok) into ok;
 if not ok then raise exception 'trip did not start'; end if;
 if (select deletion_attempts from public.trips where id='10000000-0000-4000-8000-000000000001')<>1
 then raise exception 'start did not increment attempt'; end if;
 perform public.record_deletion_retry_failure('trip','10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002',tok,'STORAGE_REMOVE_FAILED');
end $$;

truncate claimed;
insert into claimed select * from public.claim_stale_deletions(5,10);
do $$
begin
 if exists(select 1 from claimed where subject_kind='trip') then raise exception 'backoff ignored immediately after failure'; end if;
end $$;

-- Deterministic predicate check: move the recorded attempt into the past instead of sleeping.
update public.trips set deletion_last_attempt_at=now()-interval '11 minutes'
where id='10000000-0000-4000-8000-000000000001';
truncate claimed;
insert into claimed select * from public.claim_stale_deletions(5,10);
do $$
begin
 if not exists(select 1 from claimed where subject_kind='trip') then raise exception 'trip not eligible after backoff'; end if;
 if (select deletion_last_error from public.trips where id='10000000-0000-4000-8000-000000000001')
    is distinct from 'STORAGE_REMOVE_FAILED'
 then raise exception 'trip claim erased previous failure'; end if;
end $$;

-- An unstarted reservation is released without consuming an attempt.
do $$
declare tok uuid; ok boolean;
begin
 select claim_token into tok from claimed where subject_kind='trip';
 select public.release_unstarted_deletion_claim('trip','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',tok) into ok;
 if not ok then raise exception 'unstarted claim not released'; end if;
 if (select deletion_attempts from public.trips where id='10000000-0000-4000-8000-000000000001')<>1
 then raise exception 'release changed attempt count'; end if;
 if (select deletion_last_error from public.trips where id='10000000-0000-4000-8000-000000000001')
    is distinct from 'STORAGE_REMOVE_FAILED'
 then raise exception 'release erased previous failure'; end if;
end $$;

-- After a released claim, the subsequent real start clears the old failure.
truncate claimed;
insert into claimed select * from public.claim_stale_deletions(5,10);
do $$
declare tok uuid; ok boolean;
begin
 select claim_token into tok from claimed where subject_kind='trip';
 select public.start_deletion_retry('trip','10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002',tok) into ok;
 if not ok then raise exception 'trip second start failed'; end if;
 if (select deletion_last_error from public.trips where id='10000000-0000-4000-8000-000000000001') is not null
 then raise exception 'trip error not cleared at start'; end if;
end $$;

update public.trips set deletion_attempts=12,deletion_claimed_until=null,deletion_claim_token=null
where id='10000000-0000-4000-8000-000000000001';
do $$
begin
 if exists(select 1 from public.claim_stale_deletions(5,10)
   where subject_id='10000000-0000-4000-8000-000000000001') then raise exception 'attempt ceiling ignored'; end if;
 if not exists(select 1 from private.stuck_deletions
   where subject_id='10000000-0000-4000-8000-000000000001') then raise exception 'attempt ceiling not surfaced'; end if;
end $$;

-- The invariant itself rejects invisible deleting=true rows.
do $$
begin
 begin
  update public.trips set deleting=true,deletion_requested_at=null
  where id='10000000-0000-4000-8000-000000000001';
  raise exception 'missing deletion timestamp accepted';
 exception when check_violation then null;
 end;
end $$;

-- Private worker run receipts: created before HTTP 202, completed only after work settles.
do $$
declare rid uuid := '20000000-0000-4000-8000-000000000001'; receipt record; done boolean;
begin
  perform public.begin_deletion_retry_run(rid);
  select * into receipt from public.get_deletion_retry_run(rid);
  if receipt.status <> 'running' or receipt.finished_at is not null then
    raise exception 'new retry receipt must be running';
  end if;
  if (select count(*) from private.deletion_retry_runs where run_id=rid) <> 1 then
    raise exception 'missing private retry receipt';
  end if;
  select public.finish_deletion_retry_run(rid,1,1,0,1,null) into done;
  if not done then raise exception 'retry receipt did not finish'; end if;
  select * into receipt from public.get_deletion_retry_run(rid);
  if receipt.status <> 'completed' or receipt.finished_at is null or
    receipt.claimed <> 1 or receipt.started <> 1 or receipt.destructive_failed <> 1 then
    raise exception 'retry receipt counts or terminal status invalid';
  end if;
  if public.finish_deletion_retry_run(rid,1,1,1,0,null) then
    raise exception 'completed run was overwritten';
  end if;
end $$;

-- Failed background execution must be explicit, never mistaken for completed no-work.
do $$
declare rid uuid := '20000000-0000-4000-8000-000000000002'; receipt record;
begin
  perform public.begin_deletion_retry_run(rid);
  perform public.finish_deletion_retry_run(rid,0,0,0,0,'RETRY_CLAIM_FAILED');
  select * into receipt from public.get_deletion_retry_run(rid);
  if receipt.status <> 'failed' or receipt.error_code <> 'RETRY_CLAIM_FAILED' then
    raise exception 'failed background run was not surfaced';
  end if;
  if has_function_privilege('anon','public.get_deletion_retry_run(uuid)','EXECUTE') or
     has_function_privilege('authenticated','public.get_deletion_retry_run(uuid)','EXECUTE') then
    raise exception 'client can read retry receipts';
  end if;
end $$;

rollback;
