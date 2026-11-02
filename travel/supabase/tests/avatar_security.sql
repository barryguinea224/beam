-- Local Supabase ONLY. Transactional hostile A/B, direct Storage and expired account.
\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA public,private,storage TO authenticated;
GRANT SELECT ON public.profiles,public.avatar_media TO authenticated;
DO $grant_local$
BEGIN
  IF NOT has_table_privilege('authenticated','storage.objects','INSERT') THEN
     GRANT INSERT ON storage.objects TO authenticated;
  END IF;
  IF NOT has_table_privilege('authenticated','storage.objects','SELECT') THEN
     GRANT SELECT ON storage.objects TO authenticated;
  END IF;
END $grant_local$;
INSERT INTO auth.users(id) VALUES
 ('ab000000-0000-4000-8000-000000000001'),
 ('ab000000-0000-4000-8000-000000000002');
UPDATE public.profiles SET access_until=current_date+365;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
INSERT INTO public.avatar_media(id,user_id,storage_path,width,height,bytes)
VALUES ('ab100000-0000-4000-8000-000000000001',auth.uid(),
 auth.uid()::text||'/profile/ab100000-0000-4000-8000-000000000001.webp',512,512,10000);
-- Row-first: a valid reservation unlocks only the owner's exact path.
INSERT INTO storage.objects(id,bucket_id,name,owner,owner_id,metadata)
VALUES ('ab200000-0000-4000-8000-000000000001','media',
 auth.uid()::text||'/profile/ab100000-0000-4000-8000-000000000001.webp',
 auth.uid(),auth.uid()::text,'{"size":10000,"mimetype":"image/webp"}'::jsonb);
RESET ROLE;
-- A DB reservation can lie about bytes/MIME; only the actual Storage object
-- may be promoted. Exercise over-limit, wrong MIME and malformed metadata.
DO $avatar_object_metadata$
DECLARE reason text;
BEGIN
 UPDATE storage.objects SET metadata='{"size":2097153,"mimetype":"image/webp"}'::jsonb
  WHERE id='ab200000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.activate_reserved_avatar('ab000000-0000-4000-8000-000000000001',
    'ab100000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'OVERSIZE_AVATAR_WAS_ACTIVATED';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
  IF reason<>'AVATAR_UPLOAD_INVALID' THEN RAISE; END IF;
 END;
 UPDATE storage.objects SET metadata='{"size":10000,"mimetype":"image/png"}'::jsonb
  WHERE id='ab200000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.activate_reserved_avatar('ab000000-0000-4000-8000-000000000001',
    'ab100000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'WRONG_MIME_AVATAR_WAS_ACTIVATED';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
  IF reason<>'AVATAR_UPLOAD_INVALID' THEN RAISE; END IF;
 END;
 UPDATE storage.objects SET metadata='{"size":"not-a-number","mimetype":"image/webp"}'::jsonb
  WHERE id='ab200000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.activate_reserved_avatar('ab000000-0000-4000-8000-000000000001',
    'ab100000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'MALFORMED_AVATAR_SIZE_WAS_ACTIVATED';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
  IF reason<>'AVATAR_UPLOAD_INVALID' THEN RAISE; END IF;
 END;
 IF (SELECT avatar_id FROM public.profiles
     WHERE id='ab000000-0000-4000-8000-000000000001') IS NOT NULL
   THEN RAISE EXCEPTION 'INVALID_AVATAR_CHANGED_PROFILE'; END IF;
 UPDATE storage.objects SET metadata='{"size":10000,"mimetype":"image/webp"}'::jsonb
  WHERE id='ab200000-0000-4000-8000-000000000001';
END $avatar_object_metadata$;
SELECT public.activate_reserved_avatar('ab000000-0000-4000-8000-000000000001',
 'ab100000-0000-4000-8000-000000000001');
DO $assert_activation$
BEGIN
 IF (SELECT avatar_id FROM public.profiles
   WHERE id='ab000000-0000-4000-8000-000000000001')
   IS DISTINCT FROM 'ab100000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'SERVER_AVATAR_ACTIVATION_FAILED'; END IF;
END $assert_activation$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
DO $ab$
DECLARE denied boolean; affected integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.avatar_media
   WHERE user_id='ab000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'B_CAN_READ_A_AVATAR_RESERVATION'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='media'
   AND name='ab000000-0000-4000-8000-000000000001/profile/ab100000-0000-4000-8000-000000000001.webp')
 THEN RAISE EXCEPTION 'B_CAN_READ_A_STORAGE'; END IF;
 denied:=false;
 BEGIN
  UPDATE public.profiles SET avatar_id='ab100000-0000-4000-8000-000000000001'
   WHERE id=auth.uid();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B_CAN_UPDATE_OWN_AVATAR_COLUMN'; END IF;
 denied:=false;
 BEGIN
  UPDATE public.avatar_media SET state='active' WHERE user_id=auth.uid();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B_CAN_CHANGE_AVATAR_RESERVATION'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM public.avatar_media WHERE user_id='ab000000-0000-4000-8000-000000000001';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B_CAN_DELETE_A_RESERVATION'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO public.avatar_media(id,user_id,storage_path,width,height,bytes)
   VALUES('ab100000-0000-4000-8000-000000000002',
     'ab000000-0000-4000-8000-000000000001',
     'ab000000-0000-4000-8000-000000000001/profile/ab100000-0000-4000-8000-000000000002.webp',
     512,512,10000);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B_CAN_RESERVE_A_PATH'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name,owner,owner_id)
   VALUES('ab200000-0000-4000-8000-000000000002','media',
    'ab000000-0000-4000-8000-000000000001/profile/ab100000-0000-4000-8000-000000000001.webp',
    auth.uid(),auth.uid()::text);
 EXCEPTION WHEN insufficient_privilege OR unique_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B_CAN_UPLOAD_IN_A_FOLDER'; END IF;
END $ab$;

RESET ROLE;
UPDATE public.profiles SET access_until=current_date-1
 WHERE id='ab000000-0000-4000-8000-000000000001';
-- Server-only tracked future reservation, created while account still owned.
INSERT INTO public.avatar_media(id,user_id,storage_path,width,height,bytes)
VALUES('ab100000-0000-4000-8000-000000000003',
 'ab000000-0000-4000-8000-000000000001',
 'ab000000-0000-4000-8000-000000000001/profile/ab100000-0000-4000-8000-000000000003.webp',
 512,512,10000);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
DO $expired$
DECLARE denied boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.avatar_media WHERE user_id=auth.uid() AND state='active')
 THEN RAISE EXCEPTION 'EXPIRED_CANNOT_READ_OWN_AVATAR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects
   WHERE name=auth.uid()::text||'/profile/ab100000-0000-4000-8000-000000000001.webp')
 THEN RAISE EXCEPTION 'EXPIRED_CANNOT_READ_OWN_STORAGE'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO public.avatar_media(id,user_id,storage_path,width,height,bytes)
   VALUES('ab100000-0000-4000-8000-000000000004',auth.uid(),
    auth.uid()::text||'/profile/ab100000-0000-4000-8000-000000000004.webp',
    512,512,10000);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'EXPIRED_CAN_RESERVE_AVATAR'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name,owner,owner_id)
   VALUES('ab200000-0000-4000-8000-000000000003','media',
    auth.uid()::text||'/profile/ab100000-0000-4000-8000-000000000003.webp',
    auth.uid(),auth.uid()::text);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'EXPIRED_CAN_UPLOAD_RESERVED_AVATAR'; END IF;
END $expired$;
RESET ROLE;
DO $grants$
BEGIN
 IF has_column_privilege('authenticated','public.profiles','avatar_id','UPDATE')
 OR has_table_privilege('authenticated','public.avatar_media','UPDATE')
 OR has_table_privilege('authenticated','public.avatar_media','DELETE')
 OR has_function_privilege('authenticated','public.activate_reserved_avatar(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.retire_reserved_avatar(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'AVATAR_PRIVILEGE_REGRESSION'; END IF;
END $grants$;
ROLLBACK;
\echo PASS avatar SQL security RLS, row-first Storage, expired read-only, service-only pointer
