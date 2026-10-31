-- PostgreSQL-only hostile Storage INSERT tests. Transaction is rolled back.
-- Supabase deployment still requires explicit review before staging application.
begin;
create or replace function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
alter table storage.objects enable row level security;
grant usage on schema auth,storage,public to authenticated;
grant execute on function auth.uid() to authenticated;
-- Grant DELETE in the fixture to prove the RLS policy, not table grants, blocks it.
grant select,insert,delete on storage.objects to authenticated;
grant select on public.media to authenticated;
-- The real client can read its own trips; the disposable PostgreSQL
-- harness must explicitly grant SELECT to exercise the invoker trigger.
grant select on public.trips to authenticated;
insert into auth.users(id) values
 ('30000000-0000-4000-8000-000000000021'),
 ('30000000-0000-4000-8000-000000000022');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
values('40000000-0000-4000-8000-000000000021',
       '30000000-0000-4000-8000-000000000021',
       'GN','2020-02-01','2020-02-02','autre');
insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
values('50000000-0000-4000-8000-000000000021',
       '40000000-0000-4000-8000-000000000021',
       '30000000-0000-4000-8000-000000000021',
       '30000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000021/50000000-0000-4000-8000-000000000021.webp',
       'photo',1024);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000021',true);
do $$
declare rejected boolean;
begin
  -- A valid trip alone must NOT permit an arbitrary Storage upload.
  rejected := false;
  begin
    insert into storage.objects(id,bucket_id,name,owner,owner_id)
    values('60000000-0000-4000-8000-000000000021','media',
      '30000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000021/60000000-0000-4000-8000-000000000021.webp',
      '30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000021');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'UNRESERVED_STORAGE_UPLOAD_ACCEPTED'; end if;

  -- The exact owner/path already reserved in media MUST work.
  insert into storage.objects(id,bucket_id,name,owner,owner_id)
  values('50000000-0000-4000-8000-000000000021','media',
    '30000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000021/50000000-0000-4000-8000-000000000021.webp',
    '30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000021');
end $$;

-- An authenticated client must NEVER directly delete a Storage object, even
-- if it is the owner and has SQL DELETE table privilege in the fixture.
do $$
declare removed bigint;
begin
  delete from storage.objects
  where bucket_id='media'
    and name='30000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000021/50000000-0000-4000-8000-000000000021.webp';
  get diagnostics removed = row_count;
  if removed <> 0 then raise exception 'AUTHENTICATED_DIRECT_STORAGE_DELETE_ACCEPTED'; end if;
end $$;

-- The browser must not recycle a reserved media row into a new Storage path.
-- Run as the same authenticated owner, not as a database administrator.
do $$
declare
  col text;
  refused boolean;
  changed_count bigint;
  photo_id uuid := '50000000-0000-4000-8000-000000000021';
begin
  foreach col in array array[
    'storage_path', 'trip_id', 'user_id', 'bytes',
    'id', 'kind', 'width', 'height', 'created_at'
  ] loop
    refused := false;
    begin
      -- Even SET col = col must be denied: PostgreSQL checks SET privileges.
      execute format('update public.media set %1$I=%1$I where id=$1', col)
        using photo_id;
    exception when insufficient_privilege then
      refused := true;
    end;
    if not refused then
      raise exception 'MEDIA_IMMUTABLE_COLUMN_UPDATE_ACCEPTED: %', col;
    end if;
  end loop;

  -- Harmless annotations must remain editable by the owner.
  update public.media
    set caption='Souvenir', taken_on=date '2026-10-30',
        is_favorite=true, position=7
    where id=photo_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'MEDIA_SAFE_COLUMN_UPDATE_FAILED';
  end if;
  if not exists (
    select 1 from public.media
    where id=photo_id and caption='Souvenir'
      and taken_on=date '2026-10-30' and is_favorite=true and position=7
  ) then
    raise exception 'MEDIA_SAFE_COLUMN_UPDATE_INCORRECT';
  end if;
end $$;

select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000022',true);
do $$
declare rejected boolean := false;
begin
  -- Another user must not upload an object for A's reserved photo.
  begin
    insert into storage.objects(id,bucket_id,name,owner,owner_id)
    values('60000000-0000-4000-8000-000000000022','media',
      '30000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000021/50000000-0000-4000-8000-000000000021.webp',
      '30000000-0000-4000-8000-000000000022','30000000-0000-4000-8000-000000000022');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'CROSS_OWNER_STORAGE_UPLOAD_ACCEPTED'; end if;
end $$;
rollback;
