-- Disposable local Supabase only. All fictional records rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('a9000000-0000-4000-8000-000000000001','album-owner@example.test'),
 ('a9000000-0000-4000-8000-000000000002','album-other@example.test');
update public.profiles set access_until=(current_date + interval '1 year')::date
 where id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose,title) values
 ('a9100000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','FR','2026-01-01','2026-01-03','tourisme','Paris, enfin.'),
 ('a9100000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000001','MA','2026-02-01','2026-02-03','tourisme',null),
 ('a9100000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000002','SN','2026-03-01','2026-03-03','tourisme',null);
insert into public.activities(id,user_id,trip_id,title) values
 ('a9200000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','Musée imaginaire'),
 ('a9200000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000002','Autre séjour'),
 ('a9200000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000003','Autre compte');
insert into public.media(id,user_id,trip_id,storage_path,kind,bytes) values
 ('a9300000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001/a9100000-0000-4000-8000-000000000001/a9300000-0000-4000-8000-000000000001.webp','photo',1024);
set local role authenticated;
select set_config('request.jwt.claim.sub','a9000000-0000-4000-8000-000000000001',true);
update public.media set activity_id='a9200000-0000-4000-8000-000000000001'
 where id='a9300000-0000-4000-8000-000000000001';
do $verify$
declare rejected boolean;
begin
 if not exists(select 1 from public.media where id='a9300000-0000-4000-8000-000000000001'
  and activity_id='a9200000-0000-4000-8000-000000000001') then
  raise exception 'VALID_LINK_REJECTED';
 end if;
 rejected:=false;
 begin
  update public.media set activity_id='a9200000-0000-4000-8000-000000000002'
   where id='a9300000-0000-4000-8000-000000000001';
 exception when check_violation or foreign_key_violation then rejected:=true; end;
 if not rejected then raise exception 'OTHER_TRIP_LINK_ACCEPTED'; end if;
 rejected:=false;
 begin
  update public.media set activity_id='a9200000-0000-4000-8000-000000000003'
   where id='a9300000-0000-4000-8000-000000000001';
 exception when check_violation or foreign_key_violation then rejected:=true; end;
 if not rejected then raise exception 'OTHER_USER_LINK_ACCEPTED'; end if;
 rejected:=false;
 begin
  update public.trips set title=repeat('X',61)
   where id='a9100000-0000-4000-8000-000000000001';
 exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'LONG_TITLE_ACCEPTED'; end if;
end $verify$;
reset role;
delete from public.activities where id='a9200000-0000-4000-8000-000000000001';
do $deletion$
begin
 if exists(select 1 from public.media
  where id='a9300000-0000-4000-8000-000000000001' and activity_id is not null)
 then raise exception 'ACTIVITY_DELETE_FAILED_TO_UNLINK_PHOTO'; end if;
end $deletion$;
rollback;
