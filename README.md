# BEAM — Travel · Technology · Training

Site vitrine de BEAM : Travel · Technology · Training, basé à Conakry, Guinée.

**Domaine réservé :** beamguinee.com. Le domaine n'est pas encore connecté à ce dépôt.

## Pages
- `index.html` : accueil, accompagnement voyage et visa, formations, présentation GDS LAB et formulaire.
- `acteurs.html` : annuaire interactif des acteurs du secteur (IATA, Amadeus et autres ressources).
- `merci.html` : confirmation de réception du formulaire sur Netlify.
- `simulation-3d.html` : BEAM Airport Academy 3D, jeu pédagogique fictif WebGL pour ordinateur et téléphone (Three.js via CDN).
- `assets/` : styles, scripts et favicon.

## Simulateur 3D
Le jeu contient quatre missions : accueil, réservation PNR, formalités, embarquement. Les décisions sont fictives et ne correspondent pas à des contrôles réels de visa ou de réservation. Les assets 3D sont générés dans le navigateur, sans téléchargement d'images. Le navigateur doit supporter WebGL et pouvoir charger la bibliothèque Three.js depuis jsDelivr.

## Déploiement sur Netlify
1. Connecter ce dépôt GitHub depuis Netlify et choisir la branche `main`.
2. Définir le dossier de publication sur la racine (`.`) ; aucune commande de build n'est nécessaire.
3. Activer la détection des formulaires Netlify et tester le formulaire `contact-beam` sur le site déployé.
4. Ajouter `beamguinee.com` comme domaine personnalisé dans Netlify ; suivre les paramètres DNS indiqués sur Namecheap.
5. Vérifier le HTTPS et la redirection vers la variante canonique du domaine.

## À finaliser avant publication officielle
- Ajouter les coordonnées professionnelles et les mentions légales / politique de confidentialité.
- Vérifier les services, les dates et tarifs des formations ainsi que les liens externes.
- Tester le formulaire, les écrans mobiles et les principales interactions.
- Ne pas présenter l'annuaire comme des partenariats signés : BEAM est indépendant de ces fournisseurs.
- GDS LAB est un simulateur pédagogique indépendant, sans connexion à un GDS réel.

L'hébergement et le domaine sont configurés séparément ; ce dépôt ne publie pas automatiquement le site tant qu'il n'est pas relié à Netlify.

## Airport Academy 3D — V2 (branche de prévisualisation)
- `simulation-3d-v2.html` : nouvelle version distincte, sans remplacement de la V1.
- Décor original généré en Three.js : hall vitré, tableau des départs, panneaux directionnels, bagages et voyageurs animés.
- Quatre mises en situation pédagogiques : contrôle des bagages, consultation du PNR fictif `CKY452`, formalités de voyage et lecture du tableau des départs.
- Contrôles tactiles conservés ; aucune donnée réelle ou réservation externe utilisée.
- Tests statiques de liens et syntaxe JS dans GitHub Actions. **À confirmer sur téléphone avant fusion** : déplacements, lisibilité des panneaux, interactions des quatre missions, charge graphique, navigateur Android.
- Les visuels de référence de l'utilisateur ne sont pas inclus : décors et textures sont créés dans le code.
