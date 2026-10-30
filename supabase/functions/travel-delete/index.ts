import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import {
  adminClient,
  deleteAccountForUser,
  deletePhotoForUser,
  deleteTripForUser,
} from "../_shared/travel-deletion.ts";

type Action =
  | { action: "delete_photo"; media_id: string }
  | { action: "delete_trip"; trip_id: string }
  | { action: "delete_account"; confirmation: "SUPPRIMER" };

const ALLOWED_ORIGINS = new Set([
  "https://beamguinee.com",
  "https://www.beamguinee.com",
  "https://deploy-preview-3--inquisitive-boba-e06b58.netlify.app",
]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "vary": "Origin",
  } : {};
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json" } });

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
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(req) });
  }
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await caller(req);
    const body = await req.json() as Action;
    const admin = adminClient();

    if (body.action === "delete_photo") {
      return json(req, await deletePhotoForUser(admin, user.id, body.media_id));
    }

    if (body.action === "delete_trip") {
      return json(req, await deleteTripForUser(admin, user.id, body.trip_id));
    }

    if (body.action === "delete_account") {
      if (body.confirmation !== "SUPPRIMER") return json(req, { error: "CONFIRMATION_REQUIRED" }, 400);

      const { data: profile, error } = await admin.from("profiles")
        .select("id,deleting").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (!profile) return json(req, { error: "PROFILE_NOT_FOUND" }, 409);

      // Recent authentication is required only to START deletion.
      // Retries after the durable deleting=true barrier remain possible.
      if (!profile.deleting) {
        const signedInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
        if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 10 * 60 * 1000) {
          return json(req, { error: "RECENT_AUTH_REQUIRED" }, 403);
        }
      }

      return json(req, await deleteAccountForUser(admin, user.id));
    }

    return json(req, { error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return json(req, { error: message }, message === "UNAUTHENTICATED" ? 401 : 500);
  }
});
