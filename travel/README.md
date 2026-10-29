# BEAM Travel History V1

Espace personnel de mémoire de voyage : voyages, activités, notes, photos privées et export PDF factuel.

## Scope V1
- Magic link e-mail via Supabase Auth
- Carte et historique
- Ajouter/modifier un voyage
- Activités et notes privées
- Photos privées uniquement (pas de vidéo en V1)
- Réencodage navigateur des photos avant upload pour retirer EXIF/GPS
- PDF : destination, dates, durée, motif uniquement
- Aucun passeport, visa ou justificatif

## Installation
1. Créer un projet Supabase en Europe.
2. Exécuter `supabase/schema.sql` dans SQL Editor.
3. Activer l'authentification e-mail par lien magique.
4. Copier `config.example.js` vers `config.js` et renseigner uniquement l'URL Supabase et la clé publique anon/publishable.
5. Ne jamais ajouter `service_role` au navigateur ou au dépôt.

## Suppression
Les lignes métier sont en `ON DELETE CASCADE`. Les objets du bucket Storage doivent aussi être supprimés via l'API Storage avant/simultanément à la suppression du compte. La V1 ne doit pas afficher « supprimer mon compte » tant que ce workflow serveur n'est pas implémenté et testé.

## Photos
L'application réencode les images côté navigateur (canvas -> WebP/JPEG) avant upload. Le fichier original et ses métadonnées EXIF/GPS ne sont pas envoyés au bucket par le parcours normal.
