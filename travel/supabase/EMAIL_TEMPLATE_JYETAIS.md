# E-mail de connexion — J'y étais

Modèle à coller manuellement dans **Supabase Dashboard → Authentication → Email Templates → Magic Link / OTP** (selon la configuration en place).

Appliquer et tester **d'abord sur staging**, puis sur production. Aucun changement SQL ni secret n'est nécessaire. Ne pas remplacer le code par un lien de connexion.

## Sujet

Votre code de connexion à J'y étais

## Texte (version texte)

Bonjour,

Voici votre code de connexion à J'y étais :

{{ .Token }}

Saisissez ce code dans l'application à l'adresse https://beamguinee.com/travel/.

Si vous n'avez pas demandé ce code, ignorez cet e-mail. Ne communiquez jamais ce code à une autre personne, même à une agence.

J'y étais by BEAM

## Contrôles manuels

- Vérifier sur staging la réception d'un **code à 6 chiffres** et sa validation sur /travel/.
- Vérifier que le modèle utilise bien `{{ .Token }}` et non un lien magique.
- Vérifier l'affichage sur Android et le nom de l'expéditeur si celui-ci est configuré séparément.
- Après validation, reproduire le sujet et le texte sur production ; **aucune clé et aucune donnée de client** dans ce fichier.
