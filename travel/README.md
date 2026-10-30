# BEAM Travel History V1

Espace personnel de mémoire de voyage : voyages, activités, notes, photos privées et export PDF factuel.

## Scope V1
- Magic link e-mail via Supabase Auth
- Carte et historique
- Ajouter/modifier un voyage
- Activités et notes privées
- Photos privées uniquement (pas de vidéo en V1)
- Réencodage navigateur des photos avant upload pour retirer EXIF/GPS
- PDF : pays, villes, entrée, sortie, durée, motif **uniquement** ; aucune note, photo ou activité
- Aucun passeport, visa ou justificatif

## Installation
1. Créer un projet Supabase en Europe.
2. Exécuter `supabase/schema.sql` dans SQL Editor.
3. Activer l'authentification e-mail par lien magique.
4. Copier `config.example.js` vers `config.js` et renseigner uniquement l'URL Supabase et la clé publique anon/publishable.
5. Ne jamais ajouter `service_role` au navigateur ou au dépôt.


## Travel History PDF V1 — contrat factuel et confidentiel
- Source unique : `public.travel_history_pdf` (vue `security_invoker` filtrant les voyages **intérieurs** et **en cours de suppression**).
- Projection fermée : `country_code,cities,entry_date,exit_date,duration_days,purpose`. Jamais `select('*')` ; requête également filtrée par `user_id` sous RLS.
- En-tête obligatoire : **« Voyageur : [nom déclaré] »**, issu exclusivement de `profiles.display_name` (80 caractères maximum) et **« Document généré le JJ/MM/AAAA »** (date locale du navigateur). Aucun numéro de passeport, carte ou autre document d'identité.
- Si `display_name` est vide, l'export est **bloqué** et renvoie vers le champ « Nom du voyageur (pour le PDF) » dans **Mon compte**, avec confirmation d'enregistrement Supabase. Pas de nom déduit de l'e-mail ni de valeur anonyme de secours.
- Les noms de pays proviennent uniquement de `travel/countries.js`, partagé avec la carte, les menus de saisie et le PDF (Suède comprise).
- **Toujours exclus** : photos, couvertures, souvenirs, notes, activités, URLs de fichiers, voyages intérieurs, voyages en cours de suppression. Aucune option « inclure mes souvenirs » en V1.
- Mention imprimée **sur chaque page** : « Historique déclaré par l'utilisateur, non délivré par une autorité officielle ».
- Un nouvel onglet local, composé uniquement de texte autorisé, propose `Imprimer / Enregistrer au format PDF` via l'impression native de Chrome. Aucun document n'est envoyé à un service de création PDF.
- Tests : `tests/travel-factual-pdf.cjs` (liste fermée, injection, droits de vue), `tests/travel-factual-pdf-layout.cjs` (PDF Chromium A4 multipage, mention à chaque page et zéro image), puis contrôle sur téléphone avant fusion.

## Suppression
Les lignes métier sont en `ON DELETE CASCADE`. Les objets du bucket Storage doivent aussi être supprimés via l'API Storage avant/simultanément à la suppression du compte. La V1 ne doit pas afficher « supprimer mon compte » tant que ce workflow serveur n'est pas implémenté et testé.

## Photos privées (PR dédiée, non fusionnée)
- JPEG, PNG ou WebP fixes uniquement. HEIC/HEIF et vidéo refusés avec message compréhensible. 10 photos maximum par voyage ; 8 Mo maximum pour chaque fichier d'origine.
- Réencodage côté navigateur via canvas en **WebP** (1800 px de grand côté maximum, qualité 0,82). **Seul le nouveau Blob WebP est téléversé** ; le fichier original et ses métadonnées EXIF/GPS ne sont pas envoyés par ce parcours.
- Galerie depuis le bucket privé `media` (liens temporaires), téléchargement du WebP réencodé, suppression exclusivement via la fonction authentifiée `travel-delete` (pas de DELETE direct des lignes).
- **Réservation avant envoi (PR suivante, revue requise)** : créer une ligne `media` soumise au quota SQL de dix, puis envoyer le WebP. La policy `storage ajouter` exige que cette ligne du même propriétaire existe pour le chemin exact. Si l'envoi échoue, le serveur `travel-delete` retire le fichier éventuel avant la ligne ; s'il ne peut confirmer le nettoyage, l'interface demande de supprimer la vignette « Prévisualisation indisponible ». Le navigateur n'obtient pas de privilège DELETE direct sur `media`. La migration doit être relue avant application sur staging.
- Cette protection bloque les **nouveaux** uploads sans réservation, mais ne purge pas les éventuels objets orphelins historiques. Une fermeture brutale du navigateur peut laisser une réservation sans fichier, récupérable par suppression manuelle ou ultérieure maintenance.
- Si des photos échouent après la sauvegarde du voyage, le voyage reste enregistré : l'interface explique le succès partiel et permet de reprendre uniquement les photos manquantes.
- **Test réel obligatoire après fusion sur la prévisualisation PR #3** : JPEG portrait pris sur téléphone (sens), fichier HEIC/HEIF et vidéo (refus), 11e photo et photo >8 Mo (refus), photo géolocalisée importée puis **retéléchargée** et inspectée pour confirmer l'absence d'EXIF/GPS. Les tests Node vérifient le contrat et la conversion simulée, pas le moteur caméra de chaque appareil.
