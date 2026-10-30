# Relecture des cartes visuelles V1 — issue #17

**Statut :** PR en brouillon, **aucune migration exécutée sur staging**. Le PDF factuel n'est pas modifié et n'inclut jamais la couverture.

## Migration SQL à examiner
`travel/supabase/migrations/20261030200000_travel_cover_media_identity.sql`

La nouvelle colonne nullable `trips.cover_media_id uuid` est reliée à `media` par une **clé étrangère composite** :

```sql
foreign key (cover_media_id,id,user_id)
references public.media(id,trip_id,user_id)
on delete set null (cover_media_id)
```

La contrainte de référence `media_cover_identity unique(id,trip_id,user_id)` sert de clé composite. Ainsi, une photo ne peut être choisie que si son `trip_id` et son `user_id` sont identiques à ceux de la ligne `trips`. À la suppression de la photo, PostgreSQL ne met **que `cover_media_id`** à `NULL` (ni `trip.id` ni `trip.user_id`), sans supprimer le voyage.

La seule autorisation ajoutée au client est `UPDATE(cover_media_id)` sur `trips`, sous la policy RLS existante `voyages modification`. Le client ne reçoit pas de nouvelles permissions pour déplacer des médias ou modifier des propriétaires.

## Préflight en lecture seule sur staging, après relecture

```sql
select
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='trips'
      and column_name='cover_media_id') as column_already_present,
  (select count(*) from public.trips) as trips_count,
  (select count(*) from public.media) as photos_count;
```

Attendu avant la migration : `column_already_present = false`. Si un schéma déjà modifié est détecté, **arrêter**, ne pas rejouer le SQL.

## UI et confidentialité
- Une carte de voyage affiche pays, ville(s), drapeau SVG local, code ISO, dates, durée et motif, sous un voile sombre.
- Photo choisie par le propriétaire (réellement enregistrée) → illustration WebP locale du pays → fond neutre CSS.
- La galerie possède un bouton **Choisir comme couverture** et **Retirer la couverture** pour l'image sélectionnée.
- La couverture est chargée uniquement quand la carte devient visible via `IntersectionObserver`, après lecture RLS de `media` filtrée **par ID photo + ID voyage + ID propriétaire**, puis URL signée Supabase de 300 secondes.
- Les URL sont acceptées uniquement si leur origine correspond au projet Supabase configuré et si leur chemin est celui du bucket privé signé `media`. Pas de stockage local des URLs.
- En cas de lien expiré/erreur d'image, illustration locale puis CSS neutre. Aucun chargement décoratif depuis une CDN, Unsplash, Wikimedia, ou un autre tiers.
- Les dessins sont 6 WebP originaux (480×204, chacun **moins de 4 Ko**) : France, Maroc, Guinée, Arabie saoudite, Turquie et Sénégal. Les autres pays utilisent un fond neutre.
- Drapeaux SVG localement versionnés depuis **flag-icons v7.6.0, MIT**, actuellement 30 pays/territoires prioritaires (licence dans `travel/assets/flags/LICENSE`). Les autres affichent nom + code ISO sans drapeau manquant ou appel réseau.
- Attribution et inventaire précis : `travel/assets/CREDITS.md`.

## Tests et séquence d'exploitation
1. GitHub CI doit être entièrement verte : PostgreSQL 16 jetable (nouveau schéma + scénario de migration, références inter-voyages et inter-propriétaires refusées, photo supprimée → `NULL`) ; données privées et URL host-check ; Playwright 320/360/390px.
2. Relecture humaine du SQL **avant** toute application sur staging.
3. Préflight staging SELECT (ci-dessus) ; puis autorisation explicite d'appliquer la migration.
4. Application staging ; tests réels JWT A/B pour les deux contrôles SQL et la suppression de couverture, puis essai Samsung : photo choisie, carte visuelle, suppression, fallback. Inspecter les requêtes réseau.
5. PR de la branche du carnet vers `main` toujours bloquée jusqu'à audit final et décision produit explicite.

Aucun ajout photo, aucune activité ni aucun champ d'identité nouveau dans le PDF factuel V1.
