-- Local deterministic checks for retry state transitions.
begin;

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');

update public.profiles set deleting=true,deletion_requested_at=now()-interval '2 hours'
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
 if exists(select 1 from public.claim_stale_deletions(5,10)) then raise exception 'leased rows claimed twice'; end if;
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

rollback;
