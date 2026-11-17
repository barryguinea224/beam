# SDK Supabase local (sans CDN au runtime)

`supabase.umd.js` est le build UMD de `@supabase/supabase-js` v2.58.0, auto-hébergé sous `/travel/vendor/`. Source de référence unique : le tarball officiel npm `@supabase/supabase-js@2.58.0` (`https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.58.0.tgz`), fichier `package/dist/umd/supabase.js`. SHA-256 du fichier officiel : `3ae8cfec4a4715f4e67aa45fe4e7c1a40d67787629c7f10e32afd7dd836edf4e`. La CI conserve le test de provenance qui compare le code UMD local avec ce fichier issu de npm (en ignorant seulement le préambule de provenance).

Licence MIT : `SUPABASE-LICENSE.txt`.

Mise à niveau : télécharger une version officielle épinglée depuis npm, copier `dist/umd/supabase.js` dans `supabase.umd.js`, garder la licence, modifier le test de provenance, vérifier Auth/Storage/RLS dans la CI et incrémenter `CACHE_NAME` dans `travel/sw.js`. **Ne jamais intégrer de clé privée ni d'URL signée dans les assets.** Les requêtes métier vers le projet Supabase demeurent nécessaires ; aucun CDN de scripts ou de polices n'est requis au chargement de l'application.
