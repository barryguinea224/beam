# BTH — Activités sur plusieurs jours et « Voyagé avec »

**PR exclusivement vers `feature/beam-travel-history-v1`.** Ne pas modifier `main` ni la base hébergée depuis GitHub Actions. Les étapes `trip_stops` sont explicitement **hors périmètre** et feront l'objet d'une PR dépendante séparée.

## Mise en service dans cet ordre

1. **SQL staging** — Sauvegarder le schéma et appliquer **uniquement** `travel/supabase/migrations/20261107100000_activity_duration_companions.sql` au projet Supabase staging, dans une transaction. Sur une installation vierge uniquement, utiliser `travel/supabase/schema.sql`. Rejouer la migration deux fois dans une base de validation ; elle doit être idempotente.
2. **Vérifications staging** — Tester un compte actif et un autre compte fictifs, une durée de 1, 3 et 30 jours, les refus pour 0 et 31 jours, la traversée d'un mois et du 31 décembre, le dépassement de la date de sortie, l'édition de la date de sortie incompatible, le champ compagnons vide ou de 200 caractères, et l'échappement des chaînes HTML. Vérifier les champs dans la fiche et les PDF personnels ; le PDF factuel ne doit recevoir aucun nouveau champ.
3. **Aperçu de la future PR vers `main`** — Cette PR n'est pas une PR vers `main` : après fusion dans la branche de travail, ouvrir la PR de publication. Son aperçu doit utiliser **staging uniquement**. Tester sur Android aux largeurs 320, 360 et 390 px, sans données réelles.
4. **SQL production** — Après feu vert staging/aperçu, sauvegarder la base et appliquer **uniquement** la migration à la production, dans une transaction avec vérification des privilèges. Ne pas y injecter de fixtures.
5. **Fusion / publication** — Fusionner ensuite la PR de publication vers `main`. Contrôler le cache `activity-companions-v32` de `travel/sw.js`, la connexion, les carnets et les nouvelles écritures.

## Sécurité et rétrocompatibilité

- Les activités existantes conservent `duration_days=1` ; aucune modification aux contraintes `trips.no_overlap`.
- L'activité sans date peut avoir une durée ; si elle est datée, son dernier jour doit rester dans les dates du voyage. Modifier la fin du voyage pour exclure une activité est également refusé.
- Les politiques RLS existantes des voyages et activités sont inchangées. Seules les colonnes `activities.duration_days` et `trips.companions` reçoivent les nouveaux grants `INSERT/UPDATE` au rôle `authenticated`.
- `companions` est un texte privé facultatif (1 à 200 caractères). Le formulaire demande les prénoms ou liens uniquement ; pas de nom complet, numéro de téléphone ou document.
- Les journaux/livrets chargent explicitement `duration_days` et `companions` ; le PDF ambassade reste strictement identique.
- Les contrôles automatisés utilisent un PostgreSQL Supabase local et des fixtures strictement fictives ; ils effectuent `ROLLBACK`. Aucun jeton de service, donnée réelle, sortie d'identité ou fichier local non suivi n'est intégré.
