# Durée d’accès : production — ne rien appliquer automatiquement

1. Confirmer la sauvegarde, l'accès admin SQL Editor et une procédure de récupération.
2. Exécuter `travel/supabase/migrations/20261101230000_travel_access_until_readonly.sql` **dans le projet production**.
3. **Immédiatement** exécuter `travel/supabase/ADMIN_EXTEND_ACCESS.sql` pour votre e-mail et `1 year` ou `2 years`. Vérifier la date `access_until`. Régler aussi la date de tous les comptes existants que vous souhaitez garder inscriptibles.
4. Vérifier : compte actif (écriture), compte expiré (lecture, photos privées, PDF, livret, suppression via `travel-delete`).
5. **Seulement après**, fusionner puis déployer l’application, et actualiser le service worker `v14`.

**Important :** si les étapes 2 et 3 sont deux exécutions distinctes, il existe nécessairement un **intervalle temporaire de lecture seule** (tous les anciens comptes ont `NULL`). Pour garantir zéro intervalle, exécuter **la migration et l'attribution de votre date au sein d'une même transaction** : omettre le `commit;` de fin de migration, ajouter le `DO $admin$ … $admin$;` du fichier admin (sans deuxième `begin;`) et terminer par un seul `commit;`. Ceci respecte l'ordre « migration puis date puis application » et garantit l'atomicité en cas d'échec.

La date `access_until` est inclusive : écriture autorisée jusqu'à ce jour selon `current_date` SQL. `NULL` est lecture seule. La requête d'administration prolonge à partir de la date la plus tardive entre aujourd'hui et l'échéance actuelle, sans effacer les jours restants. La colonne ne doit jamais rejoindre les droits `UPDATE` du client. Ni PDF ni livret ne sont modifiés.
