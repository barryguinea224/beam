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

## Déploiement conditionnel, après approbation — un seul cycle staging

**Ne pas lancer le banc destructif contre une version mixte (ancien `travel-delete`
avec la nouvelle migration SQL, ou inversement).** En cas d'échec intermédiaire,
arrêter les tests destructifs, conserver le staging fermé et diagnostiquer.

1. Avant de démarrer : faire approuver la PR, vérifier le SHA des fichiers,
   l'absence de modifications concurrentes des policies, le schéma exposé
   par la Data API (le schéma `private` ne doit pas y figurer),
   les grants et les comptes jetables autorisés.
2. **Avant d'appliquer la migration**, préparer le déploiement protégé :
   créer un **nouveau jeton Supabase limité au staging** (Edge Functions :
   Read/Write ; Project Settings : Read), expiration **24 h**, placé
   uniquement dans le secret de l'environnement GitHub
   `staging-functions-deploy`. L'environnement doit exiger une revue
   humaine ; ne jamais transmettre le jeton dans le chat ou dans une PR.
   Le workflow `deploy-staging-functions.yml` est désormais limité
   à la **PR #28** et à la branche
   `security/travel-sql-storage-errors-hardening` ; il ne redéploie
   **que `travel-delete`**, pas les autres fonctions.
3. Dans **un même cycle** sur **STAGING seulement** : appliquer
   **`20261031080000_sql_storage_hardening.sql`**, puis ajouter à la
   PR #28 le label **`staging-functions-deploy-approved`** et
   approuver la tâche protégée dans GitHub Actions pour redéployer
   `travel-delete` avec `travel-public-errors.ts`. Ne pas exécuter
   le banc destructif entre ces deux opérations, ni laisser une
   version mixte en service. **Révoquer le jeton** immédiatement après
   validation (ou échec), puis retirer le secret de l'environnement.
   Ne pas appliquer automatiquement la migration pendant la CI.
4. Une fois le code et la base cohérents, vérifier l'Advisor, les tests
   JWT/RLS A/B et le refus de `storage.remove` depuis le client.
   Les suppressions autorisées doivent passer uniquement par `travel-delete`.
5. Déclencher **ensuite** le banc `victim_bench.ts` via son label et
   l'approbation `staging-destructive`. Lorsqu'un objet appartenant au
   compte bloque la suppression, il doit constater **HTTP 503** et
   **`DELETE_UNAVAILABLE`**, puis confirmer via le client administrateur
   que l'utilisateur Auth existe encore, que `profiles.deleting=true`
   et que `deletion_requested_at` reste inchangé. Les codes
   `OWNED_OBJECTS_REMAIN` sont **internes seulement** (journal du worker).
6. Retester l'UI, les messages neutres, la suppression et le nettoyage
   des comptes jetables. Conserver les preuves avant de lever le NO-GO staging.
7. La mise en production reste **NO-GO** sans revue finale, secrets
   production distincts et tests équivalents sur le futur projet de production.

**Hors périmètre immédiat :** l'Advisor signale aussi l'extension
`btree_gist` installée dans `public` et la protection des mots de
passe compromis désactivée. Le déplacement d'extension peut affecter
les contraintes d'exclusion et demande une PR dédiée. Le carnet utilise
des OTP sans mot de passe client ; ne pas activer un réglage Auth par
réflexe sans vérifier son impact.
