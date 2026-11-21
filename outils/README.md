LES OUTILS DU CONSEILLER VOYAGE — fichiers du répertoire

index.html            la page
styles.css            la mise en forme
app.js                recherche, filtres, copie d'adresse
data/ressources.json  LES DONNÉES (source de référence, 46 ressources)
data/ressources.js    copie des données pour ouvrir la page sans serveur

Mettre en ligne : déposer le dossier tel quel, dans le dossier outils/
du site — la page est à https://beamguinee.com/outils/

Modifier une ressource : changer data/ressources.json (et refaire la copie
data/ressources.js). En ligne, la page lit en priorité ressources.json.

Changer le lien « Retour à la formation » : champ site.retourUrl du JSON.
Ajouter des mots de recherche (synonymes) : champ facultatif "motsCles".
Statuts possibles : "confirme", "probable", "introuvable" (sans lien).
