import { adminClient } from "../_shared/travel-deletion.ts";

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
  const [deletions, runs] = await Promise.all([
    client.rpc("count_stuck_deletions"),
    client.rpc("count_stale_deletion_retry_runs"),
  ]);
  if (deletions.error || runs.error) {
    return Response.json({ ok: false, error: "MONITOR_QUERY_FAILED" }, { status: 500 });
  }
  const stuck = Number(deletions.data);
  const staleRuns = Number(runs.data);
  const healthy = stuck === 0 && staleRuns === 0;
  return Response.json({ ok: healthy, stuck, stale_runs: staleRuns }, { status: healthy ? 200 : 503 });
});
