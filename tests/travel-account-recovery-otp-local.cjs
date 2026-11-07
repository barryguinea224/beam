"use strict";
// REAL local GoTrue login after account recovery. Example.com fixtures only.
// Local Docker Supabase; no hosted calls, no keys in source or console output.
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const uid="ab700000-0000-4000-8000-000000000001";
const identity="ab710000-0000-4000-8000-000000000001";
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
 const inbox=local(cfg.INBUCKET_URL||"http://127.0.0.1:54324");
 if(!cfg.ANON_KEY)throw Error("Local CLI ANON_KEY absent (not logged)");
 return {api,inbox,key:cfg.ANON_KEY};
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
 const response=await fetch(local(inbox+"/api/v1/mailbox/"+encodeURIComponent(name)),
   {signal:AbortSignal.timeout(6000)});
 // Inbucket returns 404 when a mailbox has never received a message.
 if(response.status===404)return [];
 if(!response.ok)throw Error("Local mailbox listing HTTP "+response.status);
 return response.json();
}
async function otp(api,key,email){
 const res=await fetch(api+"/auth/v1/otp",{
  method:"POST",headers:{"Content-Type":"application/json",apikey:key},
  body:JSON.stringify({email,create_user:false}),signal:AbortSignal.timeout(7000)
 });
 return {ok:res.ok,status:res.status,code:res.ok?"":(await res.text()).slice(0,260)};
}
async function receive(inbox,name){
 for(let i=0;i<24;i++){
  const items=await mailbox(inbox,name);
  if(Array.isArray(items)&&items.length){
   const id=items[0].id;
   if(id)return json(inbox+"/api/v1/mailbox/"+encodeURIComponent(name)+"/"+encodeURIComponent(id));
  }
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error("No local GoTrue email delivered to "+name+" mailbox");
}
async function main(){
 const {api,inbox,key}=loadCLI();
 db("insert into auth.users(id,email,email_confirmed_at,instance_id,aud,role,raw_app_meta_data) values ('"+uid+"','"+oldEmail+"',now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',jsonb_build_object('provider','email','providers',jsonb_build_array('email')));"+
 "insert into auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at) "+
 "values('"+identity+"','"+uid+"','email','"+uid+"',"+
 "jsonb_build_object('sub','"+uid+"','email','"+oldEmail+"','email_verified',true),now(),now());"+
 "update public.profiles set display_name='Client fictif',access_until=current_date+30 where id='"+uid+"';"+
 "select private.beam_change_client_email('"+oldEmail+"','"+newEmail+"',"+
 "'Vérifié en agence avec CNI et deux voyages fictifs.');");
 try{
  assert.equal((await mailbox(inbox,"recuperation-ancien")).length,0);
  await otp(api,key,oldEmail);
  // HTTP response for unknown emails may deliberately be neutral.
  assert.equal((await mailbox(inbox,"recuperation-ancien")).length,0,
   "Old email unexpectedly received OTP");
  const next=await otp(api,key,newEmail);
  assert.ok(next.ok,"GoTrue refused new email OTP request: "+next.status+" "+next.code);
  const letter=await receive(inbox,"recuperation-nouveau");
  const body=[letter.body?.text,letter.body?.html,letter.text,letter.html,letter.body]
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
  db("delete from private.account_email_changes where user_id='"+uid+"';"+
     "delete from auth.users where id='"+uid+"';");
 }
}
main().catch(err=>{console.error("Local account recovery login failed:",err.message);process.exitCode=1});
