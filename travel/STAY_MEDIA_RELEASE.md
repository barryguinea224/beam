# Déploiement — photos du vol et de l'hébergement (BTH)

**Champ de portée :** deux rôles visuels facultatifs (`airline_media_id`,
`hotel_media_id`) sur `public.trips`. Chacun pointe vers **une photo déjà
enregistrée dans le même séjour et appartenant au même propriétaire**, comme
`cover_media_id`. Les trois rôles peuvent référencer **la même photo**. La
suppression côté serveur d'une photo remet ses références à NULL automatiquement.
Aucune nouvelle photo ni logo de marque n'est fourni.

Par défaut, si un nom de compagnie ou d'hôtel existe sans photo choisie,
un SVG original public de BEAM est utilisé. Le champ sans nom n'affiche rien.

## Ordre impératif

1. **SQL sur staging** : vérifier l'état des migrations antérieures, appliquer
   `travel/supabase/migrations/20261105100000_trips_stay_media.sql`
   dans un accès d'administration hors dépôt, et confirmer les FK et grants.
   Ne pas rejouer `schema.sql` : c'est le schéma d'installation vierge.
2. **Test de l'aperçu de PR vers main** : après revue et fusion de cette PR
   dans `feature/beam-travel-history-v1`, utiliser le déploiement d'aperçu
   de la PR d'intégration vers `main` avec staging **uniquement**. Vérifier
   Android 320/360/390, noms absents/présents, sélection des rôles, suppression
   serveur d'une photo, recharge, livret A5 et journal simple, en comptes fictifs.
3. **SQL en production** : après validation de l'aperçu, appliquer la même
   migration idempotente en production. Vérifier les deux colonnes (et,
   si nécessaire, la mise à jour du cache de schéma PostgREST).
4. **Fusion vers main** : uniquement après succès des validations, puis
   constater le déploiement publié et le cache PWA **v23**. Vérifier à nouveau
   les deux types de carnet sur le site public.

En cas de blocage, ne pas déployer le client avant le SQL : l'API doit connaître
les nouvelles colonnes. Un ancien client fonctionne après la migration.

## Invariants de confidentialité

- Aucune clé/secrète ni donnée réelle client en Git.
- Les deux SVG dans `travel/assets/` ne contiennent aucun nom, logo ou
  livrée d'une compagnie/hôtel. Ils sont publics et sans tracking.
- Les photos restent dans Storage privé, quota **10 par séjour**, avec URL
  signée temporaire seulement en mémoire ; aucun cache privé.
- La sélection passe par l'UPDATE de la colonne de rôle sur le séjour
  (RLS propriétaire + interdiction d'écriture après expiration + FK composite).
  Le navigateur n'a **jamais** le droit de supprimer les fichiers Storage.
- Le PDF factuel garde **exactement ses six champs** : aucun nom ni visuel
  de transport/hébergement.
