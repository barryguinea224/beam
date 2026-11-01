// STAGING ONLY. Run under the protected staging-destructive GitHub environment.
// Attempts unknown-account OTP and direct /auth/v1/signup; cleans up even on regression.
// All disposable accounts are isolated with +ci-invite-only-<random> aliases.
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const env = Deno.env.toObject();
for(const key of ["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","STAGING_SERVICE_ROLE_KEY","TEST_A_EMAIL"]){
  if(!env[key]) throw new Error("Missing staging CI setting: " + key);
}
const url = env.SUPABASE_URL.replace(/\/$/,"");
if(new URL(url).hostname !== "coigbvhxywbmqgacmhzf.supabase.co"){
  throw new Error("REFUSING to test an unexpected Supabase project: staging allowlist mismatch");
}
const id = /^([^+@\s]+)\+ci-a@([^@\s]+)$/i.exec(env.TEST_A_EMAIL.trim());
if(!id) throw new Error("TEST_A_EMAIL must be the dedicated +ci-a staging identity");
const nonce = crypto.randomUUID().replace(/-/g,"").slice(0,16);
const unknownEmail = (id[1] + "+ci-invite-only-unknown-" + nonce + "@" + id[2]).toLowerCase();
const approvedEmail = (id[1] + "+ci-invite-only-approved-" + nonce + "@" + id[2]).toLowerCase();
const options = {auth:{persistSession:false,autoRefreshToken:false}};
const admin = createClient(url,env.STAGING_SERVICE_ROLE_KEY,options);
const browser = createClient(url,env.SUPABASE_PUBLISHABLE_KEY,options);
const owned = new Set([unknownEmail,approvedEmail]);

async function findUser(email:string){
  for(let page=1;page<=200;page++){
    const {data,error} = await admin.auth.admin.listUsers({page,perPage:200});
    if(error) throw new Error("Cannot inspect staging Auth users");
    const found = (data.users||[]).find(u=>u.email?.toLowerCase() === email);
    if(found) return found;
    if((data.users||[]).length<200) return null;
  }
  throw new Error("Exceeded staging Auth pagination safety limit");
}
async function cleanup(){
  const failures:string[] = [];
  for(const email of owned){
    try{
      const user = await findUser(email);
      if(!user) continue;
      if(user.email?.toLowerCase() !== email) throw new Error("Not a disposable identity");
      const {error}=await admin.auth.admin.deleteUser(user.id);
      if(error) throw new Error("Admin cleanup failed");
      if(await findUser(email)) throw new Error("Admin cleanup was not confirmed");
    }catch{failures.push("disposable account cleanup failed");}
  }
  if(failures.length) throw new Error("STAGING CLEANUP FAILED; inspect disposable CI accounts");
}
let failed:unknown;
try{
  if(await findUser(unknownEmail) || await findUser(approvedEmail))
    throw new Error("Unexpected disposable test identity collision");

  // UI can hide errors; only GoTrue server configuration can enforce refusal.
  const signUpResponse = await fetch(url+"/auth/v1/signup",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      apikey:env.SUPABASE_PUBLISHABLE_KEY,
      Authorization:"Bearer "+env.SUPABASE_PUBLISHABLE_KEY,
    },
    body:JSON.stringify({email:unknownEmail,password:crypto.randomUUID()+crypto.randomUUID()}),
  });
  const body = await signUpResponse.json().catch(()=>({}));
  if(signUpResponse.ok) throw new Error("SECURITY REGRESSION: direct public signup accepted");
  // A denial from an unrelated email/SMTP problem does NOT prove signup is disabled.
  const reason = String(body.code || "")+" "+String(body.msg || "")+" "+
    String(body.message || "")+" "+String(body.error_description || "")+" "+String(body.error || "");
  if(!/signup[_ -]?disabled|signups? (?:are )?not allowed|signups? (?:are )?disabled/i.test(reason))
    throw new Error("Signup did not return a recognizable server-side disabled-signup error");
  if(await findUser(unknownEmail))
    throw new Error("SECURITY REGRESSION: direct signup created an Auth account");
  console.log("PASS server rejects direct public signup");

  // The client may receive an error or an obfuscated response. Neither can create an account.
  await browser.auth.signInWithOtp({email:unknownEmail,options:{shouldCreateUser:false}});
  if(await findUser(unknownEmail))
    throw new Error("SECURITY REGRESSION: unknown OTP request created an Auth account");
  console.log("PASS unknown OTP request cannot create a user");

  // Admin provision remains functional even when public signup is disabled.
  // No password is created; the e-mail is confirmed for subsequent OTP sign-in.
  const {data, error} = await admin.auth.admin.createUser({email:approvedEmail,email_confirm:true});
  if(error || !data.user) throw new Error("Admin-only account creation failed");
  if(!(await findUser(approvedEmail))) throw new Error("Admin-created user not found");
  console.log("PASS admin account creation without password works");
  const otp = await browser.auth.signInWithOtp({email:approvedEmail,options:{shouldCreateUser:false}});
  if(otp.error) throw new Error("OTP login request denied for an admin-provisioned account");
  console.log("PASS an admin-provisioned account can request an OTP");
}catch(error){failed=error;}
try{await cleanup();}catch(error){failed=failed?new Error("Bench failed AND disposable cleanup failed"):error;}
if(failed)throw failed;
console.log("BEAM invite-only staging hostile Auth bench: PASS");
