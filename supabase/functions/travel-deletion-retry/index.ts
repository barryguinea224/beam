import {
  adminClient,
  deleteAccountForUser,
  deleteTripForUser,
} from "../_shared/travel-deletion.ts";

type Work = { subject_kind: "account" | "trip"; subject_id: string; user_id: string };

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function errorCode(e: unknown): string {
  const raw = e instanceof Error ? e.message : "UNKNOWN_ERROR";
  const code = raw.split(":")[0].replace(/[^A-Z0-9_]/g, "_").slice(0, 80);
  return code || "UNKNOWN_ERROR";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("METHOD_NOT_ALLOWED", { status: 405 });

  const expected = Deno.env.get("TRAVEL_RETRY_SECRET") || "";
  const supplied = req.headers.get("x-travel-retry-secret") || "";
  if (!expected || !supplied || !await sameSecret(expected, supplied)) {
    return new Response("UNAUTHORIZED", { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_stale_deletions", {
    batch_size: 20,
    lease_minutes: 10,
  });
  if (error) {
    console.error("retry claim failed", errorCode(error));
    return Response.json({ ok: false, error: "CLAIM_FAILED" }, { status: 500 });
  }

  const work = (data || []) as Work[];
  let succeeded = 0;
  let failed = 0;

  for (const item of work) {
    try {
      if (item.subject_kind === "account") {
        await deleteAccountForUser(admin, item.user_id);
      } else {
        await deleteTripForUser(admin, item.user_id, item.subject_id);
      }

      const { error: logError } = await admin.rpc("record_deletion_retry_result", {
        p_subject_kind: item.subject_kind,
        p_subject_id: item.subject_id,
        p_user_id: item.user_id,
        p_success: true,
        p_error_code: null,
      });
      if (logError) throw new Error("RESULT_LOG_FAILED");
      succeeded++;
    } catch (e) {
      const code = errorCode(e);
      const { error: recordError } = await admin.rpc("record_deletion_retry_result", {
        p_subject_kind: item.subject_kind,
        p_subject_id: item.subject_id,
        p_user_id: item.user_id,
        p_success: false,
        p_error_code: code,
      });
      if (recordError) console.error("retry failure could not be persisted", item.subject_kind, "RESULT_LOG_FAILED");
      else console.error("retry item failed", item.subject_kind, code);
      failed++;
    }
  }

  console.log("travel deletion retry finished", { claimed: work.length, succeeded, failed });
  return Response.json({ ok: failed === 0, claimed: work.length, succeeded, failed }, {
    status: failed === 0 ? 200 : 207,
  });
});
