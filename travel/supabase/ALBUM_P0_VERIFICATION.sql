-- Run after applying 2026111810000_trip_album_p0.sql. Exactly three boolean checks.
select (
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='trips' and column_name='title')
 and exists(select 1 from pg_constraint where conrelid='public.trips'::regclass and conname='trips_album_title_length')
 and exists(select 1 from pg_constraint where conrelid='public.trips'::regclass and conname='trips_cover_same_trip_owner')
) as titre_et_couverture_ok;

select (
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='media' and column_name='activity_id')
 and exists(select 1 from pg_constraint where conrelid='public.media'::regclass and conname='media_album_activity_identity_fk')
 and exists(select 1 from pg_trigger where tgrelid='public.media'::regclass and tgname='media_album_activity_guard' and not tgisinternal)
) as association_securisee_ok;

select (
 has_column_privilege('authenticated','public.trips','title','UPDATE')
 and has_column_privilege('authenticated','public.media','activity_id','UPDATE')
 and not has_column_privilege('authenticated','public.media','user_id','UPDATE')
 and not has_table_privilege('authenticated','public.media','DELETE')
 and (select count(*) from information_schema.columns where table_schema='public'
      and table_name='travel_history_pdf'
      and column_name in ('title','activity_id','cover_media_id'))=0
) as privileges_et_pdf_ok;
