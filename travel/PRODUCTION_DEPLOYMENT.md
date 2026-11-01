# BEAM Travel History : configuration production et déploiement manuel

Statut déclaré par le propriétaire le 01/11/2026 (non vérifié ici) : Supabase production aojxeujjluhmnkwscndc (Paris, Pro), pg_net et pg_cron actifs, schema.sql installé, fresh_install_invariants.sql vert, inscriptions/anonyme/liaison désactivés, OTP français 6 chiffres / 900 s, URL Auth https://beamguinee.com/travel/ seule, SMTP Resend production distinct avec e-mail OTP reçu. Aucun accès Supabase n'est utilisé dans cette PR.

## Netlify : variables de build, jamais clés administrateur

- BEAM_TRAVEL_PRODUCTION_PUBLIC_KEY : valeur publishable ou anon de production, à définir dans Netlify (scope Builds), utilisée seulement en CONTEXT=production depuis BRANCH=main ; URL figée https://aojxeujjluhmnkwscndc.supabase.co.
- BEAM_TRAVEL_STAGING_PUBLIC_KEY : valeur publishable ou anon de staging, à définir dans Netlify (scope Builds), utilisée pour deploy-preview, branch-deploy, preview-server et dev ; URL figée https://coigbvhxywbmqgacmhzf.supabase.co.
- Ne pas utiliser de clé production comme valeur globale commune aux contextes. Ne jamais mettre sb_secret, service_role, SMTP ou jeton de management dans le client, Netlify ou Git.
- Le build Netlify génère travel/config.js. Le fichier suivi dans Git est volontairement vide. Le build refuse un contexte inconnu, une clé absente/non publique ou deux clés identiques ; il ne journalise pas les clés. Une clé publishable/anon est publique par conception : les accès restent protégés par RLS et Storage.
- Après un déploiement explicitement approuvé, vérifier que beamguinee.com/travel/config.js pointe sur production et que le config.js des aperçus Netlify privés pointe sur staging. Ne pas rendre publics les aperçus.

## GitHub : environnement production à créer par le propriétaire

- Workflow .github/workflows/deploy-production-functions.yml : workflow_dispatch uniquement, refus d'un autre dépôt et de toute branche différente de main, environnement GitHub production requis.
- Dans GitHub Settings > Environments, créer production avec required reviewers et restriction de branches à main. Le YAML ne peut pas activer lui-même ces protections. Vérifier la possibilité d'approbation par le propriétaire (self-review).
- Définir SUPABASE_ACCESS_TOKEN seulement comme secret de cet environnement : token Supabase management limité au projet production, Edge Functions Read/Write + Project Settings Read, expiration courte. Le révoquer dans Supabase après le run, succès, échec ou annulation, puis supprimer le secret GitHub. Aucune valeur dans le dépôt.
- La CLI déploiera seulement travel-delete (verify_jwt=true), travel-deletion-retry et travel-deletion-monitor (verify_jwt=false, authentification par leurs propres secrets). Aucun SQL, Vault, pg_cron, appel HTTP, suppression ou activation automatique.
- Le code de travel-delete autorise seulement https://beamguinee.com en production et maintient les previews Netlify uniquement sur staging.

## Secrets d'exécution Edge Functions : noms uniquement

- TRAVEL_RETRY_SECRET : secret aléatoire fort, propre à production, vérifié via x-travel-retry-secret ; manquant ou incorrect = 401. NE PAS appeler ce worker pour tester : il peut supprimer des données.
- TRAVEL_MONITOR_SECRET : secret aléatoire fort distinct, vérifié via x-travel-monitor-secret ; manquant ou incorrect = 401.
- SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS (ou SUPABASE_ANON_KEY) et SUPABASE_SECRET_KEYS (ou SUPABASE_SERVICE_ROLE_KEY) sont normalement injectés automatiquement dans les Edge Functions hébergées. Vérifier leur disponibilité ; ne jamais copier les clés secrètes serveur vers Netlify/GitHub/navigateur.
- SUPABASE_ACCESS_TOKEN (GitHub) ne sert qu'au déploiement, pas à l'exécution des fonctions.

## Reporté volontairement

Ne pas créer les secrets Vault travel_retry_project_url / travel_retry_secret et ne planifier aucun pg_cron. Aucun lancement de workflow ou de test dans cette demande.
