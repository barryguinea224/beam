# J'y étais — direction artistique « carnet »

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
| Ordinateur | Colonne gauche étroite : la carte est moins large que l'en-tête et la première lettre de « Ma carte » est rognée (défaut existant, non lié à cette PR) | Moyenne |

## 2. Direction artistique

**Principe :** un carnet de voyage personnel, pas un tableau de bord. Moins d'éléments, mieux placés. Le papier (ivoire) est le fond, l'encre (vert profond) porte l'identité, le doré n'apparaît qu'en touche.

Les fondations sont des variables CSS dans `carnet.css`, à réutiliser écran par écran.

| Famille | Valeurs |
| --- | --- |
| Couleurs | Vert profond `#1B4332` · vert texte `#174d3a` · ivoire `#f7f5ef` · papier `#fbfaf6` · encre `#17231f` · gris secondaire `#59675f` · filet `#dcdad1` · doré `#C9962E` (jamais en texte sur ivoire) |
| Arrondis | 0, 4 px, 8 px. Le cercle est réservé à l'avatar et aux points d'état |
| Typographie | Poppins (titres et chiffres) et police système (texte). 5 tailles : 12, 14, 16, 20, 28 px. Graisses 400 et 600 uniquement |
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

## 4. Prochaines PR proposées

1. Cartes de voyages et barre Carte / Filtrer / Trier.
2. Fiche voyage (récit, album, étapes).
3. Formulaires et calendrier.
4. Modales, paramètres et état vide.
5. Nettoyage : remplacer progressivement les 206 `!important` par les variables du carnet.
