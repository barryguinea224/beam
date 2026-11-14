-- Run after schema.sql or the new migration against a disposable local DB only.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('dc100000-0000-4000-8000-000000000001','cover-owner-a@example.invalid'),
 ('dc100000-0000-4000-8000-000000000002','cover-owner-b@example.invalid');
update public.profiles
 set access_until=current_date+365
 where id in ('dc100000-0000-4000-8000-000000000001',
              'dc100000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
 ('dc200000-0000-4000-8000-000000000001','dc100000-0000-4000-8000-000000000001','SN','2025-05-01','2025-05-06','tourisme'),
 ('dc200000-0000-4000-8000-000000000002','dc100000-0000-4000-8000-000000000002','GN','2025-05-01','2025-05-06','tourisme');

do $quota$
declare uid uuid:='dc100000-0000-4000-8000-000000000001';
 tid uuid:='dc200000-0000-4000-8000-000000000001';
 mid uuid;
 rejected boolean;
 i integer;
begin
 for i in 1..15 loop
  mid:=gen_random_uuid();
  insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
   values(mid,tid,uid,uid::text||'/'||tid::text||'/'||mid::text||'.webp','photo',1024);
 end loop;
 if (select count(*) from public.media where trip_id=tid)<>15
 then raise exception 'FIFTEENTH_PHOTO_DENIED'; end if;
 rejected:=false;
 begin
  mid:=gen_random_uuid();
  insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
   values(mid,tid,uid,uid::text||'/'||tid::text||'/'||mid::text||'.webp','photo',1024);
 exception when sqlstate '23514' then
  if sqlerrm <> 'PHOTO_LIMIT_REACHED' then raise exception 'WRONG_QUOTA_ERROR: %',sqlerrm;end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'SIXTEENTH_PHOTO_ALLOWED'; end if;
end $quota$;
-- A different owner's photo cannot be selected as our profile cover.
do $ownership$
declare
 other_image uuid:=gen_random_uuid();
 other_uid uuid:='dc100000-0000-4000-8000-000000000002';
 other_trip uuid:='dc200000-0000-4000-8000-000000000002';
 own_uid uuid:='dc100000-0000-4000-8000-000000000001';
 own_image uuid;
 rejected boolean:=false;
begin
 insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
 values(other_image,other_trip,other_uid,
  other_uid::text||'/'||other_trip::text||'/'||other_image::text||'.webp','photo',1024);
 begin
  update public.profiles set cover_media_id=other_image where id=own_uid;
 exception when foreign_key_violation then rejected:=true;
 end;
 if not rejected then raise exception 'OTHER_OWNER_COVER_ACCEPTED'; end if;

 select id into own_image from public.media where user_id=own_uid limit 1;
 update public.profiles set cover_media_id=own_image where id=own_uid;
 if (select cover_media_id from public.profiles where id=own_uid) is distinct from own_image
 then raise exception 'OWN_COVER_NOT_STORED';end if;
 delete from public.media where id=own_image;
 if (select cover_media_id from public.profiles where id=own_uid) is not null
 then raise exception 'DELETED_COVER_STILL_REFERENCED';end if;
end $ownership$;
-- Assign a remaining owner photo, then verify that expiration cannot clear it.
update public.profiles p set cover_media_id=(
 select m.id from public.media m where m.user_id=p.id limit 1
) where p.id='dc100000-0000-4000-8000-000000000001';
update public.profiles set access_until=current_date-1
where id='dc100000-0000-4000-8000-000000000001';
do $valid$
begin
 if private.account_accepts_writes('dc100000-0000-4000-8000-000000000001') then
  raise exception 'EXPIRED_ACCOUNT_ACCEPTS_WRITES';
 end if;
end $valid$;
set local role authenticated;
select set_config('request.jwt.claim.sub','dc100000-0000-4000-8000-000000000001',true);
do $readonly$
declare affected int:=0;
begin
 begin
  update public.profiles set cover_media_id=null where id=auth.uid();
  get diagnostics affected=row_count;
 exception when insufficient_privilege or check_violation then
  affected:=0;
 end;
 if affected<>0 then raise exception 'READONLY_COVER_MODIFIED';end if;
end $readonly$;
reset role;
do $verify$
begin
 if not exists (select 1 from public.profiles
  where id='dc100000-0000-4000-8000-000000000001'
   and cover_media_id is not null) then
  raise exception 'READONLY_COVER_WAS_CLEARED';
 end if;
end $verify$;
rollback;
\echo 'PASS 15th accepted / 16th rejected, owner FK, cascade null, expired RLS'
