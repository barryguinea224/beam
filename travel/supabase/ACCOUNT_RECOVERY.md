# BTH — Récupération d'un compte quand l'e-mail est perdu

> **Réservé au propriétaire BEAM, en agence.** Jamais sur demande téléphonique,
> WhatsApp, vidéo ou par un tiers. Le SQL Editor doit être utilisé sous le rôle
> **postgres**, sur le **bon projet Supabase**. Ce n'est **pas** une fonctionnalité
> du site BTH et elle n'est jamais exposée à un client.

## Avant d'ouvrir Supabase : vérification obligatoire EN PERSONNE

1. Demander la **pièce d'identité originale** (CNI ou passeport), en présence du client.
2. Vérifier que son nom correspond au nom affiché du compte BTH.
3. Lui demander **deux voyages distincts** présents dans son carnet (destinations
   et périodes approximatives), sans les lui suggérer. Comparer au carnet existant.
4. Demander au client de saisir sa **nouvelle adresse e-mail** et vérifier avec lui
   sur son téléphone qu'il peut **réellement recevoir un message** à cette adresse.
5. Si un élément ne concorde pas : **arrêter**, ne pas appeler la fonction.
   Ne pas prendre de photo de sa pièce d'identité, ne pas recopier son numéro dans
   le SQL ou le motif et ne pas transmettre l'écran SQL à un tiers.
6. Ne jamais communiquer de mot de passe, de code OTP, ni demander les identifiants
   de la boîte e-mail. Le client saisit seul son code à six chiffres.

## Mise en service (ordre à respecter)

1. **Staging** : faire une sauvegarde puis appliquer, une seule fois, le fichier
   \`travel/supabase/migrations/20261107093000_account_email_recovery.sql\`
   dans le SQL Editor du projet **staging** sous postgres. La migration est
   idempotente et son contrôle préliminaire refuse un schéma Auth incompatible.
   Ne **pas** réexécuter \`schema.sql\` sur une base existante.
2. **Test sur un compte de staging fictif** : créer un utilisateur avec un e-mail
   \`@example.com\` et une identité \`email\`, puis changer l'adresse. Vérifier :
   a) une nouvelle demande de code est adressée à la **nouvelle** adresse;
   b) l'ancienne adresse ne permet plus de recevoir un OTP de connexion;
   c) les voyages et photos restent liés au même \`auth.users.id\`;
   d) anciennes sessions et jetons de renouvellement sont détruits;
   e) une seule trace d'audit est enregistrée. Ne pas utiliser de compte réel.
   Les tests GitHub réalisent en plus les assertions SQL sur une base locale
   Supabase isolée. Ils ne touchent aucun projet hébergé.
3. **Production** : après validation du fonctionnement et des accès refusés sur
   staging, faire une sauvegarde et appliquer **uniquement la même migration**
   depuis le SQL Editor du projet **production**, sous postgres. Aucune
   modification dans \`/travel/\`, aucun cache PWA à invalider, aucune inscription
   libre à activer.
4. Réserver cette opération aux cas exceptionnels et consigner l'identité
   vérifiée, la date et un motif succinct, sans numéro de CNI ni photo.

## Commande à coller (EXEMPLE FICTIF)

Sélectionner **SQL Editor → projet concerné → rôle postgres**. Vérifier
\`select current_user;\` qui doit retourner \`postgres\`.

Coller la commande suivante en remplaçant les deux e-mails par les valeurs
contrôlées **en personne** ; le motif doit compter de 10 à 300 caractères :

\`\`\`sql
select private.beam_change_client_email(
  'ancien@example.com',
  'nouveau@example.com',
  'Vérifié en agence avec CNI le 07/11/2026 et deux voyages confirmés.'
);
\`\`\`

Résultat attendu (le nom vient du profil BTH, **sans recréer l'utilisateur**) :

> E-mail changé pour Client fictif : ancien@example.com → nouveau@example.com.
> Toutes les sessions ont été fermées.

L'adresse est normalisée (espaces supprimés, minuscules). En cas d'erreur, **rien
n'est modifié** : l'opération SQL est transactionnelle; aucun changement partiel,
pas même une révocation de session. Vérifier l'erreur (inconnu, adresse déjà prise,
mauvais format, motif trop court, compte en suppression, identité e-mail incohérente
ou schéma Auth incompatible). Corriger uniquement après une nouvelle vérification,
ne pas faire de modifications manuelles dans \`auth.users\` ou \`auth.identities\`.

## Consulter l'historique — réservé au propriétaire

\`\`\`sql
select * from private.beam_email_change_history('ancien@example.com');
-- ou :
select * from private.beam_email_change_history('nouveau@example.com');
\`\`\`

L'historique retrouve tous les changements du **même UUID de compte**, même par
un e-mail historique. Si une adresse a été réutilisée par deux comptes, une
erreur d'ambiguïté demande une vérification manuelle : ne pas deviner le compte.

Après récupération, le client va sur la connexion BTH, demande un **nouveau
code à six chiffres** à sa **nouvelle** adresse et retrouve voyages, photos
et carnets. Les comptes restent sur invitation (aucune inscription libre).

## Ce qu'il ne faut JAMAIS faire

- Ne **jamais supprimer puis recréer** le compte : les données seraient perdues
  ou dissociées du propriétaire originel.
- Ne jamais changer l'e-mail pour une demande par WhatsApp, appel, photo d'une
  pièce envoyée à distance ou parole d'une agence sans le client.
- Ne jamais partager de capture du SQL Editor, clé ou jeton d'administration.
- Ne jamais donner \`EXECUTE\` à \`anon\`, \`authenticated\` ou \`service_role\`,
  ni déplacer les fonctions dans \`public\` ou un schéma API exposé.
- Ne pas révoquer globalement \`USAGE\` sur le schéma \`private\` : BTH y
  conserve des fonctions nécessaires aux politiques RLS existantes.
- Ne jamais conserver les codes OTP du client.

## Quelles tables Auth sont modifiées ? Compatibilité et limites

Avec le schéma Supabase Auth vérifié pour cette migration :
- **\`auth.users\`** : \`email\`, \`email_confirmed_at\`, \`updated_at\`, mais
  **jamais** \`id\` ni les autres données du compte.
- **\`auth.identities\`** : uniquement la ligne \`provider='email'\` du même
  \`user_id\` ; \`identity_data.email\` est mis à jour. La colonne
  **\`email\` y est générée** à partir de \`identity_data\` : ne jamais
  essayer de la modifier directement. \`provider_id\` vaut **normalement
  l'UUID de l'utilisateur**, donc il reste intact. Si une ancienne identité
  utilisait exceptionnellement l'ancien e-mail comme \`provider_id\`, il
  est remplacé par le nouveau. Les identités OAuth/téléphone ne bougent pas.
- **\`auth.refresh_tokens\`** : toutes les lignes du même \`user_id\` sont
  supprimées pour empêcher l'ancien renouvellement.
- **\`auth.sessions\`** : toutes les sessions du même \`user_id\` sont
  supprimées, y compris les sessions modernes à jetons de renouvellement v2.
- **\`private.account_email_changes\`** : une ligne d'audit est ajoutée,
  avec le même UUID, les deux e-mails, le motif, la date et \`changed_by=postgres\`.
  La trace contient des données personnelles : conserver l'accès strict et
  définir une durée de conservation avec le juriste.

**Limite incontournable :** un JWT d'accès déjà émis est cryptographiquement
valide jusqu'à sa date \`exp\` et peut être accepté entre-temps par des routes
qui n'interrogent pas \`auth.sessions\`. « Toutes les sessions ont été fermées »
signifie **sessions serveur et renouvellements révoqués** ; cela **ne garantit
pas la déconnexion instantanée** sur tous les appareils. Pour un niveau de
sécurité plus strict, prévoir ultérieurement une vérification côté serveur
du \`session_id\` avant les opérations sensibles. Aucune modification de
l'application cliente n'est demandée dans cette PR.

Le fonctionnement interne des tables \`auth.*\` n'est pas une interface SQL
publique stable. **Vérifier d'abord sur staging après toute montée de version
Supabase**, puis garder la migration de garde contre les schémas incompatibles.

Références officielles :
- https://supabase.com/docs/guides/auth/identities
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/signout
- https://supabase.com/docs/guides/database/functions
