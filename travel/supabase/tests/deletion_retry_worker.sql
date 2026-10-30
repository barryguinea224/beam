-- Local behavioural checks for the retry lease/state machine.
begin;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

update public.profiles
set deleting=true, deletion_requested_at=now()-interval '2 hours'
where id='00000000-0000-4000-8000-000000000001';

insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose,deleting,deletion_requested_at)
values(
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'SN','2020-01-01','2020-01-02','autre',true,now()-interval '2 hours'
);

create temporary table claimed as
select * from public.claim_stale_deletions(20,10);

do $$
begin
  if (select count(*) from claimed) <> 2 then raise exception 'expected 2 claims'; end if;
  if not exists(select 1 from claimed where subject_kind='account' and subject_id='00000000-0000-4000-8000-000000000001') then
    raise exception 'account not claimed';
  end if;
  if not exists(select 1 from claimed where subject_kind='trip' and subject_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'trip not claimed';
  end if;
  if (select deletion_attempts from public.profiles where id='00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'account attempts not incremented';
  end if;
  if (select deletion_claimed_until <= now() from public.trips where id='10000000-0000-4000-8000-000000000001') then
    raise exception 'trip lease not set';
  end if;
end
$$;

truncate claimed;
insert into claimed select * from public.claim_stale_deletions(20,10);
do $$
begin
  if (select count(*) from claimed) <> 0 then raise exception 'leased rows claimed twice'; end if;
end
$$;

select public.record_deletion_retry_result(
  'trip',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  false,
  'STORAGE_REMOVE_FAILED'
);

do $$
begin
  if (select deletion_claimed_until is not null from public.trips where id='10000000-0000-4000-8000-000000000001') then
    raise exception 'failed trip lease not released';
  end if;
  if (select deletion_last_error from public.trips where id='10000000-0000-4000-8000-000000000001') <> 'STORAGE_REMOVE_FAILED' then
    raise exception 'failed trip error not persisted';
  end if;
  if not exists(select 1 from private.deletion_retry_log where subject_kind='trip' and not success and error_code='STORAGE_REMOVE_FAILED') then
    raise exception 'failure log missing';
  end if;
end
$$;

truncate claimed;
insert into claimed select * from public.claim_stale_deletions(1,10);
do $$
begin
  if (select count(*) from claimed) <> 1 then raise exception 'released trip not reclaimed'; end if;
  if (select deletion_attempts from public.trips where id='10000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'trip attempt counter incorrect';
  end if;
end
$$;

update public.trips
set deletion_attempts=12, deletion_claimed_until=null
where id='10000000-0000-4000-8000-000000000001';

truncate claimed;
insert into claimed select * from public.claim_stale_deletions(20,10);
do $$
begin
  if exists(select 1 from claimed where subject_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'attempt ceiling ignored';
  end if;
  if not exists(select 1 from private.stuck_deletions where subject_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'attempt ceiling not surfaced';
  end if;
end
$$;

rollback;
