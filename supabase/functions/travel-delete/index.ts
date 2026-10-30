import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Action =
  | { action: "delete_photo"; media_id: string }
  | { action: "delete_trip"; trip_id: string }
  | { action: "delete_account"; confirmation: "SUPPRIMER" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secret = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Server configuration unavailable");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function caller(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = auth.slice(7);
  const url = Deno.env.get("SUPABASE_URL")!;
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const publishable = keys.default || Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHENTICATED");
  return { user: data.user, token };
}

async function listAll(admin: ReturnType<typeof adminClient>, prefix: string): Promise<string[]> {
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
      else files.push(...await listAll(admin, path)); // folder: recurse, including orphan trip folders
    }
    if (rows.length < limit) break;
    offset += rows.length;
  }
  return files;
}
async function removeAndVerify(admin: ReturnType<typeof adminClient>, prefix: string) {
  for (;;) {
    const paths = await listAll(admin, prefix);
    if (!paths.length) return;
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await admin.storage.from("media").remove(batch);
      if (error) throw new Error(`STORAGE_REMOVE_FAILED:${error.message}`);
    }
    const remaining = await listAll(admin, prefix);
    if (!remaining.length) return;
    throw new Error(`STORAGE_NOT_EMPTY:${remaining.length}`);
  }
}

async function objectExists(admin: ReturnType<typeof adminClient>, storagePath: string) {
  const parts = storagePath.split("/");
  const name = parts.pop()!;
  const prefix = parts.join("/");
  const all = await listAll(admin, prefix);
  return all.includes(`${prefix}/${name}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { user } = await caller(req);
    const body = await req.json() as Action;
    const admin = adminClient();

    if (body.action === "delete_photo") {
      const { data: media, error } = await admin.from("media")
        .select("id,user_id,storage_path").eq("id", body.media_id).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!media) return json({ ok: true, already_absent: true });

      const { error: removeError } = await admin.storage.from("media").remove([media.storage_path]);
      if (removeError) throw new Error(`STORAGE_REMOVE_FAILED:${removeError.message}`);
      if (await objectExists(admin, media.storage_path)) throw new Error("STORAGE_VERIFY_FAILED");

      const { error: dbError } = await admin.from("media").delete().eq("id", media.id).eq("user_id", user.id);
      if (dbError) throw dbError;
      return json({ ok: true });
    }

    if (body.action === "delete_trip") {
      const { data: trip, error } = await admin.from("trips")
        .select("id,user_id").eq("id", body.trip_id).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!trip) return json({ ok: true, already_absent: true });

      const prefix = `${user.id}/${trip.id}`;
      await removeAndVerify(admin, prefix);
      const { error: dbError } = await admin.from("trips").delete().eq("id", trip.id).eq("user_id", user.id);
      if (dbError) throw dbError;
      return json({ ok: true });
    }

    if (body.action === "delete_account") {
      if (body.confirmation !== "SUPPRIMER") return json({ error: "CONFIRMATION_REQUIRED" }, 400);

      // Barrier first. From this point the old JWT cannot write/read/delete Storage through RLS.
      const { data: marked, error: markError } = await admin.from("profiles")
        .update({ deleting: true, deletion_requested_at: new Date().toISOString() })
        .eq("id", user.id).select("id,deleting").maybeSingle();
      if (markError) throw markError;
      if (!marked) return json({ error: "PROFILE_NOT_FOUND" }, 409);

      const prefix = user.id;
      await removeAndVerify(admin, prefix);

      // Storage is verified empty before Auth deletion. DB children then cascade from auth.users.
      const { error: authError } = await admin.auth.admin.deleteUser(user.id);
      if (authError) throw new Error(`AUTH_DELETE_FAILED:${authError.message}`);
      return json({ ok: true, account_deleted: true });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return json({ error: message }, status);
  }
});
