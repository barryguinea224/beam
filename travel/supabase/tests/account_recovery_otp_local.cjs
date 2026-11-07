"use strict";
// REAL local GoTrue login after account recovery. Example.com fixtures only.
// Local Docker Supabase; no hosted calls, no keys in source or console output.
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
let uid=null;
const oldEmail="recuperation-ancien@example.com",newEmail="recuperation-nouveau@example.com";
function local(url){
 const target=new URL(url);
 if(!["localhost","127.0.0.1","::1","[::1]"].includes(target.hostname)||
   target.protocol!=="http:")throw Error("Refusing non-loopback service");
 return target.toString().replace(/\/$/,"");
}
function loadCLI(){
 const raw=execFileSync("supabase",["status","-o","env"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 const cfg={};
 for(const line of raw.split(/\r?\n/)){
  const match=line.match(/^([A-Z_]+)=(.*)$/);
  if(match)cfg[match[1]]=match[2].replace(/^["']|["']$/g,"");
 }
 const api=local(cfg.API_URL||"http://127.0.0.1:54321");
 const inbox=local(cfg.MAILPIT_URL||cfg.INBUCKET_URL||"http://127.0.0.1:54324");
 if(!cfg.ANON_KEY||!cfg.SERVICE_ROLE_KEY)throw Error("Local CLI keys absent (not logged)");
 return {api,inbox,key:cfg.ANON_KEY,admin:cfg.SERVICE_ROLE_KEY};
}
function db(sql){
 if(process.env.PGHOST!=="127.0.0.1"||process.env.PGPORT!=="54322"||
    process.env.SUPABASE_ACCESS_TOKEN)throw Error("Only disposable local Supabase permitted");
 return execFileSync("psql",["-X","-Atq","-v","ON_ERROR_STOP=1"],{
  input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"],
  env:{...process.env,PGSSLMODE:"disable"}
 }).trim();
}
async function json(url){
 const r=await fetch(local(url),{signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error("Local mail API HTTP "+r.status);
 return r.json();
}
async function mailbox(inbox,name){
 // Supabase CLI >=2.108 runs Mailpit, not the old Mailpit API.
 // Mailpit lists all captured local messages at /api/v1/messages and
 // message bodies at /api/v1/message/:ID. Only fixture email addresses.
 const listing=await json(inbox+"/api/v1/messages?limit=50");
 if(!Array.isArray(listing.messages))throw Error("Unexpected local Mailpit API response");
 const address=name.toLowerCase()+"@example.com";
 return listing.messages.filter(message=>Array.isArray(message.To)&&
  message.To.some(to=>String(to.Address||"").toLowerCase()===address));
}
async function otp(api,key,email){
 const res=await fetch(api+"/auth/v1/otp",{
  method:"POST",headers:{"Content-Type":"application/json",apikey:key},
  body:JSON.stringify({email,create_user:false}),signal:AbortSignal.timeout(7000)
 });
 return {ok:res.ok,status:res.status,code:res.ok?"":(await res.text()).slice(0,260)};
}
async function receive(inbox,name){
 for(let i=0;i<32;i++){
  const items=await mailbox(inbox,name);
  if(items.length){
   const id=items[0].ID;
   if(id)return json(inbox+"/api/v1/message/"+encodeURIComponent(id));
  }
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error("No local GoTrue email delivered to "+name+" in Mailpit");
}
async function main(){
 const {api,inbox,key,admin}=loadCLI();
 try{
  // Provision a truly valid Auth user via the local Admin API, as BEAM does.
  const created=await fetch(api+"/auth/v1/admin/users",{
   method:"POST",
   headers:{apikey:admin,Authorization:"Bearer "+admin,"Content-Type":"application/json"},
   body:JSON.stringify({email:oldEmail,email_confirm:true,
    user_metadata:{display_name:"Client fictif"}}),
   signal:AbortSignal.timeout(7000)
  });
  if(!created.ok)throw Error("Local GoTrue Admin creation HTTP "+created.status);
  uid=(await created.json()).id;
  assert.match(uid,/^[0-9a-f-]{36}$/i);
  db("update public.profiles set access_until=current_date+30 where id='"+uid+"';"+
     "select private.beam_change_client_email('"+oldEmail+"','"+newEmail+"',"+
     "'Vérifié en agence avec CNI et deux voyages fictifs.');");
  assert.equal((await mailbox(inbox,"recuperation-ancien")).length,0);
  await otp(api,key,oldEmail);
  // HTTP response for unknown emails may deliberately be neutral.
  assert.equal((await mailbox(inbox,"recuperation-ancien")).length,0,
   "Old email unexpectedly received OTP");
  const next=await otp(api,key,newEmail);
  assert.ok(next.ok,"GoTrue refused new email OTP request: "+next.status+" "+next.code);
  const letter=await receive(inbox,"recuperation-nouveau");
  const body=[letter.Text,letter.HTML]
   .filter(Boolean).map(x=>typeof x==="string"?x:JSON.stringify(x)).join("\n")
   .replaceAll("&amp;","&");
  const match=body.match(/https?:\/\/(?:localhost|127\.0\.0\.1):54321\/auth\/v1\/verify\?[^\s<>"')]+/);
  assert.ok(match,"GoTrue email did not include a local verification link");
  const url=new URL(match[0].replace(/[.,;]$/,""));
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  const res=await fetch(url.toString(),{redirect:"manual",signal:AbortSignal.timeout(7000)});
  assert.ok([302,303].includes(res.status),"GoTrue did not verify new email magic link");
  const redirect=new URL(res.headers.get("location")||"",api);
  const tokens=new URLSearchParams(redirect.hash.replace(/^#/,""));
  const access=tokens.get("access_token");
  assert.ok(access,"Recovered email did not produce an authenticated JWT");
  const result=await fetch(api+"/auth/v1/user",{
   headers:{apikey:key,Authorization:"Bearer "+access},signal:AbortSignal.timeout(7000)
  });
  assert.equal(result.status,200,"Recovered email JWT was rejected");
  const user=await result.json();
  assert.equal(user.id,uid,"Auth identity changed despite preserving UUID");
  assert.equal(user.email,newEmail);
  const audit=db("select count(*) from private.account_email_changes "+
   "where user_id='"+uid+"' and old_email='"+oldEmail+"' and new_email='"+newEmail+"'");
  assert.equal(audit,"1");
  console.log("PASS GoTrue local: old email refused, new email OTP delivered and JWT login keeps same UUID");
 }finally{
  if(uid)db("delete from private.account_email_changes where user_id='"+uid+"';"+
     "delete from auth.users where id='"+uid+"';");
 }
}
main().catch(err=>{console.error("Local account recovery login failed:",err.message);process.exitCode=1});
