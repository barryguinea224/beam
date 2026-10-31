# Audit BEAM Travel History — PR de durcissement SQL / Storage / erreurs

**État : PROPOSITION À RELIRE — NON APPLIQUÉE SUR STAGING OU PRODUCTION.**

Branche : `security/travel-sql-storage-errors-hardening`.
Cible : `feature/beam-travel-history-v1`. Ne pas fusionner dans `main`.

## Constat technique sur le staging (31/10/2026)

- La policy `storage supprimer` autorise actuellement un utilisateur authentifié
  à demander directement la suppression d'un objet dans le bucket privé `media`.
  Elle entre en conflit avec le protocole : **Stockage d'abord, ligne `media` ensuite,
  sous privilèges serveur et vérification**.
- `public.account_accepts_writes(uid)` et
  `public.trip_accepts_writes(uid,trip)` sont deux fonctions
  `SECURITY DEFINER` exécutables par `authenticated` dans le schéma
  `public` exposé à PostgREST, sans restriction du paramètre `uid`
  au JWT de l'appelant. L'Advisor Supabase les a signalées.
- L'Advisor a également signalé deux `search_path` configurables
  (`check_trip_dates`, `touch_updated_at`) sur le staging.
- L'Edge Function `travel-delete` renvoie actuellement
  `error.message` d'une exception ; certains messages Storage contiennent
  une information d'infrastructure ou de chemin interne.

**Sources de ce constat :** schéma SQL GitHub, lecture non destructive
des permissions, policies et Advisor du staging. Aucune DDL exécutée sur staging.

## Mesures proposées

1. Déplacer les deux helpers `SECURITY DEFINER` vers le schéma `private`
   non exposé, fixer `search_path=''`, lier chaque argument `uid`
   à `auth.uid()` et limiter `EXECUTE` aux rôles nécessaires à la RLS.
   Recréer les références des policies RLS, puis supprimer les anciennes
   fonctions `public.*`. Ne pas ajouter `private` aux schémas exposés
   par Supabase Data API.
2. Supprimer la policy `storage supprimer` sans toucher aux objets.
   Le navigateur ne doit pas appeler `storage.remove` ; seule l'Edge Function
   `travel-delete`, avec vérification d'absence, peut retirer un fichier.
   Conserver les policies de lecture et d'insertion réservée.
3. Fixer le `search_path` des triggers SQL au schéma vide et retirer
   leurs autorisations `EXECUTE` publiques.
4. Valider les `media_id` et `trip_id` entrants dans l'Edge Function.
   Remplacer toute réponse d'erreur technique par un code neutre stable
   (`DELETE_UNAVAILABLE` / HTTP 503, ou `UNAUTHENTICATED` / HTTP 401).
   Les journaux serveur ne reçoivent que des catégories autorisées,
   jamais le message brut du fournisseur.
5. Tester le SQL et l'Edge Function sur une base PostgreSQL jetable
   avant toute application sur staging.

## Contrôles attendus

- [ ] Exécution de `travel/supabase/schema.sql` depuis zéro sur le banc CI.
- [ ] Exécution de `20261031080000_sql_storage_hardening.sql` **deux fois**
      (idempotence) sur ce banc et réussite des tests SQL.
- [ ] Rejet d'un appel aux deux anciens RPC privilégiés `public.*`.
- [ ] La fonction privée refuse un `uid` différent du JWT courant ;
      le propriétaire conserve son droit d'écriture.
- [ ] L'utilisateur authentifié ne peut **pas** supprimer un objet
      Storage, y compris le sien, avec un JWT et un droit DELETE SQL de test.
- [ ] Les insertions de fichiers réservés et les protections RLS existantes
      fonctionnent toujours.
- [ ] Les réponses d'erreur de l'Edge Function ne divulguent ni chemin,
      ni message SQL, ni e-mail.
- [ ] Revue humaine du patch complet et des workflows avant application.

## Déploiement conditionnel, après approbation

1. Vérifier l'absence de modifications concurrentes des policies et le
   schéma exposé par la Data API. Contrôler les grants `private`.
2. Appliquer la migration SQL **sur le projet STAGING seulement**, avec
   fenêtre de test ; **ne pas appliquer automatiquement pendant la CI**.
3. Réexécuter les tests de sécurité JWT/RLS (A/B), plus un test réel
   `storage.remove` avec une photo réservée : le fichier doit encore
   exister et la ligne `media` rester cohérente. Tester aussi les suppressions
   autorisées via `travel-delete` avec un compte jetable et nettoyage.
4. Vérifier l'Advisor (attendus : plus de fonctions `SECURITY DEFINER`
   exposées ni de fonction à `search_path` modifiable).
5. Mettre à jour et redéployer la seule Edge Function `travel-delete` sur
   staging **après** validation SQL, puis refaire les tests erreurs et UI.
6. La mise en production reste **NO-GO** sans revue finale, secrets
   production distincts et tests équivalents sur le futur projet de production.

**Hors périmètre immédiat :** l'Advisor signale aussi l'extension
`btree_gist` installée dans `public` et la protection des mots de
passe compromis désactivée. Le déplacement d'extension peut affecter
les contraintes d'exclusion et demande une PR dédiée. Le carnet utilise
des OTP sans mot de passe client ; ne pas activer un réglage Auth par
réflexe sans vérifier son impact.
