// BEAM Travel History — destructive "disposable victim" bench (STAGING ONLY)
//
// Exercises the full deletion protocol (travel/supabase/DELETION_PROTOCOL.md) against
// staging with throwaway accounts created for this run only:
//   delete_photo (+ retry), delete_trip with >=2 photos (+ retry), cross-owner IDs,
//   synthetic trip interruption + resume with >100 objects (pagination),
//   owned object outside the user prefix -> account deletion refused, deleting=true kept,
//   resume -> full account deletion, then replay of the pre-deletion JWT.
//
// Required env (this script only; never exposed to the browser or another step):
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, STAGING_SERVICE_ROLE_KEY, TEST_A_EMAIL
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
for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "STAGING_SERVICE_ROLE_KEY", "TEST_A_EMAIL"]) {
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
    const { error: lockErr } = await admin.from("trips").update({ deleting: true }).eq("id", t3);
    if (lockErr) throw new Error(`SYNTHETIC_LOCK_FAILED ${lockErr.message}`);
    const { error: partErr } = await admin.storage.from(BUCKET).remove(paths.slice(0, 20));
    if (partErr) throw new Error(`SYNTHETIC_PARTIAL_REMOVE_FAILED ${partErr.message}`);
    check((await listAll(prefix)).length === 110, "110 objects remain (>100, two list pages)");
    // While locked, the owner cannot add a file to this trip.
    const { error: lockedUpload } = await victim.client.storage.from(BUCKET)
      .upload(`${prefix}/${crypto.randomUUID()}.webp`, webp(), { contentType: "image/webp", upsert: false });
    check(!!lockedUpload, "upload into a trip being deleted is refused");
    const r = await callDelete(victim.token, { action: "delete_trip", trip_id: t3 });
    check(r.status === 200 && r.body.ok === true, "resumed delete_trip succeeds", JSON.stringify(r));
    check((await listAll(prefix)).length === 0, "resumed delete_trip: all 110 objects removed (pagination)");
    check(await rowCount("trips", "id", t3) === 0, "resumed delete_trip: trip row absent");
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
  {
    const r = await callDelete(oldToken, { action: "delete_account", confirmation: "SUPPRIMER" });
    check(
      r.status >= 400 && String(r.body.error ?? "").startsWith("OWNED_OBJECTS_REMAIN"),
      "account deletion refused while an owned object remains",
      JSON.stringify(r),
    );
    check(await userExists(victim.id), "Auth user still exists after refused deletion");
    const { data: prof } = await admin.from("profiles").select("deleting,deletion_requested_at").eq("id", victim.id)
      .single();
    check(prof?.deleting === true && !!prof?.deletion_requested_at, "profile stays deleting=true with first request date");
    check((await listAll(victim.id)).length === 0, "victim prefix already empty after first attempt");
    // Locked account: the old session can no longer upload.
    const { error: lockedUp } = await victim.client.storage.from(BUCKET)
      .upload(`${victim.id}/${t4}/${crypto.randomUUID()}.webp`, webp(), { contentType: "image/webp", upsert: false });
    check(!!lockedUp, "upload refused while account is deleting");
    // Resolve the blocker, then resume.
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
