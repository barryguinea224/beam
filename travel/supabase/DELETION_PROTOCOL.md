# Travel deletion protocol (review draft)

Status: CODED, NOT DEPLOYED, NOT TESTED. Review revision 2.

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


## Review revision 2 — blockers addressed

- Trip deletion sets `trips.deleting=true` before Storage cleanup.
- Storage INSERT requires segment 2 to be a real, owned, non-deleting trip.
- Media `storage_path` is constrained to the exact `<user>/<trip>/<uuid>.(webp|jpg|png)` shape.
- Browser raw DELETE on `trips` and `media` is revoked.
- CORS handles OPTIONS and allows only BEAM production + current staging preview origins.
- `deletion_requested_at` preserves the first request timestamp.
- Starting account deletion requires `last_sign_in_at` <= 10 minutes; retries after the barrier do not.
- Post-success retry with an old JWT is expected to return 401; UI must treat that as terminal success only when it already observed/initiated account deletion.
- Retry worker (>1h) remains REQUIRED BEFORE UI, and is intentionally not yet marked coded.

### Added hostile assertions

- Upload to invented trip UUID is denied.
- Upload racing a trip deletion after `deleting=true` is denied.
- B cannot insert a media row with a trapped/path-traversal-like `storage_path`; A's object remains.
- Direct browser DELETE of trip/media is denied.
- Deliberately retained owned Storage object blocks Auth deletion; profile remains deleting; retry completes after cleanup.

## Disposable victim bench (`tests/victim_bench.ts`)

Workflow `.github/workflows/victim-bench.yml`, disabled until `VICTIM_BENCH_ENABLED=true`, and
run only in the `staging-destructive` environment, whose required reviewers must approve each run.
One step only receives `STAGING_SERVICE_ROLE_KEY`, stored only in that environment. Accounts are created per run
(`<ci-base>+ci-victim-<run>` / `+ci-bystander-<run>`), never `+ci-a` / `+ci-b`.

| Mandatory case | Bench section |
|---|---|
| delete one photo: object absent, then row absent | 2 |
| retry delete_photo is idempotent | 2 |
| delete trip with >=2 photos: prefix empty, rows cascaded | 3 |
| retry delete_trip is idempotent | 3 |
| cross-owner photo/trip IDs: no victim change | 1 |
| interruption (locked + partially cleaned trip) then resume | 4 |
| pagination: 110 objects across two list pages | 4 |
| upload refused into a trip being deleted | 4 |
| interruption of an account deletion (locked + partially cleaned) then resume, without fresh auth | 5b, 5d |
| DB writes refused while `deleting=true`: trip insert/update, activity insert, media insert | 5c |
| owned object outside prefix: Auth deletion refused, `deleting=true` and first request date kept | 5d |
| upload refused while account is deleting | 5c |
| resume after blocker removed: account fully deleted | 5d |
| post-deletion: Auth, profile, trips, media, prefix, owned objects all gone | 6 |
| replay pre-deletion JWT: DB insert refused, Storage insert refused, no ghost | 7 |
| endpoint answers 401 to the old JWT after completed deletion | 7 |

Stale disposable accounts older than 1 h are swept at start; cleanup runs in `finally`
and fails the job if it cannot complete.
