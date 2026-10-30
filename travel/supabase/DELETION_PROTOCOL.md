# Travel deletion protocol (review draft)

Status: CODED, NOT DEPLOYED, NOT TESTED.

The browser must never delete `trips`, `media`, Storage objects, or Auth users directly.

## Invariants

### Photo
1. Resolve media row by `id + caller user_id`.
2. Remove exact Storage object.
3. Verify exact object is absent through Storage listing.
4. Delete media row.
5. Retry is idempotent: missing row returns success/already absent.

### Trip
1. Resolve trip by `id + caller user_id`.
2. List the whole technical prefix `<user_id>/<trip_id>`, including orphan objects with no media row.
3. Remove Storage objects in batches.
4. Re-list and require prefix empty.
5. Delete trip row. DB cascades remove media/activity rows only after Storage is empty.
6. Retry before DB deletion repeats Storage cleanup; retry after DB deletion returns success/already absent.

### Account
1. Strong confirmation.
2. Server sets `profiles.deleting=true` and `deletion_requested_at`.
3. Existing RLS then blocks client Storage SELECT/INSERT/DELETE through `account_accepts_writes()`.
4. Server lists and removes every object below `<user_id>`.
5. Server re-lists and requires the prefix empty.
6. Only then call Auth admin delete user.
7. FK cascades remove profile/trips/media/activities.
8. If Storage cleanup or Auth deletion fails, the profile remains `deleting=true`; retry resumes cleanup.
9. After Auth deletion, an old JWT must fail writes. This is a mandatory hostile-bench assertion.

## Mandatory review/test cases before deployment

- delete one photo: object absent first, media row absent second.
- delete trip with >=2 photos: prefix empty before trip row disappears.
- interruption after one/batch of Storage removals: retry completes.
- account with multiple trip prefixes: all objects removed before Auth.
- negative guard: deliberately leave one owned Storage object and prove Auth deletion is refused; profile remains `deleting=true`; retry can finish.
- replay captured pre-deletion JWT against DB and Storage INSERT after deletion: all writes fail.
- cross-owner IDs for photo/trip: no victim data/object changes.
- repeated delete requests are safe.
- pagination: >100 objects is exercised or mechanically tested.

## Deliberately not exposed in UI

No delete button and no photo upload reactivation until this protocol is reviewed, deployed to staging, and the hostile bench is green.
