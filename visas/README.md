# BEAM — Guide public des visas depuis Conakry

Ce guide produit des pages HTML statiques sans compte, JavaScript navigateur, suivi publicitaire ou base de données. Les informations éditoriales sont fournies et vérifiées par BEAM, pas inventées par le générateur.

## Fichiers sources et publication

- `visas/data/<pays>.json` : fiches BEAM, à conserver **à l'identique** lors de leur ajout ou remplacement ; ne jamais créer de conditions, documents, frais ou adresses pour remplir une fiche.
- `tests/fixtures/visas/exemple.json` : exemple **NON VÉRIFIÉ**, réservé aux tests. Ne jamais le placer dans `visas/data/`.
- `node scripts/build-visas.cjs --check` : valide strictement toutes les fiches (structure, champs, dates, URL HTTPS et marqueur d'exemple), sans générer de HTML.
- `node scripts/build-visas.cjs --preview` : génère un aperçu statique ; les fiches `exemple` portent un avertissement.
- `node scripts/build-visas.cjs --production` : publie les seules fiches valides en `statut: "publie"`, exclut les exemples et les fiches invalides sans interrompre le déploiement. Supprime les anciennes pages générées devenues exclues.
- `CONTEXT=production` impose ce mode de génération tolérant sur Netlify, indépendamment de l'argument en ligne de commande.

Le nombre de fiches **publiées** ne doit jamais être simulé. L'objectif du lot Maroc/Canada est **six fiches réelles** après réception du JSON Maroc vérifié et de la mise à jour Canada fournie par BEAM. Tant que les originaux n'ont pas été fournis, la CI ne peut pas attester ce résultat.

## Modèle des lieux de dépôt

Chaque `types_visa[]` contient `lieu_depot` avec exactement les champs :

- `categorie` : `"ambassade"`, `"centre_externe"` ou `"en_ligne"` pour une fiche publiée ; `"a_confirmer"` est réservé aux exemples.
- `nom` et `adresse` : textes non vides transmis par BEAM. **Pour une procédure en ligne, ne pas inventer d'adresse physique** : reprendre le texte BEAM à l'identique.
- `rendez_vous_url` : URL HTTPS obligatoire. Pour `ambassade` et `centre_externe`, elle désigne le lien de rendez-vous de la fiche ; pour `en_ligne`, elle désigne **le portail officiel de démarche en ligne**, pas nécessairement une prise de rendez-vous. `null` n'est autorisé que pour `a_confirmer` dans un exemple.

Le rendu affiche la catégorie `en_ligne` sous le libellé **« Démarche en ligne »**, avec le lien **« Ouvrir le portail officiel »**. Les catégories physiques conservent **« Ouvrir le lien officiel de rendez-vous »**. Les liens sont affichés, mais jamais chargés automatiquement au visiteur.

La validation contrôle la syntaxe HTTPS, **pas** la légitimité ou la compétence de l'autorité : BEAM doit vérifier manuellement chaque source et portail.

## Structure complète d'une fiche

Une fiche comprend `destination`, `code_pays` (ISO 3166-1 alpha-2, deux lettres majuscules validées dans le référentiel BTH), `drapeau`, `statut`, `verifie_le` et `types_visa[]`. Chaque type comprend `type`, `autorite_competente` (`nom`, `ville`, `pays`), `lieu_depot`, `conditions_demandeur` (`public_cible`, `autres_cas`), `documents[]` (`libelle`, `statut`, `note`, `groupe` facultatif), `frais` et `delai_indicatif` (`texte`, `verifie_le`), ainsi que `sources[]` (`libelle`, `url` HTTPS).

Les documents ont le statut `obligatoire` ou `selon_le_cas`. La règle actuelle exige `conditions_demandeur.autres_cas = "Consultez l’ambassade."`. Les dates `verifie_le` doivent être valides et non futures. Le marqueur exact `EXEMPLE — NON VÉRIFIÉ` est interdit dans une fiche publiée, mais le mot français « exemple » reste autorisé dans un texte normal.

## Présentation simplifiée des fiches (sans toucher au contenu)

La page de chaque destination place le titre `Visa [destination]` en tête, suivi d'un grand bouton **« On s'occupe de tout pour vous — WhatsApp »** (numéro BEAM existant, message prérempli avec la destination). Une courte mention « Informations indicatives · BEAM n'est pas affilié aux ambassades » reste visible en haut. Les avertissements importants de fiche d'exemple et de données âgées de plus de 90 jours restent visibles.

La section **« Documents à fournir »** est une liste visuelle avec ✓ non interactifs. Les documents conservent exactement le texte de leur champ `libelle`, sans `note` ni `statut` affiché dans la liste principale. Le champ `groupe` est **facultatif** sur chaque objet `documents[]`, strictement limité aux valeurs suivantes (ordre d'affichage fixe) :

| Valeur `groupe` | Titre public |
| --- | --- |
| `base` | Documents de base |
| `salaries` | Pour les salariés |
| `commercants` | Pour les commerçants et professions libérales |
| `but` | Selon le but du voyage |
| `autres` | Documents complémentaires |

Si `groupe` est absent, le document va dans **`base`** ; aucun autre champ ne change et aucun statut n'est déduit du groupe. Les groupes vides ne sont pas affichés. BEAM peut réécrire ses propres libellés, mais le gabarit **ne supprime, n'invente et ne reformule aucun document**. `statut` et `note` restent des champs obligatoires.

Chaque type de visa affiche ensuite **« En bref »** sur exactement trois rubriques : lieu de dépôt (nom et lien officiel de rendez-vous ou de portail en ligne), frais et délai indicatif. Les textes de `lieu_depot.nom`, `frais.texte` et `delai_indicatif.texte` sont reproduits intégralement, même s'ils sont encore longs ; seul BEAM raccourcira les données. Le lien physique conserve « Ouvrir le lien officiel de rendez-vous » et la catégorie `en_ligne` conserve « Ouvrir le portail officiel ».

Un lien statique **« Partager cette liste sur WhatsApp »** utilise `https://wa.me/?text=` avec le titre et l'URL publique `https://beamguinee.com/visas/<slug>/` ; ni JavaScript, ni donnée personnelle, ni adresse de client.

En bas, un seul bloc HTML `<details>` **fermé par défaut**, intitulé « Plus de détails », contient l'autorité compétente, l'adresse et les conditions, la liste des notes et statuts document par document, les sources, les dates et l'avertissement complet habituel. Le guide n'affirme aucune garantie de visa ou affiliation consulaire. La page d'accueil garde son avertissement habituel.

**Fraîcheur :** dès qu'une date de vérification de fiche, de frais ou de délai a plus de 90 jours au moment du build, le site affiche « Informations à revérifier ». Sur un site statique, ce bandeau ne change pas tout seul sans nouvelle construction.

## Édition sur GitHub et tests

Depuis un téléphone, ouvrez le dépôt `barryguinea224/beam`, choisissez une branche de travail puis `visas/data/`. Ouvrez une fiche avec **Edit file** ou utilisez **Add file → Create new file**. Ajoutez uniquement le texte JSON vérifié par BEAM ; évitez tout secret ou donnée de client. Ouvrez ensuite une PR vers `feature/beam-travel-history-v1`.

Tests à vérifier avant fusion :

```sh
node scripts/build-visas.cjs --check
node tests/visas-schema.cjs
node scripts/build-visas.cjs --production
# Test Chromium, après installation de Playwright :
node tests/visas-mobile.cjs
```

Le workflow `.github/workflows/visas-static.yml` exécute le contrôle strict et les tests Chromium à 320, 360 et 390 px. Pour ce lot, il doit confirmer **six fiches publiées** et leurs pages accessibles après fourniture du Maroc. Une démo synthétique ne remplace pas cette vérification.

## Confidentialité, sécurité et périmètre

Avec `publish = "."` sur Netlify, les règles 404 **forcées** de `netlify.toml` bloquent `/visas/data/*` et `/visas/README.md`. Cela ne constitue pas un stockage secret : aucun contenu confidentiel ne doit se trouver dans le dépôt. La cible `/visas/404.html` est créée par le générateur.

Le guide ne change ni `/travel/`, ni Supabase, ni les Edge Functions. Le service worker de BTH reste limité à `/travel/` ; le générateur des visas ne modifie pas ses fichiers. Aucun sitemap visas n'est généré dans cette phase.

Avertissement public :

> Informations indicatives, vérifiées à la date indiquée. Seule l'ambassade décide. BEAM n'est pas affilié aux ambassades ni aux centres de dépôt.

Aucune garantie d'obtention de visa.

## Liaison publique avec BEAM Travel History

Chaque vraie fiche `visas/data/*.json` doit posséder `code_pays` : France `FR`, Canada `CA`, Royaume-Uni `GB`, Turquie `TR`, Chine `CN`, Maroc `MA`. La validation `--check` refuse un code manquant, non majuscule, inconnu du catalogue ISO 3166-1 alpha-2 de BTH ou utilisé deux fois pour des fiches publiées.

À chaque génération (aperçu ou production), `/visas/fiches.json` est **réécrit entièrement** à partir des fiches publiées et valides. Il contient exclusivement un tableau d’objets `{code_pays,slug,destination}`, jamais une fiche d'exemple ou une autre propriété (documents, frais, données de voyage, identifiants, etc.). `--check` ne génère aucun fichier. `netlify.toml` indique `Cache-Control: no-store` pour ce fichier public.

Le tableau de bord BTH expose un lien normal « Guide des visas » vers `/visas/`, dans le même onglet. Dans une fiche voyage, le composant `travel/visa-guide.js` lit uniquement `/visas/fiches.json` depuis la même origine, avec `cache: "no-store"`, cookies omis, aucun référent, aucun paramètre et un délai maximal de 1,5 seconde. Il compare localement le code ISO du voyage ; si le pays est dans la liste, il affiche « Préparer un nouveau visa ? Voir la fiche [destination] ». Si l'index manque, est invalide, ou en cas de délai dépassé, **aucun lien ni erreur** ne s'affiche. Aucune donnée du voyageur n'est transmise.

Le service worker BTH v19 conserve son périmètre `/travel/` et n'intercepte ni ne met en cache les pages `/visas/` ni `/visas/fiches.json`. Les tests contrôlent le schéma du manifeste, la non-publication des exemples, le lien France, l’absence de lien pour un pays non répertorié, les erreurs réseau silencieuses et l'affichage BTH entre 320 et 390 px.
