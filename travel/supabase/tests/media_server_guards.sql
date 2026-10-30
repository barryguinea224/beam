-- Photo quota / path / bucket constraints (rolled back; no real Storage writes).
begin;
insert into auth.users(id) values
('30000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','GN','2021-01-01','2021-01-02','autre'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','SN','2021-02-01','2021-02-02','autre');

do $$
declare
  uid uuid := '30000000-0000-4000-8000-000000000001';
  tid uuid := '40000000-0000-4000-8000-000000000001';
  other_uid uuid := '30000000-0000-4000-8000-000000000002';
  other_tid uuid := '40000000-0000-4000-8000-000000000002';
  mid uuid;
  i integer;
  caught boolean;
begin
  if (select allowed_mime_types from storage.buckets where id='media')
      is distinct from array['image/webp']::text[] then
    raise exception 'media bucket must allow WebP only';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.media'::regclass
      and tgname='media_photo_quota_before_write' and tgenabled='O') then
    raise exception 'photo quota trigger is not enabled';
  end if;
  if has_function_privilege('anon','public.enforce_media_photo_quota()','EXECUTE')
     or has_function_privilege('authenticated','public.enforce_media_photo_quota()','EXECUTE') then
    raise exception 'quota trigger function callable by browser roles';
  end if;

  for i in 1..10 loop
    mid:=gen_random_uuid();
    insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
    values(mid,tid,uid,uid::text||'/'||tid::text||'/'||mid::text||'.webp','photo',1024);
  end loop;
  if (select count(*) from public.media where trip_id=tid)<>10 then
    raise exception 'ten media inserts should be accepted';
  end if;

  caught:=false;
  begin
    mid:=gen_random_uuid();
    insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
    values(mid,tid,uid,uid::text||'/'||tid::text||'/'||mid::text||'.webp','photo',1024);
  exception when check_violation then
    caught:=true;
  end;
  if not caught then raise exception 'eleventh photo was accepted'; end if;

  caught:=false;
  begin
    mid:=gen_random_uuid();
    insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
    values(mid,tid,uid,uid::text||'/'||tid::text||'/'||mid::text||'.jpg','photo',1024);
  exception when check_violation then
    caught:=true;
  end;
  if not caught then raise exception 'JPEG path was accepted'; end if;

  mid:=gen_random_uuid();
  insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
  values(mid,other_tid,other_uid,other_uid::text||'/'||other_tid::text||'/'||mid::text||'.webp','photo',1024);
  -- A different trip gets its own quota; moving into a full trip must fail.
  caught:=false;
  begin
    update public.media set trip_id=tid,user_id=uid,
      storage_path=uid::text||'/'||tid::text||'/'||mid::text||'.webp'
    where id=mid;
  exception when check_violation then
    caught:=true;
  end;
  if not caught then raise exception 'move into full trip bypassed quota'; end if;
  if (select count(*) from public.media where trip_id=other_tid)<>1 then
    raise exception 'blocked move changed previous trip';
  end if;
end $$;
rollback;
