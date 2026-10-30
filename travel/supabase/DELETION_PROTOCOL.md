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
To trigger from an unmerged PR, a maintainer adds the `staging-victim-approved` label to the PR
(remove then re-add it for a new SHA); routine PR pushes do **not** run this destructive workflow.
After the workflow exists on the default branch, `workflow_dispatch` is an alternative.
Do not authorize the destructive run until the staging migration, functions and secrets are deployed,
and the non-destructive checks are green.
One step only receives `STAGING_SERVICE_ROLE_KEY` and `STAGING_TRAVEL_RETRY_SECRET`, stored only in that
approved environment. Accounts are created per run
(`<ci-base>+ci-victim-<run>` / `+ci-bystander-<run>`), never `+ci-a` / `+ci-b`.

| Mandatory case | Bench section |
|---|---|
| delete one photo: object absent, then row absent | 2 |
| retry delete_photo is idempotent | 2 |
| delete trip with >=2 photos: prefix empty, rows cascaded | 3 |
| retry delete_trip is idempotent | 3 |
| cross-owner photo/trip IDs: no victim change | 1 |
| interruption (locked + partially cleaned trip), aged >1h, automatically resumed by retry worker | 4 |
| pagination: 110 objects across two list pages | 4 |
| upload refused into a trip being deleted | 4 |
| active lease refuses worker start; expired lease is reclaimed after admin-only time travel | 4b |
| every worker dispatch has a durable completed receipt with claim/start/success/failure counts | 4, 4b, 5d |
| missing or incorrect retry secret returns 401 | setup, before section 1 |
| destructive retry failure followed by a blocked immediate retry (10m backoff) | 5d |
| failure becomes eligible after aging `deletion_last_attempt_at` by 11m | 5d |
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


## Automatic retry worker

Status: **DEPLOYED AND VERIFIED ON ISOLATED STAGING** (victim bench: 76 assertions); cron is still disabled. The code in this PR is newer than the deployed worker until a fresh approved staging deployment.

A deletion that remains locked for more than one hour is eligible for automatic retry. The cron dispatcher never performs deletion itself. It only sends an asynchronous request to the protected `travel-deletion-retry` Edge Function. The worker claims at most **5** rows with 10-minute leases, then calls the same shared deletion engine used by `travel-delete`.

### Concurrency and observability

- `claim_stale_deletions()` uses `FOR UPDATE SKIP LOCKED`, a lease and a unique claim token; overlapping passes cannot own the same row.
- Claiming does **not** count as an attempt. `start_deletion_retry()` increments the attempt counter only when destructive work actually starts.
- The worker first persists a private `deletion_retry_runs` receipt, acknowledges the dispatch with HTTP 202 and `run_id`, and executes under `EdgeRuntime.waitUntil`. Each background pass marks its own receipt `completed` or `failed` with `finished_at` and bounded claimed/started/destructive-result counts. A crash may leave a receipt `running`: absence of `finished_at` is **not** success.
- The manually approved staging bench reads only its receipt via a service-role-only RPC and waits for `finished_at` before negative assertions. It fails if the receipt is missing, failed or does not finish within the deadline; the old 2.5-second sleep has been removed.
- The receipt has no document data, email addresses or credentials. The private table is not exposed to browser roles; write/read RPC execution is restricted to `service_role`.
- The worker claims at most 5 subjects and stops **starting** new work after a 90-second start budget; this is not a hard execution timeout. Unstarted claims are released. A failed or unconfirmed release causes a run receipt with status `failed` and code `RELEASE_FAILED`; all remaining releases are still attempted. A pure Deno unit test with a simulated clock and DB verifies five claims, one started deletion crossing the deadline, four released claims and exact receipt counts, including a release failure. This test does not need staging, credentials or destructive fixtures.
- Failed destructive attempts use exponential backoff: 10m, 20m, 40m, 80m, 160m, 320m, then a 6h cap.
- A destructive failure clears its lease and persists a normalized error code. A success-log failure is logged operationally but is never reclassified as destructive failure.
- Every persisted worker outcome is appended to `private.deletion_retry_log`.
- Automatic retries stop after 12 **started** attempts; the row remains locked for operator review.
- `private.stuck_deletions` signals rows older than 24h, at the 12-attempt ceiling, or (defensively) any legacy deleting row missing its request timestamp.
- Database constraints require every `deleting=true` profile/trip to have `deletion_requested_at`; migration repairs legacy nulls before adding them.
- Account deletions take priority. A trip is not independently claimed while its owning account is deleting.
- A protected `travel-deletion-monitor` endpoint checks stuck deletions, `running` receipts older than 15 minutes, and `failed` receipts with `finished_at` in the rolling last 24 hours (including `RELEASE_FAILED`). All three counts must be zero for HTTP 200; incidents return HTTP 503. This newer version is **coded but not deployed** and still requires staging verification before enabling cron.


### Runtime interruption and recovery

A deletion started at 89 seconds may still be interrupted by the Supabase runtime: the 90-second budget is **not** a hard cutoff. The affected account or trip remains `deleting=true` and therefore write-locked; its 10-minute lease eventually expires, and a later invocation can resume idempotently. A runtime kill may prevent the final receipt write, leaving a `running` receipt; the monitor reports a running receipt older than 15 minutes. This is an architectural recovery path, **not a real runtime-kill test**. A failed release in a normally finishing worker instead produces a durable `failed` receipt with `RELEASE_FAILED`; the updated, not-yet-deployed monitor alerts on such receipts completed in the last 24 hours.

### Secret boundary

The retry endpoint has `verify_jwt = false` because `pg_net` is not a user session. It therefore requires the independent header secret `x-travel-retry-secret`.

For staging deployment, generate one high-entropy value and store the same value in two server-only locations:

1. Edge Function secret `TRAVEL_RETRY_SECRET`.
2. Supabase Vault secret named `travel_retry_secret`.

Vault also receives `travel_retry_project_url`. Neither retry secret value belongs in Git, browser code, ordinary GitHub Actions, logs, or SQL migration text. **Only for the manually approved destructive staging bench**, a copy of the *staging* retry secret must be provided as `STAGING_TRAVEL_RETRY_SECRET` in the protected `staging-destructive` GitHub environment; it is passed only to the final destructive step. Never use a production retry secret here.

Monitoring uses a separate `TRAVEL_MONITOR_SECRET`. Its staging copy is stored as an Edge Function secret and as the GitHub `staging` environment secret used only by the daily health workflow; it has no database credential or deletion authority.

### Staging activation order

1. Review the PR and confirm the dedicated `staging-destructive` environment requires approval; keep the PR in draft and cron disabled.
2. Apply `travel/supabase/migrations/deletion_retry_worker.sql` to an isolated staging project (not production).
3. Deploy both `travel-delete` (shared-engine refactor) and `travel-deletion-retry`.
4. Configure the Edge Function secret and Vault entries.
5. Configure the protected GitHub environment secret `STAGING_TRAVEL_RETRY_SECRET` (staging copy only), verify there are **no other in-progress deletions** on staging, apply the explicit `staging-victim-approved` label to the reviewed PR and approve the protected `staging-destructive` run for its exact commit. The workflow intentionally does not run automatically on each PR push.
6. Run the victim bench. It must prove: **401** for wrong/missing secrets; **202 + run id + durable completion** for an interrupted stale trip; a finished worker pass with zero claims/starts during a live lease; and a finished pass with zero claims/starts while backoff is active. After aging each fixture date, it must observe a new completed receipt with one true attempt and the expected destructive outcome. The bench only modifies dates on its own disposable fixtures using a server-side admin credential.
7. Artificially aging timestamps tests the **database eligibility and claim transitions**, not a genuine 10-minute wall-clock passage; run a separate real-elapsed soak if that guarantee is needed. Inspect the private retry log and final Auth/DB/Storage state on staging, including a >24h stuck signal.
8. Run the pure Deno test in `travel/supabase/tests/travel-retry-runner_test.ts` on every relevant PR commit. This proves the 90-second **start** decision and error reporting independently of staging. It does not prove Supabase runtime behavior. Before enabling cron, deploy the updated adapter through the separate approved staging workflow and rerun appropriate staging validations.
9. Only after all staging gates pass and the reviewer authorizes activation, install the five-minute cron schedule and merge through the normal review flow. Keep the user-facing deletion UI disabled until the scheduled retry path itself is proven.

The fact that `pg_net` accepted a request (or the worker returned HTTP 202) is never treated as deletion success. A completed per-run receipt is evidence that the **pass** finished, not that each deletion succeeded: inspect its counters and the final database/Storage/Auth state. An unfinished receipt must fail staging acceptance and should be investigated in worker logs.
