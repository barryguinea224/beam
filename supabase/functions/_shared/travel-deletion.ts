import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

export type AdminClient = SupabaseClient;

export function adminClient(): AdminClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secret = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Server configuration unavailable");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function listAll(admin: AdminClient, prefix: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await admin.storage.from("media").list(prefix, {
      limit, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`STORAGE_LIST_FAILED:${error.message}`);
    const rows = data || [];
    for (const row of rows) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id) files.push(path);
      else files.push(...await listAll(admin, path));
    }
    if (rows.length < limit) break;
    offset += rows.length;
  }
  return files;
}

export async function removeAndVerify(admin: AdminClient, prefix: string): Promise<void> {
  const paths = await listAll(admin, prefix);
  if (!paths.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from("media").remove(paths.slice(i, i + 100));
    if (error) throw new Error(`STORAGE_REMOVE_FAILED:${error.message}`);
  }
  const remaining = await listAll(admin, prefix);
  if (remaining.length) throw new Error(`STORAGE_NOT_EMPTY:${remaining.length}`);
}

export async function objectExists(admin: AdminClient, storagePath: string): Promise<boolean> {
  const parts = storagePath.split("/");
  const name = parts.pop()!;
  const prefix = parts.join("/");
  const all = await listAll(admin, prefix);
  return all.includes(prefix ? `${prefix}/${name}` : name);
}

export async function deletePhotoForUser(admin: AdminClient, uid: string, mediaId: string) {
  const { data: media, error } = await admin.from("media")
    .select("id,user_id,storage_path").eq("id", mediaId).eq("user_id", uid).maybeSingle();
  if (error) throw error;
  if (!media) return { ok: true, already_absent: true };

  const { error: removeError } = await admin.storage.from("media").remove([media.storage_path]);
  if (removeError) throw new Error(`STORAGE_REMOVE_FAILED:${removeError.message}`);
  if (await objectExists(admin, media.storage_path)) throw new Error("STORAGE_VERIFY_FAILED");

  const { error: dbError } = await admin.from("media").delete().eq("id", media.id).eq("user_id", uid);
  if (dbError) throw dbError;
  return { ok: true };
}

export async function deleteTripForUser(admin: AdminClient, uid: string, tripId: string) {
  const { data: trip, error } = await admin.from("trips")
    .select("id,user_id,deleting,deletion_requested_at").eq("id", tripId).eq("user_id", uid).maybeSingle();
  if (error) throw error;
  if (!trip) return { ok: true, already_absent: true };

  const firstRequestedAt = trip.deletion_requested_at || new Date().toISOString();
  const { data: locked, error: lockError } = await admin.from("trips")
    .update({ deleting: true, deletion_requested_at: firstRequestedAt })
    .eq("id", trip.id).eq("user_id", uid).select("id").maybeSingle();
  if (lockError) throw lockError;
  if (!locked) throw new Error("TRIP_LOCK_FAILED");

  await removeAndVerify(admin, `${uid}/${trip.id}`);
  const { error: dbError } = await admin.from("trips").delete().eq("id", trip.id).eq("user_id", uid);
  if (dbError) throw dbError;
  return { ok: true };
}

export async function deleteAccountForUser(admin: AdminClient, uid: string) {
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,deleting,deletion_requested_at").eq("id", uid).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { ok: true, already_absent: true };

  const firstRequestedAt = profile.deletion_requested_at || new Date().toISOString();
  const { data: marked, error: markError } = await admin.from("profiles")
    .update({ deleting: true, deletion_requested_at: firstRequestedAt })
    .eq("id", uid).select("id").maybeSingle();
  if (markError) throw markError;
  if (!marked) throw new Error("PROFILE_NOT_FOUND");

  await removeAndVerify(admin, uid);

  const { data: ownedCount, error: ownedError } = await admin.rpc("count_owned_storage_objects", { uid });
  if (ownedError) throw new Error(`OWNED_OBJECTS_CHECK_FAILED:${ownedError.message}`);
  if (Number(ownedCount) !== 0) throw new Error(`OWNED_OBJECTS_REMAIN:${ownedCount}`);

  const { error: authError } = await admin.auth.admin.deleteUser(uid);
  if (authError) throw new Error(`AUTH_DELETE_FAILED:${authError.message}`);
  return { ok: true, account_deleted: true };
}
