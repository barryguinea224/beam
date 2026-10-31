import { adminClient } from "../_shared/travel-deletion.ts";
import { deletionHealth } from "../_shared/travel-deletion-health.ts";

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha,hb] = await Promise.all([
    crypto.subtle.digest("SHA-256",enc.encode(a)),
    crypto.subtle.digest("SHA-256",enc.encode(b)),
  ]);
  const aa=new Uint8Array(ha), bb=new Uint8Array(hb);
  let diff=0;
  for(let i=0;i<aa.length;i++) diff|=aa[i]^bb[i];
  return diff===0;
}

Deno.serve(async (req: Request) => {
  if (req.method!=="GET") return new Response("METHOD_NOT_ALLOWED",{status:405});
  const expected=Deno.env.get("TRAVEL_MONITOR_SECRET")||"";
  const supplied=req.headers.get("x-travel-monitor-secret")||"";
  if(!expected||!supplied||!await sameSecret(expected,supplied)) return new Response("UNAUTHORIZED",{status:401});

  const client = adminClient();
  const [deletions, runs, failures] = await Promise.all([
    client.rpc("count_stuck_deletions"),
    client.rpc("count_stale_deletion_retry_runs"),
    client.rpc("count_failed_deletion_retry_runs_24h"),
  ]);
  if (deletions.error || runs.error || failures.error) {
    return Response.json({ ok: false, error: "MONITOR_QUERY_FAILED" }, { status: 500 });
  }
  const raw = [deletions.data, runs.data, failures.data];
  const values = raw.map(Number);
  if (raw.some((value) => value == null) ||
      values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return Response.json({ ok: false, error: "MONITOR_QUERY_INVALID" }, { status: 500 });
  }
  const health = deletionHealth({
    stuck: values[0], stale_runs: values[1], failed_runs_24h: values[2],
  });
  return Response.json(health, { status: health.ok ? 200 : 503 });
});
