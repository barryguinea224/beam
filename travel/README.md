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

## Installation PWA — confidentialité avant tout (PR séparée)
- PWA strictement sous `/travel/` (manifest `display: standalone`, icônes PNG 192, 512 et 512 maskable).
- Le service worker `/travel/sw.js` précharge **uniquement** une liste fermée de fichiers publics (code HTML/CSS/JS, carte, drapeaux, manifest, icônes et configuration publique), mais sert **toujours le réseau en premier** (`cache: no-store`), même si une ancienne version existe en cache. Il n'utilise le cache qu'en secours si le réseau échoue et n'écrit **jamais** dynamiquement les réponses HTTP dans le cache. Un correctif en ligne ne dépend donc pas d'un changement manuel de `CACHE_NAME`.
- Toutes les requêtes hors liste sont transmises directement au navigateur : API Supabase, authentification, photographies privées, liens temporaires signés, PDF, URLs contenant des paramètres (y compris jetons). Les CDN externes ne sont pas stockés.
- Déconnexion et suppression confirmée : fermeture de la session Supabase locale, suppression des clés d'authentification propres au projet, retrait des données privées visibles en mémoire et destruction des caches `beam-travel-shell-*` (sans effacer ceux d'autres applications).
- Si le navigateur est déjà ouvert lors d'une perte de réseau, il masque immédiatement les données privées et affiche **« Connexion nécessaire pour consulter votre carnet »**. En cas de navigation sans réseau, le service worker sert une page d'information *nouvellement construite, non mise en cache*. Après déconnexion, le cache public est effacé et ne permet plus de rouvrir le carnet offline ; la page d'information reste disponible tant que le service worker contrôle la navigation.
- Aucune saisie ou synchronisation hors ligne en V1. Les données personnelles restent côté Supabase.
- En mode installé, le bouton et l'aide privilégient le **code e-mail à six chiffres**. Le lien magique peut ouvrir Chrome en dehors de la PWA installée.
- Tests `tests/travel-pwa-privacy.cjs` : manifest, dimensions des icônes, exclusion de toute réponse Supabase ou URL signée du cache, navigation hors ligne, purge isolée, nettoyage des jetons locaux.
- **Borne de l'audit :** l'absence de mise en cache par le service worker n'annule pas les caches HTTP natifs des fournisseurs externes. Avant ouverture publique, vérifier également les directives HTTP de Supabase/Storage et la politique de session sur appareils partagés. Faire évoluer `CACHE_NAME` pour renouveler volontairement les ressources de secours préchargées ; **ce changement n'est pas requis pour recevoir un correctif en ligne**, puisque tous les fichiers publics passent en réseau d'abord. Les tests CI simulent une ancienne ressource mise en cache et vérifient qu'une nouvelle réponse réseau l'emporte.
