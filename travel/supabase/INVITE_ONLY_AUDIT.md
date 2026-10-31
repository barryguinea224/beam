# Audit A — BEAM Travel History : comptes créés uniquement par BEAM

**Décision produit (31 octobre 2026)** : achat unique hors application, aucune expiration
commerciale automatique, création de compte réservée au propriétaire de BEAM depuis
Supabase Authentication → Users → Add user. Aucun espace administrateur dans le carnet.

**État : BLOQUANT / NO-GO production** jusqu'aux essais sur le nouvel écran, au
test réel d'un compte client avec code à six chiffres et à la configuration du futur
projet de production. La configuration locale et le code navigateur ne suffisent
PAS à désactiver les inscriptions dans Supabase Cloud.

### Vérifications réalisées sur staging (31 octobre 2026 — informations communiquées par le propriétaire)

- **Allow new users to sign up : OFF**.
- **Allow anonymous sign-ins : OFF**.
- **Allow manual linking : OFF**.
- **Fournisseur Email : ON**.
- **Modèle du staging NON configuré pour le code OTP** (capture du propriétaire,
  31 octobre 2026) : modèle par défaut « Your sign-in link », sans `{{ .Token }}`.
  **À remplacer après la connexion SMTP Resend**, puis tester l'envoi et la saisie
  d'un code réel à six chiffres.
- Adresse inconnue testée depuis l'ancienne prévisualisation : refusée, aucun
  utilisateur créé. L'ancienne UI affichait néanmoins l'erreur brute en anglais
  « Signups not allowed for this instance », donc divulguait un indice de statut.
  La PR #26 corrige cet affichage ; **le test sur le nouveau déploiement est encore
  nécessaire**, ainsi que le test de réception pour un compte client existant.
- Le test direct `POST /auth/v1/signup` de la sonde hostile protégée demeure
  à exécuter/contrôler si aucune preuve de son résultat n'est enregistrée.

## Contrôles obligatoires dans chaque projet Supabase (staging, puis production)

1. Dans **Authentication → General Configuration**, désactiver
   **Allow new users to sign up** (les intitulés peuvent évoluer).
   Ne pas désactiver le fournisseur Email : les comptes existants doivent encore
   recevoir des codes de connexion. Vérifier séparément que les inscriptions anonymes
   sont désactivées, que **Allow manual linking** est désactivé et qu'aucun
   fournisseur social autorisant une création publique n'est activé.
2. Dans **Authentication → Email Templates → Magic Link**, personnaliser le modèle
   pour qu'il contienne le code de six chiffres `{{ .Token }}`. Par défaut,
   `signInWithOtp` envoie un lien magique, pas nécessairement un code lisible.
   Valider la délivrabilité, les limites de débit et la durée de vie des codes.
3. Autoriser uniquement les domaines/URL de redirection approuvés pour l'environnement,
   sans rendre publiques les prévisualisations Netlify.
4. Créer les clients manuellement via **Authentication → Users → Add user → Create new user**,
   e-mail exact, **Auto Confirm User** activé, sans définir de mot de passe.
   Ne jamais envoyer d'identifiants administrateur ou de clé service_role au client.
5. Paiement Orange Money/MTN MoMo ou WhatsApp : vérification du paiement
   **manuelle et indépendante** de l'inscription ; aucune promesse de facturation
   intégrée. Aucun contrôle d'expiration commerciale automatique en V1.

## Checklist de mise en production — FUTUR PROJET PRODUCTION

**Ne pas copier ni réutiliser les réglages ou secrets du staging comme preuve pour la production.**

- [ ] Désactiver **Allow new users to sign up**.
- [ ] Désactiver **Allow anonymous sign-ins**.
- [ ] Désactiver **Allow manual linking**.
- [ ] Garder **Email** actif et vérifier les autres fournisseurs d'authentification.
- [ ] Régler le modèle e-mail de production (Magic Link / OTP) pour inclure
      `{{ .Token }}` et envoyer réellement un **code à six chiffres**.
- [ ] Vérifier domaine d'envoi, délivrabilité, durée de vie, rate limit,
      Site URL et origines/redirections de production (sans prévisualisation privée).
- [ ] Tester l'échec d'une inscription directe `POST /auth/v1/signup`, l'OTP
      avec une adresse inconnue (aucun compte créé), l'OTP avec un compte créé
      par BEAM, la déconnexion/reconnexion et l'absence d'énumération dans l'UI.
- [ ] Vérifier les contrôles de confidentialité, RLS, Storage et suppression
      de compte existants avant l'ouverture.

**Staging :** le modèle e-mail est encore « Your sign-in link » et ne contient
**pas** `{{ .Token }}`. Mettre à jour le modèle *après* la configuration SMTP
Resend, avant le test réel de connexion par code.

## SMTP transactionnel BEAM — configuration contrôlée

- **Service retenu : Resend**, domaine d'envoi `auth.beamguinee.com`, région
  `Ireland (eu-west-1)` si disponible. Les enregistrements exacts de
  vérification SPF/DKIM/MX seront recopiés dans Netlify DNS après affichage
  dans Resend ; ne pas inventer leurs valeurs.
- **Pas d'intégration automatique Resend–Supabase ni de délégation OAuth
  de l'accès au projet Supabase** : saisir manuellement les paramètres SMTP
  dans Supabase Auth. Créer une clé Resend à permission **Sending access**,
  restreinte au domaine `auth.beamguinee.com`, distincte entre staging et
  production si nécessaire ; ne jamais la placer dans Git, une capture ou le navigateur.
- Champs à configurer après vérification du domaine : adresse expéditrice,
  nom d'expéditeur, hôte `smtp.resend.com`, port SMTP compatible TLS,
  utilisateur `resend`, mot de passe = clé Resend d'envoi.
- **Conserver le verrouillage des inscriptions** : le SMTP sert uniquement
  à la délivrabilité et ne doit pas réactiver l'inscription publique.

## Contrat du navigateur

- `signInWithOtp({ email, options: { shouldCreateUser: false, ... }})`.
- Une tentative inconnue, refusée ou inaccessible affiche **le même parcours neutre**
  qu'une tentative acceptée. Texte permanent :
  « Ce carnet est réservé aux clients BEAM. Contactez-nous sur WhatsApp »,
  lien `https://wa.me/224622095630`.
- Ne jamais afficher `error.message`, `error.code` ou `error.status` dans
  le formulaire, et ne jamais affirmer qu'un e-mail a été envoyé.
- L'écran de code peut s'afficher après un refus ; cela **ne donne aucune session**.
  Seul `verifyOtp` avec un code réellement valide connecte l'utilisateur.
- Le client supprimé ne peut pas s'inscrire à nouveau seul. La réouverture d'un
  accès se fait après nouvelle décision manuelle de BEAM.

## Tests et preuves avant mise en ligne

- Automatique sur PR : `node tests/travel-invite-only-auth.cjs`, qui contrôle
  le frontend, la syntaxe JS et la config Supabase **locale**.
- Staging protégé : `deno run --allow-env --allow-net
  travel/supabase/tests/auth_invite_only.ts`, qui tente l'inscription via
  `POST /auth/v1/signup`, demande un OTP pour une adresse inconnue, vérifie
  l'absence de comptes créés, puis vérifie qu'une création administrative
  **sans mot de passe** permet encore de demander un OTP. Le test utilise
  uniquement des comptes jetables et doit confirmer leur suppression.
- Ce test s'exécute seulement sous l'environnement GitHub
  `staging-destructive`, après validation humaine de la version à tester,
  avec `STAGING_SERVICE_ROLE_KEY` limitée à ce job. Les tests A/B
  existants se connectent aux identités précréées ; le victim bench continue
  à créer les comptes jetables via `admin.auth.admin.createUser`.
- Essai réel sur téléphone et ordinateur : un compte créé manuellement reçoit
  un code lisible à six chiffres, le saisit et retrouve ses voyages après reconnexion.
  Une adresse inconnue et une adresse supprimée ne reçoivent **aucun accès**.
  Vérifier aussi le comportement en cas d'échec SMTP/réseau et de demande répétée.
- Répéter les contrôles **sur production** avant l'ouverture, avec des comptes
  de test dédiés et un nettoyage contrôlé, sans exécuter le banc destructif
  staging contre la production.

## Risque résiduel : énumération via l'API Auth

Le texte du **navigateur** ne distingue plus un compte existant d'un compte inconnu.
En revanche, l'API Supabase publique appelée directement peut produire des statuts
ou des temps de réponse différents ; une interface neutre ne suffit pas à
garantir la non-énumération à un attaquant technique. Documenter ce risque,
surveiller les limitations de débit et activer la protection anti-abus adaptée
avant production. Ne pas déclarer « anti-énumération totale » sans audit
du comportement réseau et solution serveur validée.

**Critères de sortie du NO-GO :** protection serveur observée sur staging,
test CI et staging verts, e-mail OTP à six chiffres réellement reçu,
redirections/cookies validés, puis confirmation équivalente en production.
