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

## Photos privées (PR dédiée, non fusionnée)
- JPEG, PNG ou WebP fixes uniquement. HEIC/HEIF et vidéo refusés avec message compréhensible. 10 photos maximum par voyage ; 8 Mo maximum pour chaque fichier d'origine.
- Réencodage côté navigateur via canvas en **WebP** (1800 px de grand côté maximum, qualité 0,82). **Seul le nouveau Blob WebP est téléversé** ; le fichier original et ses métadonnées EXIF/GPS ne sont pas envoyés par ce parcours.
- Galerie depuis le bucket privé `media` (liens temporaires), téléchargement du WebP réencodé, suppression exclusivement via la fonction authentifiée `travel-delete` (pas de DELETE direct des lignes).
- Si des photos échouent après la sauvegarde du voyage, le voyage reste enregistré : l'interface explique le succès partiel et permet de reprendre uniquement les photos manquantes.
- **Test réel obligatoire après fusion sur la prévisualisation PR #3** : JPEG portrait pris sur téléphone (sens), fichier HEIC/HEIF et vidéo (refus), 11e photo et photo >8 Mo (refus), photo géolocalisée importée puis **retéléchargée** et inspectée pour confirmer l'absence d'EXIF/GPS. Les tests Node vérifient le contrat et la conversion simulée, pas le moteur caméra de chaque appareil.
