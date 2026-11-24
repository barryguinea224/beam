# J'y étais — direction artistique « atlas intime »

> Depuis la PR 4, les valeurs de référence (couleurs, typographie, espacements) sont celles de la section 5 « Design system ». La section 2 décrit la direction « carnet » des PR 1 à 3, conservée pour l'historique.

Statut : PR 1 (fondations + accueil). Les autres écrans seront refaits dans des PR suivantes, un écran à la fois. Pas de migration SQL, pas de nouveau JavaScript, pas de nouvelle dépendance.

## 1. Audit de l'existant

### Mesures dans le code (avant cette PR)

| Constat | Mesure |
| --- | --- |
| Feuilles de style | 19 fichiers CSS + 1 bloc `<style>` d'environ 340 lignes dans `index.html`, empilés couche après couche |
| `!important` | 206 occurrences : chaque correctif écrase le précédent au lieu de le remplacer |
| Arrondis | 20 valeurs différentes (2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24 px, 99 px, 999 px, 50 %) |
| Couleurs | 242 codes hexadécimaux distincts, aucune variable partagée hormis `--g`, `--bg`, `--ink`, `--muted`, `--line` |
| Graisses | 54 déclarations en 700 à 900 ; titres en Poppins Bold partout |
| Ombres et dégradés | 26 ombres, 8 dégradés, dont l'en-tête (dégradé + ombre + bas arrondi 28 px) |

### Ce qui donne l'impression « interface générée par IA »

- **Tout est une carte.** Statistiques, pays, actions et voyages sont chacun enfermés dans un conteneur avec bordure, fond et arrondi. L'œil ne sait plus ce qui compte.
- **Des arrondis sans système.** Vingt rayons différents, souvent pris au hasard (13, 15, 22 px), avec des pastilles en 999 px pour les filtres et les compteurs.
- **De la décoration à la place de la hiérarchie.** Le dégradé, l'ombre portée et le grand arrondi de l'en-tête « font premium » sans rien dire. Le premier chiffre des statistiques est doré sans raison.
- **Des pastilles partout** : nombre de continents, pays, filtres actifs, bouton Carte / Filtrer / Trier, drapeaux sur les cartes de voyage.
- **Du gras partout.** Quand le nom, les chiffres, les boutons et les titres sont tous en 700, plus rien ne ressort.
- **Le hors-ligne traité comme une alerte** : un bandeau plein, alors que c'est un état normal pour une PWA.

### Audit par écran (à traiter dans les prochaines PR)

| Écran | Problèmes principaux | Priorité |
| --- | --- | --- |
| Accueil | Corrigé dans cette PR (voir section 3) | Fait |
| Cartes de voyages (`trip-premium.css`, `visual-cards.css`) | Grandes vignettes illustrées arrondies, voile sombre, pastille drapeau, titres très gras ; barre collante Carte / Filtrer / Trier en pilules | Haute |
| Fiche voyage (`trip-premium.css`, `trip-album.css`) | 15 rayons différents, 5 ombres ; boutons superposés à l'image ; « cartes dans des cartes » pour les étapes et les activités | Haute |
| Formulaires (`date-range-picker.css`, `index.html`) | 8 rayons dans le calendrier, champs en pilule sur certains écrans et carrés sur d'autres ; labels en gras | Moyenne |
| Fenêtres modales (`photo-sheet.css`, `#pdfDialog`) | Fonds sombres opaques différents d'une modale à l'autre ; ombres lourdes ; bouton Fermer textuel ou icône selon l'écran | Moyenne |
| Paramètres (`account-settings.css`, `loyalty.css`) | Sections en cartes bordées, titres en 500 ou 700 selon le bloc ; zone de suppression bien isolée (à garder) | Moyenne |
| États vides (`#welcomeCard`) | Étapes en boutons cerclés façon « checklist SaaS » | Moyenne |
| Boutons et icônes | Trois familles de boutons (pilule 999 px, 10 px, texte souligné) ; icônes de 15 à 22 px avec des traits de 1,8 px variables | Moyenne |
| Navigation | Bouton flottant « + » de 56 px avec ombre, qui s'ajoute au bouton principal | Basse |
| Hors ligne | Corrigé sur l'accueil ; l'écran de chargement (`#offlineSkeleton`) garde des blocs arrondis 14 à 18 px | Basse |
| Ordinateur | Corrigé dans la PR 2 : colonne de lecture centrée de 720 px, « Ma carte » n'est plus rogné | Fait |

## 2. Direction artistique

**Principe :** un carnet de voyage personnel, pas un tableau de bord. Moins d'éléments, mieux placés. Le papier (ivoire) est le fond, l'encre (vert profond) porte l'identité, le doré n'apparaît qu'en touche.

Les fondations sont des variables CSS dans `carnet.css`, à réutiliser écran par écran.

| Famille | Valeurs |
| --- | --- |
| Couleurs | Vert profond `#1B4332` · vert texte `#174d3a` · ivoire `#f7f5ef` · papier `#fbfaf6` · encre `#17231f` · gris secondaire `#59675f` · filet `#dcdad1` · doré `#C9962E` (jamais en texte sur ivoire) |
| Arrondis | 0, 4 px, 8 px. Le cercle est réservé à l'avatar et aux points d'état |
| Typographie | Poppins (titres et chiffres) et police système (texte). 5 tailles : 12, 14, 16, 20, 28 px. Graisses 400, 500 (nom du voyageur) et 600 |
| Espacements | Base 4 px : 4, 8, 12, 16, 24, 32 |
| Ombres et dégradés | Aucun. La hiérarchie passe par la taille, la graisse, l'espace et des filets de 1 px |

### Contrastes vérifiés (WCAG AA)

| Texte | Fond | Rapport |
| --- | --- | --- |
| Encre `#17231f` | Ivoire `#f7f5ef` | 14,9:1 |
| Vert texte `#174d3a` | Ivoire | 8,9:1 |
| Gris secondaire `#59675f` | Ivoire | 5,5:1 |
| Texte secondaire `#c9d8ce` | Vert profond `#1B4332` | 7,5:1 |

## 3. Ce que change cette PR (accueil)

| Élément | Avant | Après |
| --- | --- | --- |
| En-tête | 294 px, dégradé, ombre, bas arrondi 28 px | 174 px (−41 % à 360 px), vert uni, angles droits sur mobile |
| Statistiques | 3 cartes de 95 px, premier chiffre doré | Une ligne « 1 voyage │ 1 pays │ 11 jours », filets fins |
| Paramètres | Rond de 44 px avec fond et bordure | Simple icône de 20 px, zone tactile de 44 px conservée |
| Avatar et nom | 64 px, nom en Bold 26 px | 56 px, anneau doré fin, nom en SemiBold 20 px |
| Carte du monde | 270 px de haut, coins 16 px | 272 à 320 px sur mobile, 460 px sur ordinateur, coins 4 px et filet |
| Nombre de continents | Pastille verte | Texte discret à droite du titre |
| Pays | Pastilles bordées | Liste typographique « France 1   Maroc À venir », 44 px tactiles |
| Mon carnet / PDF ambassade | Deux grandes tuiles, dont une vert plein | Deux lignes de liste avec filets et chevron |
| Hors ligne | Bandeau plein vert pâle | Une ligne grise avec un point doré ; le texte reste explicite |

Cache hors ligne : `carnet.css` est ajouté au shell du service worker et la version du cache passe à `v74`, pour que les utilisateurs reçoivent le nouveau style.

## 3 bis. PR 2 — affinage après essai sur Android

| Élément | Correction |
| --- | --- |
| Carte du monde | Le conteneur suit les proportions réelles calculées par l'app (plus de hauteur fixe ni minimale) : 0 px de vide au lieu de 147 px pour un planisphère entier à 360 px. Plus de cadre. Hauteur plafonnée à min(52vh, 360 px) pour les cadrages verticaux |
| Pays | Index compact sur deux colonnes : petit drapeau local, nom, nombre aligné à droite, filets fins. 44 px tactiles |
| Nom | Poppins Medium 500 (fichier local ajouté, 7,7 Ko, licence OFL) |
| En-tête | Espacements resserrés : 158 px au lieu de 174 px à 360 px. Couverture discrète conservée |
| Ordinateur | Colonne centrée de 720 px ; les blocs ne rétrécissent plus à leur contenu |

## 3 ter. PR 3 — ergonomie de l'accueil

| Sujet | Décision |
| --- | --- |
| Carte tronquée | Cause : l'app recadrait le `viewBox` sur les pays visités (marge de 12 %), et le conteneur montrait jusqu'ici, par accident, ce qui dépassait. Le cadre suit maintenant le viewBox exact, donc le recadrage devenait visible. L'accueil affiche désormais toujours le planisphère entier (x 0 à 1000, y 8 à 413, agrandi seulement si un arc de vol dépasse), avec les proportions naturelles et sans vide autour |
| Ordre d'usage | Profil → carte → Ajouter un voyage → Mon carnet → Mes pays → PDF ambassade. L'ordre du HTML est le même que l'ordre affiché (lecteurs d'écran et clavier compris) |
| Pays | Aperçu de 4 pays (les plus visités d'abord, un pays filtré reste toujours visible), lien « Voir les N pays » / « Afficher moins ». Noms complets sur deux lignes si besoin, jamais tronqués |
| Compteur | « N voyages » = nombre de voyages passés par ce pays, comme destination principale ou comme étape, compté une seule fois par voyage (`visitedCodes`) |
| Drapeaux | 24 × 18 px (4:3, le format natif des drapeaux), sans déformation |
| Mon carnet | Bouton secondaire bordé de vert, 64 px, juste sous « Ajouter un voyage » |
| Robustesse | Testé avec 0, 1, 8, 25 et 100 pays, un nom de profil très long, des noms de pays longs, un texte agrandi à 130 %, une connexion lente, à 320, 360, 390, 430 et 1280 px (`tests/travel-carnet-ux.cjs`) |

## 4. PR 4 — direction « atlas intime » (accueil + fondations)

### 4.1 Diagnostic de l'accueil avant cette PR

Captures « avant » : `test-artifacts/home-identity/avant-*.png` (`node tests/travel-home-identity.cjs ref:cd9858a`).

| Problème signalé | Cause trouvée dans le code |
| --- | --- |
| En-tête trop sombre, « institutionnel » | La couverture était affichée à 18 % d'opacité sous un voile `rgba(15,41,30,.86)` : un vert presque noir, la photo invisible |
| Couverture imperceptible | Même cause ; aucune zone de l'en-tête ne laissait voir l'image |
| Barre Carte / Filtrer / Trier « ancienne interface » | Fond blanc, ombre, trois capsules bordées de 44 px, totaux répétés ; le titre « Mes voyages » était placé **sous** la barre |
| Statistiques répétées | « 8 voyages · 8 pays » dans la barre, alors que l'en-tête les montre déjà |
| Pastilles trop imposantes, ombres, arrondis | Pastilles blanches 32 px avec ombre, cartes à 18 px d'arrondi et ombre `0 5px 18px` |
| Bouton flottant sur les contenus | Le compteur « 15 photos » était en haut à droite des cartes, exactement sous le bouton flottant (vérifié en défilement) |
| « Mon carnet » disparaît pendant le chargement | Le script remplaçait le titre par « Préparation… » |
| En-tête partiellement masqué / état de défilement | Pleine largeur obtenue avec `100vw` : quand le texte est agrandi, l'en-tête et la barre débordaient de l'écran (mesuré : 54 px) |
| Bouton flottant dans un carnet vide | Le bouton principal étant masqué, le script le croyait « passé » : deux boutons Ajouter à l'écran |

### 4.2 Références réellement consultées

Consultées en ligne pendant ce travail : web.dev « PWA app design » (couleur de thème unie, barre d'état visible en mode installé, zones sûres, `prefers-reduced-motion`), Polarsteps « travel tracker » (la carte et le récit d'étapes avec photos), Nielsen Norman Group « Aesthetic and minimalist design » (le minimalisme retire ce qui ne sert pas, il ne retire pas tout ; la clarté avant l'effet), Been (pays visités remplis d'une seule couleur, totaux en passeport), WCAG 2.2 (1.4.3 : 4,5:1 pour le texte ; 1.4.11 : 3:1 pour les éléments graphiques utiles).
Vues seulement sous forme de captures fournies : Polarsteps (profil avec couverture), Airbnb 2025, Apple Journal, Day One, Been.
**Non consultées** dans cette PR : Lodestars Anthology, FindPenguins, Apple HIG et la vidéo WWDC 2026, Material 3 Expressive, l'article Google Research CHI 2026, Mapbox, NN/g « Visual design principles », Android Accessibility.

Enseignements retenus : la photo de l'utilisateur doit être visible, pas devinée (Polarsteps) ; la carte se lit avec une seule couleur franche pour « visité » (Been) ; le décor se retire seulement s'il ne sert ni l'identité ni l'usage (NN/g) ; la barre système ne prend qu'une couleur unie (web.dev).

### 4.3 Exploration de l'en-tête : trois directions

Comparées sur trois couvertures (photo chaude, photo très claire, illustration) à 360 px :

| Direction | Résultat | Décision |
| --- | --- | --- |
| Vert forêt chaleureux (`#245443`, voile `#193F34`) | La photo se voit en haut, le texte reste net, le vert se marie aux tons chauds | **Retenue** |
| Vert eucalyptus (`#2F5E55`) | Plus froid ; sur les photos chaudes, l'ensemble devient grisâtre | Écartée |
| Composition claire, accent vert | Photo pleinement visible, mais l'en-tête se confond avec la page ; une photo de neige laisse une bande blanche vide ; 270 px de haut | Écartée |

Composition retenue : une **bande photo** de 96 px (128 px sur ordinateur) au-dessus de l'identité, voile léger en haut (la barre système reste lisible), voile dense sous le texte. La hauteur est réservée dès le premier affichage : la photo privée arrive plus tard sans décaler la page. Un carnet vide garde un en-tête compact. Une illustration de pays porte la mention « Illustration ».

### 4.4 Ce que change cette PR

| Élément | Avant | Après |
| --- | --- | --- |
| En-tête | 158 px, photo à 18 % sous un voile presque noir | 222 px à 360 px, photo visible en haut, voile seulement sous le texte. Nom en 24 px |
| Paramètres | Icône sans fond | Icône blanche sur pastille voilée, zone tactile 48 px, lisible sur toute photo |
| Carte | Arcs `#c46a2f` épais, signification non expliquée | Arcs fins `#AA7045`, plus légers au-delà de 12 puis de 40 destinations ; phrase « Les arcs relient votre pays de résidence à chaque destination. Ce ne sont pas vos trajets réels. » |
| Pays visités | `#7fb196` sur `#d7ded9` (1,9:1) | `#5B8B74` sur `#E4E2DA` (3,0:1) |
| Mon carnet | Titre remplacé par « Préparation… » | Titre conservé, état dans la ligne secondaire (`aria-busy`), hauteur inchangée |
| Mes voyages | Titre sous une barre blanche de 99 px (ombre, capsules, totaux) | Titre et commandes dans une barre ivoire de 57 px, filet fin ; commandes icône + libellé 48 × 48 ; totaux affichés seulement si un filtre réduit la liste (« Filtre actif · … ») avec un point cuivre sur Filtrer |
| Cartes de voyage | Arrondi 18 px, ombre `0 5px 18px`, pastilles 32 px avec ombre, compteur photos à droite | Arrondi 12 px, ombre `0 1px 3px`, étiquettes 28 px sans ombre empilées à gauche, mention « Illustration » si l'image n'est pas une photo de l'utilisateur, deux colonnes au-delà de 640 px |
| Bouton flottant | Rond, ombre forte ; présent aussi dans un carnet vide | Carré arrondi 16 px, ombre discrète ; absent d'un carnet vide ; ne recouvre plus aucune étiquette (vérifié à 5 positions de défilement) |
| Pleine largeur | `100vw` (débordait avec texte agrandi) | Marges négatives égales à la marge de page (16 px) |
| Barre système | `#174d3a` | `#193F34`, le vert du voile (meta et manifeste) |

Fichiers modifiés : `carnet.css` (design system et accueil), `index.html` (titre dans la barre, note des arcs, état de chargement de Mon carnet, filtre actif, bouton flottant en carnet vide, couleur de thème), `flight-connections.js` (attribut de densité, présentation seulement), `manifest.webmanifest` (couleur de thème), `sw.js` (cache `v77`). Tests : `tests/travel-home-identity.cjs` (nouveau), `tests/travel-home-perf.cjs` (nouveau), `tests/helpers/home-photo-fixture.cjs` (nouveau), `tests/travel-carnet-home.cjs` et `tests/travel-premium-cards-mobile.cjs` (bornes adaptées à la nouvelle direction, voir 4.6).

Non modifiés : SQL, RLS, Supabase, quotas photo, authentification, confidentialité, calcul des durées, lecture seule, contenu et génération du PDF ambassade, données hors ligne.

### 4.5 Vérifications

- **Contraste réel du texte sur image** (`tests/travel-home-identity.cjs`) : le texte est masqué, la zone derrière lui est photographiée, et sa couleur est comparée au pixel le plus clair (99e centile). Sur 152 zones (en-tête et cartes ; couvertures chaude, très claire, très sombre, chargée, illustration) : minimum **5,42:1** (texte du lieu sur une photo de neige). Exigé : 4,5:1.
- **Débordement horizontal** : 0 px à 320, 360, 375, 390, 430, 768, 1024 et 1440 px, et dans tous les cas particuliers (nom long, 120 voyages, carnet vide).
- **Zones tactiles** : Paramètres, Ajouter, Mon carnet, PDF, Voir les pays, Carte, Filtrer, Trier ≥ 48 × 48 px.
- **États** : Mon carnet garde son titre et sa hauteur pendant la préparation ; filtre actif visible par un texte et un point ; note des arcs présente ; aucune photo personnelle marquée « Illustration ».
- **Tests existants** : les 89 scripts sans service réel lancés avant et après. Les 5 échecs déjà présents avant cette PR échouent de la même façon après (`mobile-smoke`, `travel-family-booklet`, `travel-passport-mobile`, `travel-premium-detail-mobile`, `travel-profile-cover`) ; aucun nouvel échec.
- **Performances de laboratoire** (`tests/travel-home-perf.cjs`, 3 passages, compte fictif à photos, à 360 px ; ce ne sont pas des données terrain) :

| Conditions | LCP avant | LCP après | CLS avant | CLS après |
| --- | --- | --- | --- | --- |
| Sans ralentissement | 480 à 608 ms | 204 à 288 ms | 0 | 0 |
| Téléphone modeste simulé (processeur ÷4, 200 Ko/s) | 920 à 1 160 ms | 704 à 800 ms | 0,007 à 0,033 | 0,013 |

INP non mesuré : il faudrait des interactions réelles. Le CLS restant vient de la carte, qui s'agrandit quand les arcs sont tracés (comportement antérieur).

### 4.6 Tests adaptés, et pourquoi

- `travel-carnet-home.cjs` imposait un en-tête de 150 à 190 px : c'était la règle de la direction « carnet ». La couverture visible demande une bande photo ; la borne devient 190 à 240 px sur mobile quand le carnet contient des voyages, 120 à 190 px pour un carnet vide.
- `travel-premium-cards-mobile.cjs` imposait une barre blanche : elle doit rester **opaque** (les cartes ne transparaissent pas) ; elle est désormais ivoire. Sa sonde de chevauchement place maintenant la fausse étiquette avec `!important`, sinon la nouvelle règle la déplaçait et le test ne testait plus rien.

### 4.7 Limites connues

- Le texte agrandi est simulé par `zoom` CSS, pas par le réglage d'accessibilité d'Android : à vérifier sur un vrai téléphone.
- Non testés ici : PWA réellement installée, Safari iOS, navigation à trois boutons, orientation paysage, TalkBack. À faire sur appareil.
- Les photos de test sont des images de synthèse ; une vraie photo très contrastée reste à essayer.
- Le doré `#B58B50` n'atteint pas 3:1 sur l'ivoire : il est réservé au décor (anneau d'avatar), jamais à un état ni à du texte.

## 5. Design system (référence)

Toutes les valeurs sont des variables dans `carnet.css` (`:root`). Les règles n'écrivent plus de valeurs en dur.

**Couleurs** (contrastes mesurés sur l'ivoire `#F7F5EF` sauf mention) :

| Variable | Valeur | Rôle | Contraste |
| --- | --- | --- | --- |
| `--jy-color-primary` | `#245443` | Bouton principal, en-tête sans photo, liens | 7,95:1 ; blanc dessus 8,66:1 |
| `--jy-color-primary-deep` | `#193F34` | Voile de l'en-tête, barre système, focus | blanc dessus 11,65:1 |
| `--jy-color-bg` | `#F7F5EF` | Papier ivoire (inchangé : partagé par tous les écrans ; quasi identique au `#F5F3EC` proposé) | — |
| `--jy-color-text` | `#202C26` | Encre | 13,29:1 |
| `--jy-color-text-muted` | `#5D6B63` | Texte secondaire | 5,14:1 (5,6:1 sur blanc) |
| `--jy-color-line` | `#DDDCD3` | Filets | décor |
| `--jy-color-on-dark-muted` | `#DCE6E0` | Texte secondaire sur vert ou photo voilée | 6,78:1 sur `#245443` |
| `--jy-color-map-land` | `#CCD4CD` | Pays non visités | 1,39:1 sur ivoire (fond contextuel) |
| `--jy-color-map-visited` | `#497660` | Pays visités | 3,43:1 contre les terres |
| `--jy-color-map-route` | `#93603A` | Arcs et point de filtre actif | 3,49:1 sur les terres ; 4,85:1 sur l'ivoire (couleurs pleines, hors opacité des arcs) |
| `--jy-color-accent` | `#B58B50` | Anneau d'avatar (décor uniquement) | 2,84:1 : jamais pour un état |

**Typographie** : Poppins (fichiers locaux 400, 500, 600 ; titres et chiffres) et police du système (texte). Poppins est gardée : déjà embarquée hors ligne (8 Ko par graisse), licence OFL, aucune nouvelle requête. Échelle : 12 (minimum), 14 (secondaire), 16 (courant), 22 (titre de section), 24 px (nom du voyageur, titre d'un voyage). Graisses 400, 500 et 600 ; plus de 700 sur l'accueil. Chiffres tabulaires pour les statistiques.

**Espacements** : multiples de 4 — 4, 8, 12, 16, 24, 32, 40. Marge de page mobile 16 px ; 32 px entre deux sections.

**Rayons, selon le rôle** : 0 (drapeaux de liste, bandeaux pleine largeur), 4 px (étiquettes), 8 px (boutons, champs), 12 px (cartes photo, en-tête sur ordinateur), 16 px (bouton flottant), cercle (avatar et points d'état seulement).

**Ombres** : une seule pour les cartes (`0 1px 3px`) et une pour le bouton flottant. Aucune ombre sur les barres, étiquettes ou boutons.

**Composants** :
- Bouton principal : vert plein, 52 px, rayon 8 px, sans ombre ni dégradé.
- Bouton secondaire : contour vert 1 px, fond transparent (Mon carnet).
- Action en liste : ligne avec filet et chevron (PDF ambassade).
- Lien : vert `#245443`, 14 px, « › » final.
- Commande de barre : icône 20 px + libellé 12 px, zone 48 × 48, fond vert pâle quand elle est ouverte.
- Étiquettes sur photo : 28 px minimum, fond blanc à 94 %, rayon 4 px ; pays à gauche, nombre de photos à droite, statut en deuxième ligne. Le voile de lecture suit la hauteur des textes.
- Légende des arcs : bouton d'information natif (`details/summary`) avec zone tactile 48 px et explication accessible sans quitter la carte.
- Chargement : le nom de l'action reste ; l'état va dans la ligne secondaire avec `aria-busy`.
- Focus : contour 2 px vert profond ; sur une photo, anneau blanc doublé de vert profond.
- Mouvement : transitions de couleur de 150 ms seulement, désactivées si `prefers-reduced-motion`.

## 6. Prochaines PR proposées

1. Fiche voyage (récit, album, étapes) avec ces variables : rayons, ombres et étiquettes.
2. Formulaires et calendrier : champs 8 px, labels en 500.
3. Fenêtres modales, paramètres et état vide (`#welcomeCard`, qui garde son style « checklist »).
4. Écran de chargement hors ligne (`#offlineSkeleton`) aux nouvelles proportions de l'en-tête.
5. Nettoyage : remplacer progressivement les `!important` hérités par les variables du design system.
6. Essais sur appareil : PWA installée, TalkBack, texte agrandi d'Android, paysage.

## 7. Anciennes propositions (PR 1 à 3)


1. Cartes de voyages et barre Carte / Filtrer / Trier.
2. Fiche voyage (récit, album, étapes).
3. Formulaires et calendrier.
4. Modales, paramètres et état vide.
5. Nettoyage : remplacer progressivement les 206 `!important` par les variables du carnet.


### Finitions v78 — 24 novembre 2026

Carte plus contrastée, explication des arcs à la demande, espacements locaux réduits, étiquettes équilibrées et voile photographique lié au bloc de texte. Les ratios ci-dessus sont calculés sur les couleurs pleines ; les mesures sur captures et les tests navigateur de la v78 restent à exécuter. Les résultats historiques de la v77 ne constituent pas une validation de la v78. Le + flottant reste stable : les éléments peuvent défiler derrière lui et doivent rester accessibles en poursuivant le défilement.
