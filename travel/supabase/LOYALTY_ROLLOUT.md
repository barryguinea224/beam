# BTH — Programmes de fidélité : procédure de mise en service

**État : à exécuter manuellement après revue.** Cette PR ne déploie aucun SQL sur une base hébergée. Elle cible exclusivement `feature/beam-travel-history-v1`.

## Ordre obligatoire

1. **Staging SQL** — Sur le projet staging distinct, appliquer uniquement `travel/supabase/migrations/20261105150000_loyalty_memberships.sql` dans une transaction. Ne jamais rejouer `schema.sql` sur une base existante. Le rejouer une deuxième fois sur une base de test pour confirmer son caractère idempotent.
2. **Vérifications staging** — Sur un compte de test fictif actif, tester ajouter / modifier / afficher / masquer / copier / supprimer. Tester le format (4–30 lettres, chiffres, tirets), l'unicité par programme et l'impossibilité d'insérer un `user_id` arbitraire ; vérifier la séparation entre deux utilisateurs fictifs et l'absence d'écritures pour un compte expiré ou marqué `deleting`. Vérifier qu'aucun numéro n'apparaît dans le PDF factuel, le journal et le livret. Les tests SQL automatisés `travel/supabase/tests/loyalty_memberships_security.sql` utilisent uniquement une base locale jetable et font `ROLLBACK`.
3. **Aperçu de la PR vers `main`** — Cette PR doit d'abord être intégrée dans `feature/beam-travel-history-v1`. Lors de la future PR de publication **vers main**, contrôler manuellement la prévisualisation sur un téléphone Android : 320, 360 et 390 px, avec un compte fictif sur staging, et les huit liens de compagnies. L'aperçu ne doit jamais utiliser la base de production.
4. **Production SQL** — Après validation formelle de staging et de l'aperçu, appliquer uniquement la migration idempotente sur Supabase production, en transaction. Vérifier les politiques et les privilèges du rôle `authenticated` et l'absence de privilèges `anon`. Éviter d'y injecter des données de test. Préparer une sauvegarde de la base, surveiller les erreurs et disposer d'un plan de retour arrière.
5. **Fusion / publication** — Fusionner ensuite la PR de publication vers `main` et contrôler que le service worker annonce **loyalty-v31**. Vérifier l'application mobile et les journaux d'erreurs avec des comptes de validation autorisés.

## Confidentialité
- La table contient uniquement un identifiant de programme, un numéro d'adhérent, un statut facultatif et une date facultative. Aucun mot de passe, code PIN, code de connexion, URL de session ni photo.
- Lecture, ajout, modification et suppression réservés au propriétaire **et** à un compte actif. Aucun accès anonyme.
- Jamais de données de fidélité dans le cache public de la PWA, les exports PDF ou les captures de tests. Les tests Android utilisent des spécimens fictifs.
- Un numéro affiché ou copié reste une donnée privée : la fonction *Afficher* est explicite et la copie passe par le presse-papiers du navigateur.

## Liens officiels
Les huit URLs sont statiques et limitées aux domaines des compagnies, sans logo ni bibliothèque tierce. **Teranga Air Sénégal :** le formulaire officiel affiche le 5 novembre 2026 que le programme n'est pas actuellement actif ; l'interface affiche cet avertissement. Certains parcours d'inscription (Air France notamment) peuvent comporter une étape de connexion ou de redirection sur le **même domaine de compagnie** et nécessitent un contrôle réel sur Android avant publication.

## Migration sur un projet existant
Ne jamais utiliser le compte administrateur de production depuis une PR ou un workflow CI. Pour une installation fraîche, le bloc de la migration est déjà intégré à `travel/supabase/schema.sql`. Pour les projets hébergés existants, utiliser **uniquement** le fichier de migration. Les contrôles du workflow `travel-schema-fresh-replay.yml` exécutent le schéma et la migration deux fois sur la base Supabase **locale jetable**.
