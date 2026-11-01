-- STAGING ONLY — BEAM Travel History, access expiry setup.
-- Copier-coller TOUT CE BLOC d'un seul coup dans le SQL Editor de STAGING.
-- Ne pas lancer ce script en production. Aucun client réel sur staging.
-- Tout est atomique : migration puis accès à 2 ans, même transaction.
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_until date;
REVOKE UPDATE(access_until) ON public.profiles FROM authenticated;

CREATE OR REPLACE FUNCTION private.account_accepts_writes(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT uid = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = uid AND NOT p.deleting AND p.access_until >= CURRENT_DATE
    );
$$;

CREATE OR REPLACE FUNCTION private.trip_accepts_writes(uid uuid, trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.account_accepts_writes(uid)
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip AND t.user_id = uid AND NOT t.deleting
    );
$$;

-- Ne pas lier la LECTURE des photos au droit d'écriture.
DROP POLICY IF EXISTS "storage lire" ON storage.objects;
CREATE POLICY "storage lire" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND NOT p.deleting
    )
  );

-- STAGING uniquement : tous les profils existants reçoivent une échéance
-- identique dans exactement deux ans, sans cas particulier ni vraie clientèle.
UPDATE public.profiles
SET access_until = (CURRENT_DATE + INTERVAL '2 years')::date;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE access_until IS DISTINCT FROM (CURRENT_DATE + INTERVAL '2 years')::date
  ) THEN RAISE EXCEPTION 'STAGING_ACCESS_DATE_NOT_SET_FOR_ALL_PROFILES'; END IF;
  IF has_column_privilege('authenticated','public.profiles','access_until','UPDATE')
  THEN RAISE EXCEPTION 'SECURITY_CLIENT_CAN_EDIT_ACCESS_UNTIL'; END IF;
  IF NOT has_column_privilege('authenticated','public.profiles','access_until','SELECT')
  THEN RAISE EXCEPTION 'SECURITY_CLIENT_CANNOT_READ_ACCESS_UNTIL'; END IF;
  RAISE NOTICE 'STAGING_OK: tous les profils ont une date à 2 ans et aucun client ne peut la modifier';
END $verify$;

COMMIT;

-- Vérification après COMMIT (lecture seule).
SELECT count(*) AS profils_staging,
       count(*) FILTER (WHERE access_until IS NULL) AS dates_manquantes,
       min(access_until) AS premiere_echeance,
       max(access_until) AS derniere_echeance
FROM public.profiles;
