-- Only for disposable PostgreSQL CI fixture, NOT staging.
-- Real Supabase grants SELECT on exposed tables; emulate it for RLS tests.
grant select on public.profiles to authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

do $$
begin
 if not has_column_privilege('authenticated','public.profiles','phone','UPDATE')
    or not has_column_privilege('authenticated','public.profiles','postal_address','UPDATE')
    or not has_column_privilege('authenticated','public.profiles','display_name','UPDATE')
    or has_column_privilege('authenticated','public.profiles','deleting','UPDATE')
    or has_column_privilege('authenticated','public.profiles','id','UPDATE')
 then raise exception 'Column grants missing, excessive or existing profile edits were revoked';end if;
 if has_table_privilege('anon','public.profiles','SELECT')
    or has_table_privilege('anon','public.profiles','UPDATE')
 then raise exception 'Anonymous role can inspect/edit declared contacts';end if;
end $$;

insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare n integer;
 bad_phone text;
begin
 update public.profiles set phone='+224612345678',postal_address='Kaloum, Conakry'
  where id='11111111-1111-4111-8111-111111111111';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Owner cannot save own optional contacts';end if;

 update public.profiles set display_name='Compte actif'
  where id='11111111-1111-4111-8111-111111111111';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Existing display_name update unexpectedly revoked';end if;

 update public.profiles set phone='+224600000000'
  where id='22222222-2222-4222-8222-222222222222';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross-owner update succeeded';end if;

 begin
  update public.profiles set phone='224612345678'
   where id='11111111-1111-4111-8111-111111111111';
  raise exception 'Invalid phone was accepted';
 exception when check_violation then null;
 end;
 begin
  update public.profiles set phone='+123456789012345678901234567890'
   where id='11111111-1111-4111-8111-111111111111';
  raise exception 'Too long phone was accepted';
 exception when check_violation then null;
 end;
 begin
  update public.profiles set postal_address=repeat('a',301)
   where id='11111111-1111-4111-8111-111111111111';
  raise exception 'Long address was accepted';
 exception when check_violation then null;
 end;
 -- Reject too-short international codes, letters, unnormalized national
 -- numbers, formatted numbers and numbers longer than 15 digits.
 for bad_phone in
  select unnest(array[
   '+1','abc','+2246220956301234567',
   '622095630','00224622095630','+224 622 09 56 30'
  ])
 loop
  begin
   update public.profiles set phone=bad_phone
    where id='11111111-1111-4111-8111-111111111111';
   raise exception 'Invalid phone accepted: %',bad_phone;
  exception when check_violation then null;
  end;
 end loop;
 update public.profiles set phone=null,postal_address=null
  where id='11111111-1111-4111-8111-111111111111';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Clearing contacts not allowed';end if;
end $$;
reset role;

update public.profiles set deleting=true,deletion_requested_at=now()
 where id='11111111-1111-4111-8111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare n integer;
begin
 update public.profiles set phone='+224611111111'
  where id='11111111-1111-4111-8111-111111111111';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Deleted account was able to write contacts';end if;
end $$;
reset role;

-- The factual PDF view contract is unchanged, and can never expose contacts.
do $$
declare columns text[];
begin
 select array_agg(column_name order by ordinal_position) into columns
 from information_schema.columns
 where table_schema='public' and table_name='travel_history_pdf';
 if columns<>array['user_id','country_code','cities','entry_date','exit_date',
                   'duration_days','purpose']::text[]
 then raise exception 'Factual PDF view projection modified: %',columns;end if;
end $$;
select 'PASS optional profile contacts: constraints, owner-only RLS, deleting barrier, column grants, view isolation' as result;
