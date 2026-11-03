# BEAM — Guide des visas depuis Conakry (phase 1)

Ce répertoire produit des **pages HTML publiques indépendantes**, sans compte, base de données, script navigateur, bibliothèque distante, balise de suivi ou emblème d’ambassade.

## Lire le guide

- Accueil : `/visas/`
- Fiche d'une destination : `/visas/france/` (exemple uniquement)
- Les fichiers `visas/data/<pays>.json` sont la source de vérité.
- Le script `scripts/build-visas.cjs` produit `visas/index.html` et `visas/<pays>/index.html` à chaque build.
- `node scripts/build-visas.cjs --preview` construit localement une version **non indexable** avec le bandeau **EXEMPLE — NON VÉRIFIÉ**.
- `node scripts/build-visas.cjs --check` valide **strictement toutes les fiches** pour la CI : tout champ invalide, date future, JSON malformé ou URL non HTTPS fait échouer la PR. L'exemple clairement marqué `statut: "exemple"` reste autorisé pour les prévisualisations et pour les tests de structure.
- `node scripts/build-visas.cjs --production` **réussit même si des fiches sont invalides ou non vérifiées** : elles sont exclues de la génération et de l'accueil et les noms des fichiers exclus, avec leurs raisons, figurent dans le journal.
- En production Netlify (`CONTEXT=production`), le générateur passe toujours en mode tolérant même si quelqu'un indique `--preview` ou `--check`. Le build de BTH reste indépendant de la qualité des données du guide.
- Tant qu'aucune fiche vérifiée n'est publiée, `/visas/` affiche **« Guide en préparation »** avec l'avertissement légal et le bouton WhatsApp BEAM. Aucun `/visas/france/` issu de l'exemple n'est généré.

**ATTENTION : l'exemple France n'est pas une fiche de conseils visa.** Il n'indique aucune condition, exigence, adresse, frais ou délai. Il ne peut pas être publié comme information vérifiée. Le lien France-Visas pointe vers le portail officiel ; il ne valide pas le reste de l'exemple.

## Modifier une fiche depuis GitHub sur un téléphone

1. Ouvrez le dépôt `barryguinea224/beam` sur github.com dans le navigateur du téléphone et sélectionnez la branche de travail du guide (jamais la production directement).
2. Ouvrez `visas/data/france.json` (ou une autre destination), appuyez sur le menu `...` puis **Edit file** (icône crayon selon la version mobile). Si le bouton manque, demander la version « Site pour ordinateur » du navigateur.
3. Saisissez uniquement les éléments **vérifiés auprès des sources officielles**. Gardez les noms de champs et les guillemets JSON. Ne rajoutez jamais de secret, de numéro de dossier, de données de client ou de logo d'ambassade.
4. Vérifiez les données **pour chaque type de visa** : autorité compétente (nom, ville, pays), lieu et catégorie de dépôt (ambassade ou centre externe), adresse, **lien officiel DIRECT de prise de rendez-vous**, public concerné, documents obligatoires ou selon le cas, frais et délai indicatif. Les autres situations doivent conserver « Consultez l’ambassade. ».
5. Pour chaque source, ajoutez `libelle` et une URL **HTTPS officielle** ; vérifiez manuellement qu'elle appartient réellement à l'autorité compétente ou à son centre partenaire. Une URL HTTPS n'est pas, à elle seule, une preuve officielle.
6. Actualisez `verifie_le` sur la fiche, ainsi que **les dates propres aux frais et aux délais** uniquement après leur vérification réelle. Dates au format `AAAA-MM-JJ`, jamais futures.
7. Retirez **toutes les mentions EXEMPLE — NON VÉRIFIÉ**, remplacez `statut: "exemple"` par `statut: "publie"`. Remplacez `a_confirmer` par `ambassade` ou `centre_externe` et fournissez une véritable URL de rendez-vous. Le validateur refuse les champs vides ou manquants dans la CI. En production, toute fiche d'exemple ou invalide est exclue sans interrompre le déploiement.
8. Utilisez **Commit changes** vers votre branche, puis ouvrez une **Pull request** vers `feature/beam-travel-history-v1`. Attendez les tests, relisez l'aperçu Netlify sur téléphone, puis demandez la revue. N'ajoutez pas de données non vérifiées pour faire passer les tests.

### Ajouter une destination

Dans GitHub, ouvrez `visas/data/`, **Add file → Create new file**, nommez le fichier avec un identifiant sûr en minuscules : `maroc.json`, `croatie.json`, etc. Copiez **la structure** du JSON France, remplacez chaque champ par des faits confirmés, ne conservez pas les mentions d'exemple, puis validez par PR. Le script génère automatiquement `/visas/maroc/`, etc. N'ajoutez pas manuellement une page HTML.

## Structure et validation automatique

Le JSON contient `destination`, `drapeau`, `statut`, `verifie_le`, `types_visa[]`. Chaque type contient :

- `type` ; `autorite_competente` (`nom`, `ville`, `pays`) ;
- `lieu_depot` (`categorie`, `nom`, `adresse`, `rendez_vous_url`) ;
- `conditions_demandeur` (`public_cible`, `autres_cas`) ;
- `documents[]` (`libelle`, `statut` parmi `obligatoire` / `selon_le_cas`, `note`) ;
- `frais` et `delai_indicatif` (`texte`, `verifie_le`) ;
- `sources[]` (au moins un `libelle` et une `url` en HTTPS).

En **CI stricte**, le modèle refuse les champs inconnus et manquants, les dates impossibles/futures, les mauvaises URLs et les mentions résiduelles `EXEMPLE` dans une fiche marquée `publie`. Les exemples déclarés sont autorisés pour l'aperçu, mais **jamais publiés en production**. En production, même un JSON invalide est écarté avec un avertissement dans le journal, sans bloquer les autres pages du site. Le modèle ne vérifie **pas** automatiquement les textes des documents, les montants, les délais ni le caractère officiel d'un domaine HTTPS : BEAM en demeure responsable.

### Fraîcheur des informations

À **chaque construction**, une date `verifie_le` supérieure à 90 jours, qu'elle concerne la fiche, les frais ou le délai, déclenche automatiquement le bandeau **Informations à revérifier** sur la fiche, et un rappel sur l'accueil. Les dates de frais et délais sont affichées séparément.

**Limitation du HTML statique :** le bandeau est calculé **à chaque build**. S'il n'y a pas de nouveau déploiement le 91e jour, il ne s'actualise pas de lui-même. **Aucun redéploiement quotidien n'est prévu.** Les dates affichées permettent au visiteur d'évaluer leur fraîcheur.

## Déploiement et protection des données

Le `netlify.toml` existant conserve le build de `travel/config.js`, puis exécute `node scripts/build-visas.cjs`. Les aperçus construisent la fiche d'exemple ; **en production celle-ci est exclue, le guide affiche « Guide en préparation » et le build réussit**. Une fiche malformée ne peut pas empêcher un déploiement de `beamguinee.com` ou de BTH ; **la CI de la PR la refuse**, afin de préserver la qualité éditoriale. Le générateur supprime les anciennes pages HTML de destinations devenues exclues ou supprimées lorsqu'elles lui appartiennent. Aucun sitemap visas n'est généré actuellement ; une éventuelle génération future doit reprendre uniquement les fiches incluses. Le dossier `/travel/`, ses données, le schéma Supabase et les Edge Functions ne sont pas modifiés.

Le service worker BTH est limité à `/travel/` et ne met **aucune** page `/visas/` en cache. Les liens externes ne chargent aucune ressource au moment de l'affichage : ce sont seulement des liens cliquables. Le bouton BEAM ouvre WhatsApp avec un texte prérempli, sans transmettre d'information avant le clic.

Avertissement affiché sur toutes les pages :
> Informations indicatives, vérifiées à la date indiquée. Seule l'ambassade décide. BEAM n'est pas affilié aux ambassades ni aux centres de dépôt.

Aucune promesse d'obtention de visa ni de pourcentage de réussite.
