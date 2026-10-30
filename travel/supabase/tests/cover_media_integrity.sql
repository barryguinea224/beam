-- Disposable PostgreSQL only. No real traveler data and no staging writes.
begin;
insert into auth.users(id) values
  ('30000000-0000-4000-8000-000000000031'),
  ('30000000-0000-4000-8000-000000000032');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
  ('40000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000031','FR','2026-01-01','2026-01-03','tourisme'),
  ('40000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031','MA','2026-02-01','2026-02-03','tourisme'),
  ('40000000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000032','GN','2026-01-01','2026-01-03','tourisme');
insert into public.media(id,user_id,trip_id,storage_path,kind,bytes) values
 ('50000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000031','40000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000031/50000000-0000-4000-8000-000000000031.webp','photo',123),
 ('50000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031','40000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031/40000000-0000-4000-8000-000000000032/50000000-0000-4000-8000-000000000032.webp','photo',123),
 ('50000000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000032','40000000-0000-4000-8000-000000000033','30000000-0000-4000-8000-000000000032/40000000-0000-4000-8000-000000000033/50000000-0000-4000-8000-000000000033.webp','photo',123);

do $$
declare blocked boolean;
begin
  if not exists(select 1 from pg_constraint where conname='trips_cover_same_trip_owner' and contype='f') then
    raise exception 'cover composite FK not installed';
  end if;
  if has_column_privilege('authenticated','public.trips','user_id','UPDATE') then
    raise exception 'Browser can modify trip owner';
  end if;
  if not has_column_privilege('authenticated','public.trips','cover_media_id','UPDATE') then
    raise exception 'Browser cannot select the cover';
  end if;

  -- Valid same-user same-trip photo.
  update public.trips set cover_media_id='50000000-0000-4000-8000-000000000031'
    where id='40000000-0000-4000-8000-000000000031';
  if (select cover_media_id from public.trips where id='40000000-0000-4000-8000-000000000031')
     <> '50000000-0000-4000-8000-000000000031'::uuid then
    raise exception 'Valid cover rejected';
  end if;

  -- Same owner but DIFFERENT trip.
  blocked:=false;
  begin
    update public.trips set cover_media_id='50000000-0000-4000-8000-000000000032'
      where id='40000000-0000-4000-8000-000000000031';
  exception when foreign_key_violation then blocked:=true;
  end;
  if not blocked then raise exception 'CROSS_TRIP_COVER_ACCEPTED'; end if;

  -- DIFFERENT owner and DIFFERENT trip.
  blocked:=false;
  begin
    update public.trips set cover_media_id='50000000-0000-4000-8000-000000000033'
      where id='40000000-0000-4000-8000-000000000031';
  exception when foreign_key_violation then blocked:=true;
  end;
  if not blocked then raise exception 'CROSS_OWNER_COVER_ACCEPTED'; end if;

  -- Delete unrelated photo: cover stays.
  delete from public.media where id='50000000-0000-4000-8000-000000000032';
  if (select cover_media_id from public.trips where id='40000000-0000-4000-8000-000000000031')
     <> '50000000-0000-4000-8000-000000000031'::uuid then
    raise exception 'UNRELATED_DELETE_CLEARED_COVER';
  end if;

  -- Delete selected cover: automatically clears cover, does not delete trip.
  delete from public.media where id='50000000-0000-4000-8000-000000000031';
  if (select cover_media_id from public.trips where id='40000000-0000-4000-8000-000000000031') is not null
     or not exists(select 1 from public.trips where id='40000000-0000-4000-8000-000000000031')
  then raise exception 'SELECTED_COVER_NOT_AUTOCLEARED'; end if;

  -- Empty is allowed and does not touch the trip or owner.
  if (select user_id from public.trips where id='40000000-0000-4000-8000-000000000031')
     <> '30000000-0000-4000-8000-000000000031'::uuid then
    raise exception 'DELETE_CHANGED_OWNER';
  end if;
  raise notice 'COVER_INTEGRITY_PASS_same_trip_same_owner_delete_sets_null';
end $$;
rollback;
