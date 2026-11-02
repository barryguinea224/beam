# BTH optional avatar — deployment gate

**STOP: GitHub's automatic staging hostile A/B bench expects this SQL and the
new `travel-delete` actions; it must not be used as proof of avatar coverage
until STAGING has been migrated and the Edge Function deployed.**

## Staging (do not touch production)

1. Review `travel/supabase/migrations/20261102150000_travel_avatar_row_first.sql`. Run its **entire** contents once using the **STAGING** Supabase SQL Editor (single transaction); no secret.
2. Verify `public.profiles.avatar_id` exists, `public.avatar_media` has owner-only SELECT/INSERT and **no authenticated UPDATE/DELETE**, and that authenticated lacks column UPDATE on `profiles.avatar_id`. Verify Storage INSERT for reserved `<uid>/profile/<uuid>.webp` only.
3. Deploy the reviewed `travel-delete` Edge Function **on staging only** so `activate_avatar` and `delete_avatar` exist. It uses the existing server-side configuration; no GitHub service-role key.
4. **Only after 1–3**, rerun hostile A/B on staging, then test with a real phone and a test user: add, replace, remove, sign out, expired read-only, and account deletion. Confirm no object remains under `<uid>/`.

## Production (separate explicit approval)

1. Freeze reviewed commit after staging success.
2. Back up and review `profiles`, Storage policies and the SQL; execute **the same exact migration** in the **PRODUCTION** SQL Editor as one transaction.
3. Deploy updated `travel-delete` on PRODUCTION **before** deploying the new frontend, then merge and deploy the PWA; bump cache `v17`. Check one test account with consent, signed URL expiry and no orphan files.
4. Confirm the deletion retry worker uses the shared `deleteAccountForUser` sweep of the entire `<uid>/` prefix, including `profile/`; no new cron credentials or schedule.

Never run staging migration against production by accident. The migration is additive and does not touch existing traveler data, travel-media paths, PDF or booklet.
