# BTH — Étapes d'un voyage : procédure de mise en service

Cette PR cible exclusivement **feature/beam-travel-history-v1**, depuis la branche de base après fusion de #102. Ne modifier ni main ni aucune base hébergée depuis GitHub Actions.

## Ordre de mise en service (obligatoire)
1. **SQL staging** — Faire une sauvegarde, puis exécuter *uniquement* la migration idempotente \`travel/supabase/migrations/20261107150000_trip_stops.sql\` sur le projet staging dans une transaction. Pour un projet vierge utiliser \`travel/supabase/schema.sql\` (ne pas le rejouer sur une base existante). Vérifier les contraintes, la clé composite, RLS et le maintien de \`trips.no_overlap\`.
2. **Essai staging** — Créer des voyages et étapes **strictement fictifs** sur un compte dédié; tester deux propriétaires, un compte expiré, les dates, chevauchements, 10 étapes maximum, édition du voyage, suppression en cascade, et les écrans Android à 320/360/390 px. Vérifier les drapeaux, le filtrage par pays, les lignes de vol, les statistiques et les carnets.
3. **Aperçu de la future PR vers \`main\`** — Après fusion de cette PR sur la branche BTH, tester l'aperçu de publication **vers main**, connecté **uniquement à staging**. Contrôler le PDF ambassade réel dans Chrome et le PDF natif Android : ligne de voyage à six champs, étape en retrait, plusieurs pages, absence de contenu privé. Revoir les cas de données sans étape.
4. **SQL production** — Après validation formelle, sauvegarder la base et appliquer cette migration **uniquement** sur Supabase production, en transaction. Vérifier RLS, privilèges et déclencheurs. Ne créer aucune donnée de démonstration sur production.
5. **Fusion** — Fusionner alors la PR de publication vers \`main\` ; vérifier la PWA (cache **trip-stops-v33**) et les chemins PDF. Prévoir un retour arrière testé en staging.

## Contrat et limites
- \`trips.no_overlap\` reste strictement inchangé. Une étape est un sous-intervalle d'un voyage et ne peut être située dans le même pays que celui-ci.
- \`trip_stops\` est lié par clé étrangère composite \`(trip_id,user_id)\` à \`trips(id,user_id)\` et supprimé en cascade. Les changements du voyage qui invalideraient les étapes sont refusés. Il y a au plus dix étapes; les dates se chevauchant sont rejetées.
- Les privilèges existants de \`trips\`, \`activities\`, \`media\`, profils, compagnons, compagnie et hôtel sont **conservés sans élargissement**. Seule la nouvelle table reçoit ses droits limités, avec RLS propriétaire et compte actif.
- Le PDF ambassade conserve strictement les six champs du voyage. Les étapes proviennent d'une requête distincte liée à la même identité et rendue sous chaque voyage. Ni accompagnants ni compagnie, hôtel, activités, photos, notes ou numéro de fidélité ne doivent entrer dans le PDF factuel.
- Dans le code des carnets, les stages sont attachés à \`trip.stops\` sur la vraie sélection avant génération. Les jours de voyage ne sont jamais additionnés avec les jours des étapes.
- Les tests CI utilisent une base Docker Supabase locale, des comptes fictifs et \`ROLLBACK\`. Le scénario France/Allemagne 2026 est un spécimen de rendu, pas un voyage réellement réservé; aucun secret ni dossier client n'est stocké.
