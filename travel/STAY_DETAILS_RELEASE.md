# Mise en service — compagnie aérienne et hébergement (BTH)

Cette PR ajoute deux **noms facultatifs** par séjour :
- `airline` : compagnie aérienne (160 caractères maximum).
- `hotel` : hôtel / hébergement (160 caractères maximum).

Les champs peuvent rester vides ou être effacés. Ils n'apparaissent sur la
fiche ou dans les carnets personnels que s'ils sont renseignés. Aucun document
ni numéro de billet ou de réservation n'est nécessaire. Plusieurs noms peuvent
être saisis séparés par des virgules pour les voyages à étapes.

## Déploiement manuel, dans cet ordre

1. Vérifier les tests CI de la PR. Aucune connexion staging/prod en CI.
2. Appliquer sur le **staging** le SQL idempotent
   `travel/supabase/migrations/20261104160000_trips_airline_hotel.sql`.
3. Tester un ancien compte (deux champs vides), un nouveau séjour, la modification,
   l'effacement, un compte expiré et la génération des deux carnets personnels.
4. Appliquer le même SQL en **production**, puis seulement publier l'interface
   mise à jour. Faire recharger le schéma de l'API PostgREST si nécessaire.
5. Tester sur Android : création, édition et lecture privée, sans débordement à
   320, 360 et 390 px. L'ancien client reste compatible avec les nouvelles colonnes.

**Ne pas réexécuter schema.sql en production** : schéma canonique prévu pour une
installation vierge. Aucun secret dans la migration ou les workflows.

## Invariants

- `public.trips` : RLS propriétaire, accès limité selon `access_until`,
  `UPDATE` par colonnes autorisées uniquement.
- `public.travel_history_pdf` : exactement les six champs historiques, inchangés.
- Aucune pièce jointe, justificatif ni nouvelle donnée de paiement.
- Le cache public n'enregistre aucune donnée privée supplémentaire.
- Les noms sont **déclarés par le voyageur**, ne prouvent aucune réservation.
