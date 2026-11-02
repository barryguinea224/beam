# Staging — banc hostile A/B après migration `access_until` (PR #58)

La migration staging a été appliquée et contrôlée le **2 novembre 2026** : `dates_manquantes = 0`, **6 profils**, tous avec `access_until = 2028-11-02`, y compris les deux identités de test A/B. Le SQL utilisé, conservé pour référence, figure dans `travel/supabase/STAGING_ACCESS_EXPIRY_SETUP.sql`. **Ne le réexécute pas pour déclencher le banc.**

## Exécution et sécurité

- Le workflow `.github/workflows/hostile-ab.yml` retrouve son fonctionnement initial : automatique sur les PR vers `main` ou `feature/beam-travel-history-v1`, environnement **`staging`** et **aucune clé serveur**. Les secrets restent ceux déjà utilisés : `STAGING_URL`, `STAGING_ANON_KEY`, `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL` et `TEST_B_PASSWORD`. Aucun secret `STAGING_SERVICE_ROLE_KEY` requis ni ajouté.
- Dans `travel/supabase/tests/hostile_ab.ts`, **A et B sont des comptes CI préexistants**. Immédiatement après leur connexion et **avant toute écriture**, leurs JWT respectifs lisent leur propre `profiles.access_until`. Si l'échéance est absente, illisible ou antérieure à la date du jour, le banc échoue avec un message français explicite. Le banc ne crée pas d'utilisateur et ne modifie aucune échéance.
- Les tests d'expiration (écritures refusées, consultation des voyages et photos préservée, et privilèges de suppression serveur) restent dans `travel/supabase/tests/access_expiry_guards.sql`, exécuté en CI sur **Supabase locale jetable**, jamais en écrivant une date expirée sur staging.
- **À renouveler avant le 2 novembre 2028 :** prolonger dans le **SQL Editor staging** les dates d'accès des comptes fictifs **A et B**. Sinon, à partir du **3 novembre 2028**, leurs écritures seront refusées et le banc échouera. Garder la clé serveur hors de GitHub; les dates sont administrées manuellement en SQL.

Le banc A/B utilise de vrais JWT et les services réels **sur staging uniquement**; la migration doit être en place avant son déclenchement. Aucune action nécessaire en production, où l'échéance du propriétaire a déjà été configurée.
