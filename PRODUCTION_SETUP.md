# BEAM Travel History — Production setup (runbook, NOT a deployment)

**State:** preparation only. No staging or production project, secret, cron job or database is changed by this document or by the fresh-schema CI workflow.

**Source of truth:** `travel/supabase/schema.sql` (canonical schema; reviewed 31 October 2026).
The ten files in `travel/supabase/migrations/` are **historical references**, **NOT** a second batch to apply after `schema.sql`. In particular, `db_write_barrier.sql`, `deletion_barriers_review.sql` and `deletion_retry_worker.sql` must not be replayed automatically on the canonical schema. No files are moved or renamed.

## A. Clean-room database rehearsal (no hosted access)

Use [`.github/workflows/travel-schema-fresh-replay.yml`](.github/workflows/travel-schema-fresh-replay.yml) on the feature branch, which:
1. Starts a **new local Supabase CLI Docker stack** in the disposable GitHub runner, with no linked remote project.
2. Installs **pg_net** in the `extensions` schema and **pg_cron** in `pg_catalog`, but **does not create any cron jobs**.
3. Replays **only** `travel/supabase/schema.sql` with `psql -X -v ON_ERROR_STOP=1`, failing on the first error.
4. Asserts owner-only RLS, browser column grants, private Storage policies, privileged RPC restrictions and the absence of scheduled jobs.
5. Runs the explicitly allowlisted, local-only SQL regression tests, whose fixtures are rolled back.

Do not use `supabase link`, `supabase db push`, hosted SQL editors, a project reference, service-role keys, Vault secrets, or `supabase functions deploy` in this workflow.

**Release gate:** do not create the production schema until this CI has passed and the current staging schema has been compared separately in **read-only mode**.

## B. Production-only environment steps (outside schema.sql)

### 1. Isolation and ownership

- Keep existing staging in the free organization; create a **separate BEAM Production organization** on Supabase Pro only when ready.
- Create the production project with an appropriate supported region; record project ref **outside this runbook**, in an access-controlled operational record.
- Restrict admin membership, enforce MFA, configure usage/cost alerts, and prohibit exposing service-role/secret keys in the frontend.
- Deploy **no staging user accounts, test data, test photos, or staging secrets** to production.
- Use application URL `https://beamguinee.com/travel/`, allowlisted Auth redirects and a distinct production public/publishable client key.

### 2. Extensions, prerequisites and schema replay

The canonical schema assumes a running Supabase stack with `auth.users`, `auth.uid()`, `storage.objects`, storage helper functions and Vault support.
- Enable **pg_net** under schema `extensions` and **pg_cron** under `pg_catalog` *before* applying the canonical schema, matching the proven clean-room rehearsal.
- Check that Supabase Vault is installed, and that the account applying the schema has the required privileges and extension support.
- Apply **only `travel/supabase/schema.sql`**, once, to the new empty application schema, with errors fatal; never replay historical migrations on top as a routine step.
- Audit exact RLS policies, exposed schemas/column grants, triggers, `security_invoker` view, private Storage bucket, `SECURITY DEFINER` grants and quotas against the reviewed staging inventory.
- Ensure the application role cannot mutate `media.storage_path`, `user_id` or `profiles.deleting`; all destructive photo/trip actions must stay server-only.
- The canonical schema **does not schedule** the deletion retry worker; this is intentional.

### 3. Invitation-only Supabase Auth and Resend

- In the **hosted production Auth settings**, disable public sign-ups, anonymous sign-ins and unwanted manual linking. Local `supabase/config.toml` alone does *not* configure hosted Auth.
- Create customers **manually** after payment: where the dashboard requires it, use a long, randomly generated password, **never shared, saved as a BEAM customer credential, or used for login**. Confirm their e-mail; customer access remains by six-digit OTP only.
- Configure the approved French Magic Link e-mail template containing `{{ .Token }}`; validate 6-digit codes and 900-second lifetime.
- Reuse verified sender domain `auth.beamguinee.com`, but generate a **new production-only, sending-restricted Resend credential** and configure SMTP/TLS and e-mail limits in the protected dashboard. Do not copy the staging credential.
- Test unknown e-mail neutrality, missing/ineligible account, OTP success, expiry, resend throttling, logout and session recovery.
- Confirm the login flow uses `shouldCreateUser:false` and does not expose whether an address is registered.

### 4. Secrets, Edge Functions and the deletion worker

- Deploy only reviewed production builds of `travel-delete`, `travel-deletion-retry`, `travel-deletion-monitor`, with their appropriate JWT/gateway settings.
- Use **production-specific credentials** stored in Supabase's protected server-side secret store. Never place real values in this Markdown document, repository, GitHub Actions logs, frontend `config.js`, or chat.
- Configure worker authentication independently of staging. Grant only the minimal permissions required for scheduled retries and monitoring.
- Within Supabase Vault, after security review, create the two **exact name labels** referenced by the canonical function: `travel_retry_project_url` (production project URL) and `travel_retry_secret` (matching production-only worker authorization secret). These are **identifiers, not secret values**.
- Confirm the function `private.dispatch_travel_deletion_retry()` reads those labels, dispatches only to the approved production Edge Function, returns an expected status and never logs the secret.
- **Do not schedule the job during schema installation.** Only after an explicit approval and a successful destructive test on *disposable production test accounts*, register **one** bounded `pg_cron` task invoking `private.dispatch_travel_deletion_retry()`; review its frequency, job identity and retry budget first.
- Verify jobs and Vault access through read-only introspection; confirm duplicate jobs do not exist, monitor error counters and review results over 24 hours. Keep a tested unschedule/revoke procedure and rollback plan.

### 5. Backups, retention and deletion — pending legal review

- Verify Supabase Pro's PostgreSQL backup/recovery policy, keeping in mind that database backups do **not** contain Storage objects themselves.
- **Proposed policy, subject to jurist approval:** daily encrypted offsite snapshots of private photos, with a strictly rolling retention of **at most 7 days**, no public access, separately protected encryption keys and authenticated access logging.
- When deleting an account, immediately delete its active Storage objects, exclude them from every new snapshot, and prevent older snapshots from reintroducing erased accounts or photos upon restore (tombstone/deletion ledger or equivalent restore-time reconciliation).
- Backups that already contain a deleted photo may remain encrypted until their **seven-day maximum expiry**. Disclose this accurately, subject to the jurist's assessment of applicable deletion requirements.
- Practice a restore of both database and Storage in an isolated temporary environment, including a **deleted-user non-resurrection** test.

### 6. Domain, PWA and controlled pilot

- Inspect Netlify production domain/TLS, production public `config.js`, CSP/HTTP caching rules and Supabase Auth redirect allowlist.
- Merge the reviewed Travel branch to `main` only after approval. Check PWA manifest (including `crossorigin="use-credentials"`), offline privacy, icon BTH and update handling.
- Block the 3–5 client pilot until **a real device** installs from `https://beamguinee.com/travel/`, opens without address bar, preserves the OTP session and generates both the factual PDF and photo booklet.
- Never make private Netlify previews public merely to test installation.

## Release decision

**No production mutation until** fresh-schema replay CI is green; staging↔canonical review is approved; lawyers review privacy and seven-day photo backups; restore/deletion benches pass; production credentials and e-mail are isolated; and the real production-domain PWA acceptance test succeeds.
