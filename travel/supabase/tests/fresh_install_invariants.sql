-- Canonical BEAM Travel History — fresh local Supabase invariant checks.
-- This file is safe to execute ONLY against the disposable Supabase CLI database.
-- No secrets, no network calls, no mutations. psql must use ON_ERROR_STOP=1.
DO $check$
DECLARE
  t text;
  p text;
  n integer;
BEGIN
  -- Expected Supabase schemas and six application tables, including private logs.
  FOREACH t IN ARRAY ARRAY[
    'public.profiles','public.trips','public.activities','public.media',
    'private.deletion_retry_log','private.deletion_retry_runs'
  ] LOOP
    IF to_regclass(t) IS NULL THEN RAISE EXCEPTION 'MISSING_APP_TABLE: %',t; END IF;
  END LOOP;

  IF to_regclass('public.travel_history_pdf') IS NULL THEN
    RAISE EXCEPTION 'FACTUAL_PDF_VIEW_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.travel_history_pdf'::regclass
    AND reloptions @> ARRAY['security_invoker=true']::text[]
  ) THEN RAISE EXCEPTION 'PDF_VIEW_MUST_USE_SECURITY_INVOKER'; END IF;

  FOREACH t IN ARRAY ARRAY['public.profiles','public.trips','public.activities','public.media'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=t::regclass AND relrowsecurity)
       THEN RAISE EXCEPTION 'RLS_DISABLED: %', t; END IF;
    IF has_table_privilege('anon',t,'SELECT')
      OR has_table_privilege('anon',t,'INSERT')
      OR has_table_privilege('anon',t,'UPDATE')
      OR has_table_privilege('anon',t,'DELETE')
    THEN RAISE EXCEPTION 'ANON_TABLE_PRIVILEGE: %',t; END IF;
  END LOOP;

  -- No other customer's rows, no unrestricted browser deletion.
  FOREACH t IN ARRAY ARRAY['public.trips','public.media'] LOOP
    IF has_table_privilege('authenticated',t,'DELETE') THEN
      RAISE EXCEPTION 'BROWSER_CAN_DELETE_PRIVATE_OBJECTS: %',t; END IF;
    IF has_column_privilege('authenticated',t,'user_id','UPDATE') THEN
      RAISE EXCEPTION 'BROWSER_CAN_REASSIGN_OWNER: %',t; END IF;
  END LOOP;
  IF has_column_privilege('authenticated','public.media','storage_path','UPDATE')
  THEN RAISE EXCEPTION 'BROWSER_CAN_REASSIGN_STORAGE_PATH'; END IF;
  IF has_column_privilege('authenticated','public.profiles','deleting','UPDATE')
    OR has_column_privilege('authenticated','public.profiles','id','UPDATE')
  THEN RAISE EXCEPTION 'BROWSER_CAN_CHANGE_PROTECTED_PROFILE_FIELDS'; END IF;
  IF NOT has_column_privilege('authenticated','public.profiles','phone','UPDATE')
    OR NOT has_column_privilege('authenticated','public.profiles','postal_address','UPDATE')
    OR NOT has_column_privilege('authenticated','public.profiles','country_of_residence','UPDATE')
  THEN RAISE EXCEPTION 'MISSING_OPTIONAL_CONTACT_COLUMN_GRANTS'; END IF;

  -- RLS action-by-action allowlist. Each policy must be owner-scoped.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','trips','activities','media')) <> 12
  THEN RAISE EXCEPTION 'INCORRECT_APPLICATION_RLS_POLICY_COUNT'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('profiles','trips','activities','media')
    AND ('anon'=ANY(roles) OR 'public'=ANY(roles)
      OR (coalesce(qual,'')||coalesce(with_check,'')) NOT LIKE '%auth.uid()%')
  ) THEN RAISE EXCEPTION 'APPLICATION_POLICY_MISSING_OWNER_CONDITION'; END IF;

  -- Private photo bucket: no public access and only owner-scoped SELECT/INSERT.
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id='media' AND public=false
    AND file_size_limit=10485760 AND allowed_mime_types=ARRAY['image/webp']::text[]
  ) THEN RAISE EXCEPTION 'MEDIA_BUCKET_NOT_PRIVATE_WEBP_ONLY'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
  THEN RAISE EXCEPTION 'STORAGE_OBJECTS_RLS_DISABLED'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND policyname IN ('storage lire','storage ajouter')) <> 2
  THEN RAISE EXCEPTION 'EXPECTED_STORAGE_POLICIES_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND (cmd IN ('DELETE','UPDATE','ALL') AND ('authenticated'=ANY(roles) OR 'public'=ANY(roles)))
  ) THEN RAISE EXCEPTION 'CLIENT_CAN_REPLACE_OR_DELETE_STORAGE_OBJECTS'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='storage ajouter' AND cmd='INSERT' AND 'authenticated'=ANY(roles)
      AND with_check LIKE '%private.trip_accepts_writes%'
      AND with_check LIKE '%storage_path%'
  ) THEN RAISE EXCEPTION 'STORAGE_RESERVATION_OR_OWNER_GUARD_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='storage lire' AND cmd='SELECT' AND 'authenticated'=ANY(roles)
      AND qual LIKE '%private.account_accepts_writes%'
  ) THEN RAISE EXCEPTION 'STORAGE_READ_OWNER_GUARD_MISSING'; END IF;

  -- A privileged helper must not become publicly callable.
  FOREACH p IN ARRAY ARRAY[
    'private.account_accepts_writes(uuid)',
    'private.trip_accepts_writes(uuid,uuid)',
    'public.count_owned_storage_objects(uuid)',
    'public.count_stuck_deletions()',
    'public.claim_stale_deletions(integer,integer)',
    'public.count_stale_deletion_retry_runs()',
    'public.count_failed_deletion_retry_runs_24h()'
  ] LOOP
    IF to_regprocedure(p) IS NULL THEN RAISE EXCEPTION 'MISSING_PRIVILEGED_FUNCTION: %',p; END IF;
    IF has_function_privilege('anon',p,'EXECUTE') THEN
      RAISE EXCEPTION 'ANON_PRIVILEGED_RPC: %',p; END IF;
  END LOOP;

  -- pg_cron and pg_net are installed in this disposable stack, never scheduled.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')
   OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
  THEN RAISE EXCEPTION 'LOCAL_EXTENSIONS_NOT_ENABLED'; END IF;
  IF (SELECT count(*) FROM cron.job) <> 0 THEN
    RAISE EXCEPTION 'SCHEMA_MUST_NOT_SCHEDULE_WORKERS'; END IF;

  RAISE NOTICE 'PASS fresh schema: 6 tables, RLS, grants, private Storage, privileged functions, extensions, no cron jobs';
END $check$;
