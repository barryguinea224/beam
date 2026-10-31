# Audit A — BEAM Travel History : comptes créés uniquement par BEAM

**Décision produit (31 octobre 2026)** : achat unique hors application, aucune expiration
commerciale automatique, création de compte réservée au propriétaire de BEAM depuis
Supabase Authentication → Users → Add user. Aucun espace administrateur dans le carnet.

**État : BLOQUANT / NO-GO** tant que le réglage Auth hébergé, les tests hostiles staging
et l'essai réel du code à six chiffres ne sont pas validés. La configuration locale et
le code navigateur ne suffisent PAS à désactiver les inscriptions dans Supabase Cloud.

## Contrôles obligatoires dans chaque projet Supabase (staging, puis production)

1. Dans **Authentication → General Configuration**, désactiver
   **Allow new users to sign up** (les intitulés peuvent évoluer).
   Ne pas désactiver le fournisseur Email : les comptes existants doivent encore
   recevoir des codes de connexion. Vérifier séparément que les inscriptions anonymes
   sont désactivées, et qu'aucun fournisseur social autorisant une création publique
   n'est activé.
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
