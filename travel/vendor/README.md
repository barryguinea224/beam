# SDK Supabase local (sans CDN au runtime)

`supabase.umd.js` est le build UMD de `@supabase/supabase-js` v2.58.0, auto-hébergé sous `/travel/vendor/`. Source originale : publication npm `@supabase/supabase-js@2.58.0`, `dist/umd/supabase.js`. Copie initialement récupérée depuis le dépôt public `MattCheramie/GopherTrunk` (`docs/assets/js/vendor/supabase.min.js`, SHA Git `1a1146b7d0770624b3e00565c6d63185dd35f461`). La CI vérifie l'identité du code UMD à l'artefact officiel de npm (en ignorant seulement le préambule de provenance).

Licence MIT : `SUPABASE-LICENSE.txt`.

Mise à niveau : télécharger une version officielle épinglée depuis npm, copier `dist/umd/supabase.js` dans `supabase.umd.js`, garder la licence, modifier le test de provenance, vérifier Auth/Storage/RLS dans la CI et incrémenter `CACHE_NAME` dans `travel/sw.js`. **Ne jamais intégrer de clé privée ni d'URL signée dans les assets.** Les requêtes métier vers le projet Supabase demeurent nécessaires ; aucun CDN de scripts ou de polices n'est requis au chargement de l'application.
