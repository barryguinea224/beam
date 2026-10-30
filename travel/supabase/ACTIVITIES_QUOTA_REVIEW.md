# Relecture migration — quota serveur de 50 activités (issue #15)

**Périmètre :** `public.activities` uniquement. Aucune photo, aucun souvenir, aucune activité existante supprimée. La migration n'a pas été appliquée à staging.

**Fichiers :**
- `travel/supabase/migrations/20261030182500_activities_quota_50.sql` — migration incrémentale atomique pour une base existante.
- `travel/supabase/schema.sql` — version canonique pour une nouvelle installation.
- `travel/supabase/tests/activities_quota_guards.sql`, `activities_concurrency.sh`, `activities_preflight.sh` — tests sur PostgreSQL **jetable**, jamais sur une base utilisateur.
- `travel/index.html` — affiche « Limite de 50 activités atteinte » sur erreur SQL `23514` + `ACTIVITY_LIMIT_REACHED` ; le formulaire conserve titre, lieu, date facultative.

## Préflight de lecture (requête SELECT uniquement)
Avant toute application au staging, vérifier (sur la base concernée) :

```sql
select trip_id, count(*) as activities_count
from public.activities
group by trip_id
having count(*) > 50
order by activities_count desc;
```

Résultat attendu : **zéro ligne**. S'il existe des lignes, **arrêter** et décider humainement quoi faire, sans les supprimer.

## Garantie transactionnelle
La migration démarre une transaction, prend un verrou `SHARE ROW EXCLUSIVE` sur `public.activities` (le temps du préflight et du DDL), refuse toute activité existante au-delà de 50, puis crée l'index et la fonction déclenchée. Une exception annule **toute** la migration. L'appel direct à la fonction est retiré à `PUBLIC`/`anon`/`authenticated`.

Le trigger exécute une vérification sur **INSERT** et **UPDATE de `trip_id`/`user_id`**, verrouille d'abord la ligne de `public.trips` du même propriétaire et hors suppression, puis recompte les activités. Les modifications de titre/lieu/date, et celles qui ne déplacent pas une activité, ne consomment aucune nouvelle place. Le trigger existant `activities_same_owner` et les policies RLS restent en place.

Le verrou parental rend les insertions concurrentes sûres en isolation Postgres **READ COMMITTED** (mode habituel de PostgREST). L'index `activities_trip_quota_idx` accélère le comptage.

## Ordre d'exploitation (pas exécuté)
1. Relecture du diff et tous contrôles GitHub verts.
2. Préflight en lecture seule sur **staging** ; confirmer zéro voyage au-dessus de 50.
3. Autorisation explicite d'exécuter la migration sur staging.
4. Application sur staging, puis validation réelle avec JWT propriétaire A / propriétaire B, maximum 50, 51e refusée, suppression et remplacement, modifications et concurrence.
5. Vérifier UI Android + journaux d'erreur, puis décision distincte pour un éventuel déploiement production.

**Attention :** les tests CI SQL utilisent une base PostgreSQL de passage, donc ils prouvent la logique DDL et de concurrence mais ne sont pas un test de déploiement staging. La migration ne doit pas être appliquée automatiquement par GitHub Actions.

## Retour arrière
Pour une correction de bug, préférer une migration de correction après revue. Retirer le trigger supprime le plafond et ne doit jamais être traité comme un rollback anodin en production. Aucune suppression de données n'est incluse.
