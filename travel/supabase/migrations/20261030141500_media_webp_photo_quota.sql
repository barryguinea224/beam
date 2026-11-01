-- Apply only to the isolated BEAM Travel History staging DB after CI.
-- No deletion of photos or Storage objects; no cron.
-- Check current records before tightening the path / bucket.
do $$
begin
  if exists (select 1 from public.media where storage_path !~ '[.]webp$') then
    raise exception 'NON_WEBP_MEDIA_ROWS_EXIST';
  end if;
  if exists (select 1 from storage.objects where bucket_id='media' and name !~ '[.]webp$') then
    raise exception 'NON_WEBP_STORAGE_OBJECTS_EXIST';
  end if;
  if exists (select 1 from (select trip_id from public.media group by trip_id having count(*) > 10) q) then
    raise exception 'PHOTO_QUOTA_ALREADY_EXCEEDED';
  end if;
end $$;

alter table public.media drop constraint path_belongs_to_trip;
alter table public.media add constraint path_belongs_to_trip check (
  storage_path ~ ('^' || user_id::text || '/' || trip_id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$')
);

update storage.buckets
  set allowed_mime_types=array['image/webp']::text[]
  where id='media';
do $$
begin
  if not exists(select 1 from storage.buckets where id='media' and allowed_mime_types=array['image/webp']::text[]) then
    raise exception 'MEDIA_BUCKET_WEBP_SETTING_NOT_APPLIED';
  end if;
end $$;

-- Serialize quota decisions on the owned trip row, not the media count.
-- Concurrent INSERTs targeting the same trip then see the committed count in order.
create index if not exists media_trip_quota_idx on public.media(trip_id);

create or replace function public.enforce_media_photo_quota() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare
  locked_trip uuid;
  existing_count integer;
begin
  -- Editing captions/order does not consume a new slot. Moving media to a
  -- different trip does, and must never bypass the destination quota.
  if tg_op='UPDATE' and new.trip_id=old.trip_id and new.user_id=old.user_id then
    return new;
  end if;

  select t.id into locked_trip
  from public.trips t
  where t.id=new.trip_id and t.user_id=new.user_id and not t.deleting
  for update;

  if locked_trip is null then
    raise exception using errcode='23514',message='PHOTO_TRIP_UNAVAILABLE';
  end if;

  select count(*) into existing_count
  from public.media m where m.trip_id=new.trip_id;
  if existing_count >= 10 then
    raise exception using errcode='23514',message='PHOTO_LIMIT_REACHED';
  end if;

  return new;
end $$;

revoke execute on function public.enforce_media_photo_quota()
  from public,anon,authenticated;
drop trigger if exists media_photo_quota_before_write on public.media;
create trigger media_photo_quota_before_write
  before insert or update of trip_id,user_id on public.media
  for each row execute function public.enforce_media_photo_quota();
