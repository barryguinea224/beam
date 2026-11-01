# Staging — migration et banc hostile d’expiration (PR #58)

## Avant le banc

1. Dans **Supabase STAGING uniquement**, SQL Editor, copier l'intégralité de `travel/supabase/STAGING_ACCESS_EXPIRY_SETUP.sql` dans **une seule exécution**. La transaction ajoute la colonne, reconfigure les RLS/Storage, puis met **tous** les profils staging à `current_date + 2 years` avant le commit.
2. Vérifier en sortie : `dates_manquantes = 0` et `premiere_echeance = derniere_echeance` (s'il existe des profils). Aucune migration ne doit être exécutée sur la production déjà configurée.
3. Dans GitHub, vérifier **uniquement** l'environnement protégé `staging-destructive` : un reviewer doit approuver manuellement le run avant la libération du secret `STAGING_SERVICE_ROLE_KEY`. Définir ce secret **uniquement** dans cet environnement (comme pour `victim_bench.ts`), **jamais** dans `staging`, dans le navigateur, dans `travel/config.js` ou dans la PR. L'environnement doit aussi disposer de `STAGING_URL`, `STAGING_ANON_KEY`, `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL` et `TEST_B_PASSWORD`, toutes valeurs propres à staging. Ne pas recopier de secret dans les logs ou les messages.
4. **Seulement après la confirmation de l'étape 2**, lancer manuellement GitHub Actions → **Hostile A/B — Staging** → **Run workflow**, sélectionner la branche `feature/travel-access-expiry-readonly-20261101`, cocher `staging_migration_applied`, puis approuver l'environnement `staging-destructive` après vérification du commit.

Le job `hostile-ab` ne se lance **plus** sur les événements de PR/synchronize/push. Le job `schema-parse` et le contrôle TypeScript peuvent tourner en CI sans aucun accès à staging. Le script refuse tout domaine différent de `coigbvhxywbmqgacmhzf.supabase.co` et refuse les écritures si `profiles.access_until` est absent.

Les comptes de test **A/B préexistent** et se connectent avec leurs mots de passe CI; leurs dates sont remises à deux ans **immédiatement après connexion, avant leurs écritures**, via le client serveur. Le troisième compte `+ci-expired-*` est **créé à chaque exécution**, reçoit immédiatement une date active via le client serveur, crée un voyage et une photo, est expiré par le serveur, puis doit perdre tous ses droits d'écriture directe tout en conservant les lectures des photos et du PDF. Il doit enfin pouvoir supprimer son compte via `travel-delete`. Nettoyage de secours par l'administrateur uniquement pour le compte éphémère en cas d'échec du test.

⚠️ Le banc effectue de véritables écritures et une véritable suppression **sur staging exclusivement**; ne pas le démarrer avant la migration et l'autorisation explicite.
