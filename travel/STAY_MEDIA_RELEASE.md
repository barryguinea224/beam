# BEAM Travel History — images pour la compagnie et l'hébergement

Deux illustrations originales, sans logos, servent de repli dès que le voyageur
renseigne `airline` ou `hotel`. Une photo privée déjà enregistrée dans le
même voyage peut remplacer chaque illustration, sans dépasser le quota de 10
photos. Une même photo peut servir aux trois usages (couverture/vol/hôtel).
La suppression serveur d'une photo choisie remet le champ lié à NULL.

## Ordre impératif pour la mise en service

1. Faire relire cette PR et laisser terminer **toutes** les vérifications CI.
2. Appliquer **uniquement** `travel/supabase/migrations/20261105070000_trips_stay_media.sql`
   sur une base **staging**, puis recharger le schéma PostgREST si nécessaire.
3. Sur l'aperçu de la PR vers `main` (accès à la prévisualisation privé),
   avec deux comptes fictifs : vérifier illustrations, choix et retrait d'une
   photo existante, même photo pour les trois rôles, tentative interdite entre
   utilisateurs/séjours, suppression de photo, livret A5, journal, Android
   320/360/390 px, PDF factuel toujours sur ses six champs.
4. Après validation seulement, appliquer **le même SQL** en production.
   Vérifier le schéma API, tester un compte fictif sur la production en accès
   protégé, puis fusionner la PR de publication dans `main`.
5. Après déploiement, vérifier la mise à jour du cache public v23 sur Android,
   y compris les deux SVG, sans cache des URL signées ou données personnelles.

Ne jamais lancer `schema.sql` sur une base existante. Aucun déploiement ou
mutation de staging/production ne se fait via cette PR. Toutes les données
de test sont fictives et locales. Les deux SVG sont des créations BEAM sans
logo, marque ou livrée. Ne photographiez jamais votre carte d’embarquement
ni votre confirmation de réservation : elles contiennent des numéros personnels.
