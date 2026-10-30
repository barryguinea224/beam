// BEAM Travel History — destructive "disposable victim" bench (STAGING ONLY)
//
// Exercises the full deletion protocol (travel/supabase/DELETION_PROTOCOL.md) against
// staging with throwaway accounts created for this run only:
//   delete_photo (+ retry), delete_trip with >=2 photos (+ retry), cross-owner IDs,
//   synthetic trip interruption resumed by the protected retry worker with >100 objects,
//   expired claimed lease + automatic recovery, 10-minute backoff and unauthorized retry denial,
//   synthetic account interruption (locked + partially cleaned) and DB/Storage writes refused
//   while deleting, owned object outside the user prefix -> account deletion refused,
//   deleting=true and first request date kept, resume -> full deletion, then replay of the
//   pre-deletion JWT.
//
// Required env (this script only; never exposed to the browser or another step):
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, STAGING_SERVICE_ROLE_KEY, TEST_A_EMAIL,
//   STAGING_TRAVEL_RETRY_SECRET (staging-destructive environment only)
// Optional: GITHUB_RUN_ID (names the run's accounts).
//
// Safety rules:
//   - Refuses to run unless TEST_A_EMAIL is the dedicated CI identity (+ci-a).
//   - Only accounts whose e-mail matches <base>+ci-victim-* / <base>+ci-bystander-* are
//     ever created, swept or deleted. +ci-a / +ci-b / manual accounts are never touched.
//   - Never prints a key, password, access token or e-mail address.
//   - Cleanup runs in `finally` and fails the job if it cannot complete.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.75.0";

const env = Deno.env.toObject();
for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "STAGING_SERVICE_ROLE_KEY", "TEST_A_EMAIL",
  "STAGING_TRAVEL_RETRY_SECRET"]) {
  if (!env[k]) throw new Error(`Missing ${k}`);
}
const ciA = /^([^+@\s]+)\+ci-a@([^@\s]+)$/i.exec(env.TEST_A_EMAIL.trim());
if (!ciA) throw new Error("TEST_A_EMAIL must be the dedicated CI identity (+ci-a); refusing to run");
const [, LOCAL, DOMAIN] = ciA;
const RUN = (env.GITHUB_RUN_ID || "local") + "-" + crypto.randomUUID().slice(0, 8);
const DISPOSABLE = new RegExp(
  `^${LOCAL.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c)}\\+ci-(victim|bystander)-[a-z0-9-]+@${
    DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c)
  }$`,
  "i",
);
const disposableEmail = (role: "victim" | "bystander") => `${LOCAL}+ci-${role}-${RUN}@${DOMAIN}`.toLowerCase();

const URL_ = env.SUPABASE_URL.replace(/\/$/, "");
const PUB = env.SUPABASE_PUBLISHABLE_KEY;
const RETRY_SECRET = env.STAGING_TRAVEL_RETRY_SECRET;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, env.STAGING_SERVICE_ROLE_KEY, opts);
const userClient = () => createClient(URL_, PUB, opts);
const BUCKET = "media";
const ORPHAN_ROOT = "ci-orphans";
const SWEEP_AGE_MS = 60 * 60 * 1000;
const TINY_WEBP = Uint8Array.from(
  atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=="),
  (c) => c.charCodeAt(0),
);
const webp = () => new Blob([TINY_WEBP], { type: "image/webp" });

let passed = 0;
const pass = (label: string) => {
  passed++;
  console.log("PASS", label);
};
const fail = (label: string, detail = ""): never => {
  throw new Error(`FAIL ${label}${detail ? " | " + detail : ""}`);
};
const check = (cond: unknown, label: string, detail = "") => (cond ? pass(label) : fail(label, detail));

type Row = Record<string, unknown>;
type Actor = { id: string; client: SupabaseClient; token: string };

// ---------- helpers ----------
async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0;; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`LIST_FAILED ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const p = `${prefix}/${r.name}`;
      if (r.id) out.push(p);
      else out.push(...await listAll(p));
    }
    if (rows.length < 100) return out;
  }
}
async function removeAll(prefix: string) {
  for (let round = 0; round < 5; round++) {
    const paths = await listAll(prefix);
    if (!paths.length) return;
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`REMOVE_FAILED ${error.message}`);
    }
  }
  if ((await listAll(prefix)).length) throw new Error(`PREFIX_NOT_EMPTY ${prefix.replace(/[0-9a-f-]{36}/g, "<id>")}`);
}
async function countOwned(uid: string): Promise<number> {
  const { data, error } = await admin.rpc("count_owned_storage_objects", { uid });
  if (error) throw new Error(`COUNT_OWNED_FAILED ${error.message}`);
  return Number(data);
}
async function rowCount(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`COUNT_${table}_FAILED ${error.message}`);
  return count ?? 0;
}
async function userExists(uid: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(uid);
  if (error) return false;
  return !!data?.user;
}
async function callDelete(token: string, body: Row): Promise<{ status: number; body: Row }> {
  const r = await fetch(`${URL_}/functions/v1/travel-delete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, apikey: PUB, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: Row = {};
  try {
    parsed = await r.json() as Row;
  } catch { /* empty */ }
  return { status: r.status, body: parsed };
}
// Retry must never discover any pre-existing in-progress account/trip in shared staging.
// This is a preflight safety check, not a substitute for a truly isolated staging project.
async function assertIsolatedDeletions(allowedUserIds: string[]) {
  for (const table of ["profiles", "trips"] as const) {
    const { data, error, count } = await admin.from(table)
      .select(table === "trips" ? "id,user_id" : "id", { count: "exact" })
      .eq("deleting", true);
    if (error) throw new Error(`RETRY_ISOLATION_CHECK_FAILED_${table}: ${error.message}`);
    // Fail closed if PostgREST truncated the result set; never silently omit another user.
    if (count !== (data ?? []).length) {
      throw new Error("REFUSING retry dispatch: cannot enumerate all staging deletions");
    }
    const rows = (data ?? []) as unknown as Row[];
    if (rows.some((r) => !allowedUserIds.includes(String(table === "trips" ? r.user_id : r.id)))) {
      throw new Error("REFUSING retry dispatch: another staging user has a deletion in progress");
    }
  }
}
async function callRetry(secret?: string): Promise<{ status: number; body: Row }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-travel-retry-secret"] = secret;
  const r = await fetch(`${URL_}/functions/v1/travel-deletion-retry`, {
    method: "POST",
    headers,
    body: "{}",
  });
  let body: Row = {};
  try { body = await r.json() as Row; } catch { /* non-JSON 401 is expected */ }
  return { status: r.status, body };
}
async function waitForCompletedRun(runId: string): Promise<Row> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const { data, error } = await admin.rpc("get_deletion_retry_run", { p_run_id: runId });
    if (error) throw new Error(`RETRY_RECEIPT_READ_FAILED: ${error.message}`);
    const row = (data as Row[] | null)?.[0];
    if (row?.status === "failed") fail("worker run failed", String(row.error_code ?? "UNKNOWN"));
    if (row?.status === "completed") {
      check(!!row.finished_at, "worker run has a committed completion timestamp");
      return row;
    }
    if (row && row.status !== "running") fail("unexpected retry run state");
    if (Date.now() >= deadline) fail("worker run completion receipt timed out");
    await new Promise((resolve) => setTimeout(resolve, 1250));
  }
}
async function dispatchRetry(allowedUserIds: string[]): Promise<Row> {
  await assertIsolatedDeletions(allowedUserIds);
  const reply = await callRetry(RETRY_SECRET);
  check(reply.status === 202 && typeof reply.body.run_id === "string",
    "authorized retry dispatch acknowledged with a run id", `status ${reply.status}`);
  return await waitForCompletedRun(reply.body.run_id as string);
}
function checkRunCounts(row: Row, claimed: number, started: number, succeeded: number, failed: number, label: string) {
  check(row.claimed === claimed && row.started === started &&
    row.destructive_succeeded === succeeded && row.destructive_failed === failed, label,
    JSON.stringify({ claimed: row.claimed, started: row.started,
      succeeded: row.destructive_succeeded, failed: row.destructive_failed }));
}
async function createActor(role: "victim" | "bystander"): Promise<Actor> {
  const email = disposableEmail(role);
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`CREATE_${role.toUpperCase()}_FAILED ${error?.message}`);
  const client = userClient();
  const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new Error(`LOGIN_${role.toUpperCase()}_FAILED ${e?.message}`);
  console.log(`Created and signed in disposable ${role}`);
  return { id: data.user.id, client, token: s.session.access_token };
}
async function newTrip(a: Actor, entry: string, exit: string): Promise<string> {
  const { data, error } = await a.client.from("trips").insert({
    country_code: "SN",
    cities: ["Dakar"],
    entry_date: entry,
    exit_date: exit,
    purpose: "autre",
    note: "ci-victim-bench",
  }).select("id").single();
  if (error || !data) throw new Error(`TRIP_INSERT_FAILED ${error?.message}`);
  return data.id as string;
}
async function addPhoto(a: Actor, tripId: string): Promise<{ mediaId: string; path: string }> {
  const path = `${a.id}/${tripId}/${crypto.randomUUID()}.webp`;
  const { error: upErr } = await a.client.storage.from(BUCKET).upload(path, webp(), {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "60",
  });
  if (upErr) throw new Error(`UPLOAD_FAILED ${upErr.message}`);
  const { data, error } = await a.client.from("media").insert({ trip_id: tripId, storage_path: path, kind: "photo" })
    .select("id").single();
  if (error || !data) throw new Error(`MEDIA_INSERT_FAILED ${error?.message}`);
  return { mediaId: data.id as string, path };
}
async function objectPresent(path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  return (await listAll(path.slice(0, i))).includes(path);
}
// Destroys one disposable account completely. Only ever called with ids of accounts whose
// e-mail matches DISPOSABLE (checked here again as a last line of defence).
async function destroyDisposable(uid: string) {
  const { data, error } = await admin.auth.admin.getUserById(uid);
  if (error || !data?.user) return; // already gone
  if (!DISPOSABLE.test(data.user.email ?? "")) throw new Error("REFUSING to destroy a non-disposable account");
  await removeAll(uid);
  await removeAll(`${ORPHAN_ROOT}/${uid}`);
  const owned = await countOwned(uid);
  if (owned !== 0) throw new Error(`CLEANUP_OWNED_OBJECTS_REMAIN ${owned}`);
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) throw new Error(`CLEANUP_AUTH_DELETE_FAILED ${delErr.message}`);
}

// ---------- sweep: disposable accounts left by earlier failed runs ----------
async function sweep() {
  let swept = 0;
  for (let page = 1;; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`LIST_USERS_FAILED ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (!DISPOSABLE.test(u.email ?? "")) continue;
      if (Date.now() - Date.parse(u.created_at) < SWEEP_AGE_MS) continue;
      await destroyDisposable(u.id);
      swept++;
    }
    if (users.length < 200) break;
  }
  console.log(`Sweep: removed ${swept} stale disposable account(s) older than 1 h`);
}

// ---------- the bench ----------
const created: string[] = [];
let benchError: unknown = null;
try {
  await sweep();
  // Abort before any worker call if staging has unrelated in-progress deletions.
  await assertIsolatedDeletions([]);
  const victim = await createActor("victim");
  created.push(victim.id);
  const bystander = await createActor("bystander");
  created.push(bystander.id);
  check(victim.id !== bystander.id, "victim and bystander are distinct accounts");

  // Fixtures (distinct past dates: no_overlap is per user)
  const t1 = await newTrip(victim, "2020-01-01", "2020-01-05"); // trip with 2 photos
  const t2 = await newTrip(victim, "2020-02-01", "2020-02-05"); // single-photo deletion
  const t3 = await newTrip(victim, "2020-03-01", "2020-03-05"); // >100 objects + interruption
  const t4 = await newTrip(victim, "2020-04-01", "2020-04-05"); // source of the out-of-prefix owned object
  const p1a = await addPhoto(victim, t1);
  const p1b = await addPhoto(victim, t1);
  const p2 = await addPhoto(victim, t2);
  const tb = await newTrip(bystander, "2020-01-01", "2020-01-05");
  const pb = await addPhoto(bystander, tb);
  pass("fixtures created through the normal client path (RLS, Storage policies)");

  // The worker is privileged but MUST refuse calls without its dedicated staging secret.
  check((await callRetry()).status === 401, "retry endpoint rejects a request without a secret");
  check((await callRetry("invalid-" + crypto.randomUUID())).status === 401,
    "retry endpoint rejects an incorrect secret");

  // 1. Cross-owner IDs: the victim targets the bystander's photo and trip.
  {
    const r1 = await callDelete(victim.token, { action: "delete_photo", media_id: pb.mediaId });
    const r2 = await callDelete(victim.token, { action: "delete_trip", trip_id: tb });
    check(r1.status === 200 && r1.body.already_absent === true, "cross-owner delete_photo resolves nothing", JSON.stringify(r1));
    check(r2.status === 200 && r2.body.already_absent === true, "cross-owner delete_trip resolves nothing", JSON.stringify(r2));
    check(await objectPresent(pb.path), "bystander object still present");
    check(await rowCount("media", "id", pb.mediaId) === 1, "bystander media row intact");
    const { data: btrip } = await admin.from("trips").select("deleting").eq("id", tb).single();
    check(btrip && btrip.deleting === false, "bystander trip not locked");
  }

  // 2. delete_photo + retry
  {
    const r = await callDelete(victim.token, { action: "delete_photo", media_id: p2.mediaId });
    check(r.status === 200 && r.body.ok === true, "delete_photo succeeds", JSON.stringify(r));
    check(!await objectPresent(p2.path), "delete_photo: object absent");
    check(await rowCount("media", "id", p2.mediaId) === 0, "delete_photo: media row absent");
    const again = await callDelete(victim.token, { action: "delete_photo", media_id: p2.mediaId });
    check(again.status === 200 && again.body.already_absent === true, "delete_photo retry is idempotent", JSON.stringify(again));
  }

  // 3. delete_trip with 2 photos + retry
  {
    const r = await callDelete(victim.token, { action: "delete_trip", trip_id: t1 });
    check(r.status === 200 && r.body.ok === true, "delete_trip (2 photos) succeeds", JSON.stringify(r));
    check((await listAll(`${victim.id}/${t1}`)).length === 0, "delete_trip: trip prefix empty");
    check(await rowCount("trips", "id", t1) === 0, "delete_trip: trip row absent");
    check(
      await rowCount("media", "id", p1a.mediaId) + await rowCount("media", "id", p1b.mediaId) === 0,
      "delete_trip: media rows cascaded",
    );
    const again = await callDelete(victim.token, { action: "delete_trip", trip_id: t1 });
    check(again.status === 200 && again.body.already_absent === true, "delete_trip retry is idempotent", JSON.stringify(again));
  }

  // 4. Synthetic interruption of a trip deletion, with >100 objects (pagination)
  {
    const prefix = `${victim.id}/${t3}`;
    const paths = Array.from({ length: 130 }, () => `${prefix}/${crypto.randomUUID()}.webp`);
    for (let i = 0; i < paths.length; i += 10) {
      await Promise.all(paths.slice(i, i + 10).map(async (p) => {
        const { error } = await admin.storage.from(BUCKET).upload(p, webp(), { contentType: "image/webp", upsert: false });
        if (error) throw new Error(`BULK_UPLOAD_FAILED ${error.message}`);
      }));
    }
    check((await listAll(prefix)).length === 130, "130 objects present before synthetic interruption");
    // State an interrupted delete_trip would leave behind: locked + partially cleaned.
    const { error: lockErr } = await admin.from("trips").update({
      deleting: true,
      deletion_requested_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    }).eq("id", t3).eq("user_id", victim.id);
    if (lockErr) throw new Error(`SYNTHETIC_LOCK_FAILED ${lockErr.message}`);
    const { error: partErr } = await admin.storage.from(BUCKET).remove(paths.slice(0, 20));
    if (partErr) throw new Error(`SYNTHETIC_PARTIAL_REMOVE_FAILED ${partErr.message}`);
    check((await listAll(prefix)).length === 110, "110 objects remain (>100, two list pages)");
    // While locked, the owner cannot add a file to this trip.
    const { error: lockedUpload } = await victim.client.storage.from(BUCKET)
      .upload(`${prefix}/${crypto.randomUUID()}.webp`, webp(), { contentType: "image/webp", upsert: false });
    check(!!lockedUpload, "upload into a trip being deleted is refused");
    const run = await dispatchRetry(created);
    checkRunCounts(run, 1, 1, 1, 0, "stale interrupted trip is processed by the worker");
    check(await rowCount("trips", "id", t3) === 0, "worker resumes and deletes interrupted stale trip");
    check((await listAll(prefix)).length === 0, "worker resumed delete_trip: all 110 objects removed");
  }

  // 4b. The worker must not process a live lease. Once the disposable fixture's
  // deadline is aged past the DB clock, it must reclaim with a new token and finish.
  {
    const leasedTrip = await newTrip(bystander, "2020-05-01", "2020-05-04");
    const leasedPhoto = await addPhoto(bystander, leasedTrip);
    const { error: markError } = await admin.from("trips").update({
      deleting: true,
      deletion_requested_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    }).eq("id", leasedTrip).eq("user_id", bystander.id);
    if (markError) throw new Error(`LEASE_FIXTURE_FAILED: ${markError.message}`);
    await assertIsolatedDeletions(created);
    const { data: claims, error: claimError } = await admin.rpc("claim_stale_deletions", {
      batch_size: 5,
      lease_minutes: 10,
    });
    if (claimError) throw new Error(`LEASE_CLAIM_FAILED: ${claimError.message}`);
    check((claims ?? []).length === 1 && claims[0].subject_kind === "trip" &&
      claims[0].subject_id === leasedTrip, "lease fixture reserved exclusively by the admin");
    const firstToken = claims![0].claim_token as string;
    const blockedRun = await dispatchRetry(created);
    checkRunCounts(blockedRun, 0, 0, 0, 0,
      "completed worker run skipped the actively leased trip");
    const { data: before, error: beforeError } = await admin.from("trips")
      .select("deletion_attempts,deletion_claim_token").eq("id", leasedTrip).single();
    if (beforeError) throw beforeError;
    check(before?.deletion_attempts === 0 && before?.deletion_claim_token === firstToken,
      "live lease blocks worker and consumes zero attempts");
    // Admin-only time travel. The client can modify neither of these lease columns.
    const { error: expiryError } = await admin.from("trips").update({
      deletion_claimed_until: new Date(Date.now() - 60_000).toISOString(),
    }).eq("id", leasedTrip).eq("user_id", bystander.id);
    if (expiryError) throw new Error(`LEASE_EXPIRY_FIXTURE_FAILED: ${expiryError.message}`);
    const resumedRun = await dispatchRetry(created);
    checkRunCounts(resumedRun, 1, 1, 1, 0,
      "worker runs the formerly leased trip once");
    check(await rowCount("trips", "id", leasedTrip) === 0,
      "worker reclaims the expired lease and finishes deletion");
    check(!await objectPresent(leasedPhoto.path), "reclaimed lease: object removed");
  }

  // 5. Owned object outside the user prefix -> account deletion must be refused
  const orphanPath = `${ORPHAN_ROOT}/${victim.id}/${crypto.randomUUID()}.webp`;
  {
    const src = `${victim.id}/${t4}/${crypto.randomUUID()}.webp`;
    const { error: upErr } = await victim.client.storage.from(BUCKET).upload(src, webp(), {
      contentType: "image/webp",
      upsert: false,
    });
    if (upErr) throw new Error(`ORPHAN_SOURCE_UPLOAD_FAILED ${upErr.message}`);
    const { error: mvErr } = await admin.storage.from(BUCKET).move(src, orphanPath);
    if (mvErr) throw new Error(`ORPHAN_MOVE_FAILED ${mvErr.message}`);
    // Fixture validity: the moved object must still be owned by the victim, otherwise this
    // scenario would pass for the wrong reason.
    check(await countOwned(victim.id) >= 1, "fixture valid: victim owns an object outside its prefix");
  }

  const oldToken = victim.token; // captured BEFORE any account deletion

  // 5b. Synthetic interruption of an account deletion: the state a crashed delete_account
  //     would leave behind (locked, partially cleaned), built BEFORE the first real call.
  //     Fresh authentication must not be required to resume an already-locked deletion.
  const SYNTHETIC_FIRST_REQUEST = "2020-06-01T00:00:00.000Z";
  {
    const extra: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = `${victim.id}/${t4}/${crypto.randomUUID()}.webp`;
      const { error } = await victim.client.storage.from(BUCKET).upload(p, webp(), {
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw new Error(`ACCOUNT_FIXTURE_UPLOAD_FAILED ${error.message}`);
      extra.push(p);
    }
    const { error: lockErr } = await admin.from("profiles")
      .update({ deleting: true, deletion_requested_at: SYNTHETIC_FIRST_REQUEST }).eq("id", victim.id);
    if (lockErr) throw new Error(`SYNTHETIC_ACCOUNT_LOCK_FAILED ${lockErr.message}`);
    const { error: partErr } = await admin.storage.from(BUCKET).remove([extra[0]]);
    if (partErr) throw new Error(`SYNTHETIC_ACCOUNT_PARTIAL_REMOVE_FAILED ${partErr.message}`);
    check((await listAll(victim.id)).length === 2, "synthetic account state: locked, 2 of 3 files left");
  }

  // 5c. While the account is deleting=true, the still-valid session must not write
  //     anywhere: Storage (already guarded) AND the database (trips, activities, media).
  {
    const { error: up } = await victim.client.storage.from(BUCKET)
      .upload(`${victim.id}/${t4}/${crypto.randomUUID()}.webp`, webp(), { contentType: "image/webp", upsert: false });
    check(!!up, "deleting account: Storage upload refused");

    const { data: tIns, error: tInsErr } = await victim.client.from("trips").insert({
      country_code: "SN",
      cities: ["Dakar"],
      entry_date: "2019-03-01",
      exit_date: "2019-03-02",
      purpose: "autre",
    }).select("id");
    check(!!tInsErr && !(tIns ?? []).length, "deleting account: trip INSERT refused", tInsErr?.message ?? "inserted");

    const { data: tUpd } = await victim.client.from("trips").update({ note: "written-while-deleting" })
      .eq("id", t4).select("id");
    const { data: t4Row } = await admin.from("trips").select("note").eq("id", t4).single();
    check(!(tUpd ?? []).length && t4Row?.note !== "written-while-deleting", "deleting account: trip UPDATE refused");

    const { data: aIns, error: aInsErr } = await victim.client.from("activities").insert({
      trip_id: t4,
      kind: "lieu",
      title: "written-while-deleting",
    }).select("id");
    check(!!aInsErr && !(aIns ?? []).length, "deleting account: activity INSERT refused", aInsErr?.message ?? "inserted");

    const { data: mIns, error: mInsErr } = await victim.client.from("media").insert({
      trip_id: t4,
      storage_path: `${victim.id}/${t4}/${crypto.randomUUID()}.webp`,
      kind: "photo",
    }).select("id");
    check(!!mInsErr && !(mIns ?? []).length, "deleting account: media INSERT refused", mInsErr?.message ?? "inserted");
  }

  // 5d. Real worker failure/backoff with the deliberately retained owned orphan.
  // We advance only a test fixture's timestamps; the worker must still make decisions
  // using the database clock and its production claim/start procedures.
  {
    const failedRun = await dispatchRetry(created);
    checkRunCounts(failedRun, 1, 1, 0, 1,
      "account retry ran and recorded one destructive failure");
    const { data: firstFailure, error: firstError } = await admin.from("profiles")
      .select("deletion_attempts,deletion_last_error,deletion_claim_token").eq("id", victim.id).single();
    if (firstError) throw firstError;
    check(firstFailure?.deletion_attempts === 1 && firstFailure?.deletion_last_error === "OWNED_OBJECTS_REMAIN" &&
      firstFailure?.deletion_claim_token === null,
      "worker starts first account retry and persists destructive failure");
    check(await userExists(victim.id), "failed worker retry leaves the disposable account present");
    const coolingRun = await dispatchRetry(created);
    checkRunCounts(coolingRun, 0, 0, 0, 0,
      "completed worker run respected backoff without starting a claim");
    const { data: cooling, error: coolingError } = await admin.from("profiles")
      .select("deletion_attempts,deletion_last_error").eq("id", victim.id).single();
    if (coolingError) throw coolingError;
    check(cooling?.deletion_attempts === 1 && cooling?.deletion_last_error === "OWNED_OBJECTS_REMAIN",
      "worker respects 10-minute backoff without a second attempt");
    // SQL-level eligibility probe also proves the claim predicate refuses an early attempt.
    const { data: earlyClaims, error: earlyError } = await admin.rpc("claim_stale_deletions", {
      batch_size: 5,
      lease_minutes: 10,
    });
    if (earlyError) throw new Error(`EARLY_CLAIM_CHECK_FAILED: ${earlyError.message}`);
    check(!(earlyClaims ?? []).some((c: Row) => c.subject_id === victim.id),
      "backoff predicate prevents an immediate account claim");
    const { error: ageError } = await admin.from("profiles").update({
      deletion_last_attempt_at: new Date(Date.now() - 11 * 60_000).toISOString(),
    }).eq("id", victim.id);
    if (ageError) throw new Error(`BACKOFF_AGING_FAILED: ${ageError.message}`);
    const agedRun = await dispatchRetry(created);
    checkRunCounts(agedRun, 1, 1, 0, 1,
      "worker retries account once after simulated backoff");
    const { data: secondFailure, error: secondError } = await admin.from("profiles")
      .select("deletion_attempts,deletion_last_error,deletion_claim_token").eq("id", victim.id).single();
    if (secondError) throw secondError;
    check(secondFailure?.deletion_attempts === 2 && secondFailure?.deletion_last_error === "OWNED_OBJECTS_REMAIN" &&
      secondFailure?.deletion_claim_token === null,
      "worker retries after simulated backoff elapsed");

    // The original authenticated manual resume remains valid despite failed worker attempts.
    const r = await callDelete(oldToken, { action: "delete_account", confirmation: "SUPPRIMER" });
    check(r.status !== 403, "resume does not require fresh authentication", JSON.stringify(r));
    check(
      r.status >= 400 && String(r.body.error ?? "").startsWith("OWNED_OBJECTS_REMAIN"),
      "account deletion refused while an owned object remains",
      JSON.stringify(r),
    );
    check(await userExists(victim.id), "Auth user still exists after refused deletion");
    const { data: prof } = await admin.from("profiles").select("deleting,deletion_requested_at").eq("id", victim.id)
      .single();
    check(prof?.deleting === true, "profile stays deleting=true");
    check(
      !!prof?.deletion_requested_at && Date.parse(String(prof.deletion_requested_at)) === Date.parse(SYNTHETIC_FIRST_REQUEST),
      "first deletion request date preserved across retries",
    );
    check((await listAll(victim.id)).length === 0, "resumed cleanup emptied the remaining files of the prefix");

    // Resolve the blocker, then resume again.
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([orphanPath]);
    if (rmErr) throw new Error(`ORPHAN_REMOVE_FAILED ${rmErr.message}`);
    const resumed = await callDelete(oldToken, { action: "delete_account", confirmation: "SUPPRIMER" });
    check(resumed.status === 200 && resumed.body.account_deleted === true, "resumed account deletion succeeds", JSON.stringify(resumed));
  }

  // 6. Post-deletion state
  {
    check(!await userExists(victim.id), "Auth user deleted");
    check(await rowCount("profiles", "id", victim.id) === 0, "profile cascaded");
    check(await rowCount("trips", "user_id", victim.id) === 0, "trips cascaded");
    check(await rowCount("media", "user_id", victim.id) === 0, "media cascaded");
    check((await listAll(victim.id)).length === 0, "victim prefix empty");
    check(await countOwned(victim.id) === 0, "no object owned by the deleted user anywhere in the bucket");
  }

  // 7. Replay of the JWT captured before deletion
  {
    const h = { authorization: `Bearer ${oldToken}`, apikey: PUB, "content-type": "application/json" };
    const dbWrite = await fetch(`${URL_}/rest/v1/trips`, {
      method: "POST",
      headers: { ...h, prefer: "return=representation" },
      body: JSON.stringify({
        country_code: "SN",
        cities: ["Dakar"],
        entry_date: "2019-01-01",
        exit_date: "2019-01-02",
        purpose: "autre",
      }),
    });
    await dbWrite.body?.cancel();
    check(dbWrite.status >= 400, "old JWT: DB insert refused", `status ${dbWrite.status}`);
    check(await rowCount("trips", "user_id", victim.id) === 0, "old JWT: no trip recreated");

    const ghost = `${victim.id}/${t4}/${crypto.randomUUID()}.webp`;
    const stWrite = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${ghost}`, {
      method: "POST",
      headers: { authorization: `Bearer ${oldToken}`, apikey: PUB, "content-type": "image/webp", "x-upsert": "false" },
      body: TINY_WEBP,
    });
    await stWrite.body?.cancel();
    check(stWrite.status >= 400, "old JWT: Storage insert refused", `status ${stWrite.status}`);
    check((await listAll(victim.id)).length === 0, "old JWT: no ghost file in victim prefix");
    check(await countOwned(victim.id) === 0, "old JWT: no ghost object owned anywhere");

    const fn = await callDelete(oldToken, { action: "delete_account", confirmation: "SUPPRIMER" });
    check(fn.status === 401, "old JWT: deletion endpoint answers 401 after completed deletion", `status ${fn.status}`);
  }

  console.log(`VICTIM BENCH PASSED (${passed} assertions)`);
} catch (e) {
  benchError = e;
  console.error(e instanceof Error ? e.message : String(e));
} finally {
  let cleanupError: unknown = null;
  for (const uid of created) {
    try {
      await destroyDisposable(uid);
    } catch (e) {
      cleanupError = e;
      console.error("CLEANUP FAILED:", e instanceof Error ? e.message : String(e));
    }
  }
  if (!cleanupError) console.log("CLEANUP PASS: disposable accounts and their objects removed");
  if (benchError || cleanupError) Deno.exit(1);
}
