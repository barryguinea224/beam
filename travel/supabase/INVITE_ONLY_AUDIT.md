# Audit A — BEAM Travel History : comptes créés uniquement par BEAM

**Décision produit (31 octobre 2026)** : achat unique hors application, aucune expiration
commerciale automatique, création de compte réservée au propriétaire de BEAM depuis
Supabase Authentication → Users → Add user. Aucun espace administrateur dans le carnet.

**État : SMTP dédié + OTP six chiffres validés sur le staging le 31/10/2026**,
sur la base de l'essai réel confirmé par le propriétaire. **NO-GO production**
jusqu'à la configuration du futur projet de production et à la validation des
autres contrôles de publication. Le code navigateur ne suffit PAS à désactiver
les inscriptions dans Supabase Cloud.

### Vérifications réalisées sur staging (31 octobre 2026 — informations communiquées par le propriétaire)

- **Allow new users to sign up : OFF**.
- **Allow anonymous sign-ins : OFF**.
- **Allow manual linking : OFF**.
- **Fournisseur Email : ON**.
- **Modèle Magic Link du staging corrigé le 31/10/2026** : français,
  utilisation de `{{ .Token }}` pour afficher un **code à six chiffres**,
  expiration OTP **900 s (15 min)**.
- **SMTP transactionnel opérationnel** : Resend, expéditeur
  `connexion@auth.beamguinee.com`, région **Ireland**, domaine
  `auth.beamguinee.com` vérifié (DKIM, SPF et DMARC `p=none` publiés dans
  **Netlify DNS**). DMARC `p=none` surveille et ne bloque pas les messages
  qui échouent à l'authentification ; réévaluer sa politique en production.
- **Sécurité de l'envoi** : TLS **Enforced**, suivi des clics **désactivé**,
  suivi des ouvertures **désactivé**. Configuration SMTP saisie
  **manuellement** dans Supabase avec une clé Resend **Sending access**
  restreinte au domaine ; **aucune intégration OAuth Resend–Supabase**.
- **Sécurité des comptes** : double authentification activée pour
  **Resend et Google**, d'après le propriétaire.
- **Preuve fonctionnelle (31/10)** : code reçu en **boîte de réception**,
  message **en français**, puis **connexion réussie avec ce code**.
  Ce constat est rapporté par le propriétaire et ne constitue pas une
  inspection indépendante des paramètres hébergés.
- Adresse inconnue testée depuis l'ancienne prévisualisation : refusée, aucun
  utilisateur créé. L'ancienne UI affichait néanmoins l'erreur brute en anglais
  « Signups not allowed for this instance », donc divulguait un indice de statut.
  La PR #26 corrige cet affichage ; **le test sur la nouvelle interface**
  a été confirmé ensuite par le propriétaire : message neutre, aucun e-mail
  à l'adresse inconnue. L'accès par code pour une adresse cliente a
  également été validé de bout en bout sur staging.
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
- [ ] Créer une **clé API Resend distincte** pour la production, de type
      **Sending access** et limitée à `auth.beamguinee.com` (ou au domaine
      d'envoi retenu) ; **ne pas réutiliser la clé du staging**.
- [ ] Configurer **manuellement le SMTP Resend** sur le projet Supabase
      de production, sans autorisation OAuth Resend–Supabase :
      `connexion@auth.beamguinee.com` comme expéditeur, **Ireland**,
      **TLS Enforced**, suivi des clics et ouvertures **désactivé**.
- [ ] Vérifier DKIM, SPF, DMARC et les enregistrements DNS du domaine
      d'envoi sur Netlify ; évaluer le passage progressif de DMARC
      `p=none` à une politique d'application après observation des rapports.
- [ ] Régler le modèle e-mail **Magic Link** en **français**, avec
      `{{ .Token }}` ; vérifier **OTP six chiffres** et **expiration
      900 s** sur le projet de production.
- [ ] Tester la **réception en boîte de réception** et la connexion
      effective par OTP pour un compte client autorisé en production.
- [ ] Vérifier domaine d'envoi, délivrabilité, durée de vie, rate limit,
      Site URL et origines/redirections de production (sans prévisualisation privée).
- [ ] Tester l'échec d'une inscription directe `POST /auth/v1/signup`, l'OTP
      avec une adresse inconnue (aucun compte créé), l'OTP avec un compte créé
      par BEAM, la déconnexion/reconnexion et l'absence d'énumération dans l'UI.
- [ ] Vérifier les contrôles de confidentialité, RLS, Storage et suppression
      de compte existants avant l'ouverture.

**Staging — résolu le 31/10/2026 :** SMTP Resend dédié actif, modèle
Magic Link français avec `{{ .Token }}`, OTP six chiffres valable
900 secondes ; réception et connexion réellement testées. **Ne pas refaire
ce réglage** pour ce chantier. Le nouveau projet de production doit recevoir
sa propre configuration et une clé Resend distincte.

## SMTP transactionnel BEAM — configuration contrôlée

- **Service installé et testé sur staging le 31/10/2026 : Resend**,
  domaine vérifié `auth.beamguinee.com`, région **Ireland**.
  DKIM, SPF et DMARC `p=none` ont été configurés dans **Netlify DNS**.
  Les valeurs exactes des enregistrements ne sont pas consignées ici :
  consulter Resend et Netlify pour vérifier leur état réel.
- **Pas d'intégration automatique Resend–Supabase ni de délégation OAuth
  de l'accès au projet Supabase** : saisir manuellement les paramètres SMTP
  dans Supabase Auth. Sur staging, la clé **Sending access** est
  restreinte à `auth.beamguinee.com`. Pour la production, une
  **nouvelle clé distincte** est obligatoire ; ne jamais placer une clé
  dans Git, une capture ou le navigateur.
- Paramètres de référence : expéditeur `connexion@auth.beamguinee.com`,
  hôte `smtp.resend.com`, utilisateur `resend`, mot de passe = clé
  Resend d'envoi **non documentée** ; TLS obligatoire (**Enforced**),
  suivi des clics et des ouvertures désactivé. Vérifier le port SMTP
  dans la configuration hébergée sans l'inférer à partir de ce document.
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
- **Essai réel sur staging réussi le 31/10/2026**, selon le propriétaire :
  code de six chiffres reçu en boîte de réception et connexion réussie.
  Adresse inconnue : message neutre, aucun e-mail et aucun compte créé
  (résultats rapportés). **Restent à compléter** : régression après chaque
  changement d'Auth, scénario compte supprimé, panne SMTP/réseau,
  demandes répétées et vérification sur un appareil partagé.
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

**Critères de sortie du NO-GO production :** protection serveur du projet de
production, clé Resend propre à la production, SMTP/TLS validés, modèle
français avec `{{ .Token }}`, OTP six chiffres / 900 s reçu et utilisé en
conditions réelles, CI/contrôles hostiles requis et redirections/cookies
validés en production. **Le succès staging ne vaut pas autorisation de lancer
la production.**
