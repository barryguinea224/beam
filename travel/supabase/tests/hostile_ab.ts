// BEAM Travel History — hostile A/B staging test
// Secrets stay in local environment variables. Never commit credentials.
// Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_A_EMAIL,
// TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env = Deno.env.toObject();
const required = ["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","TEST_A_EMAIL","TEST_A_PASSWORD","TEST_B_EMAIL","TEST_B_PASSWORD"];
for (const k of required) if (!env[k]) throw new Error(`Missing ${k}`);

const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false }
});
const A=client(), B=client();
const login=async(label,c,email,password)=>{
  console.log(`${label} email trim mismatch:`, email!==email.trim() ? "yes" : "no");
  console.log(`${label} password trim mismatch:`, password!==password.trim() ? "yes" : "no");
  const {data,error}=await c.auth.signInWithPassword({email,password});
  if(error) throw new Error(`LOGIN_${label}_FAILED: ${error.message}`);
  console.log(`LOGIN_${label}_PASS`);
  return data.session;
};
const expectDenied=(label,error)=>{
  if(!error) throw new Error(`SECURITY REGRESSION: ${label} unexpectedly succeeded`);
  console.log("PASS denied:",label);
};

const sa=await login("A",A,env.TEST_A_EMAIL,env.TEST_A_PASSWORD);
const sb=await login("B",B,env.TEST_B_EMAIL,env.TEST_B_PASSWORD);
console.log("Authenticated A/B with real JWTs",sa.user.id,sb.user.id);

const original={user_id:sa.user.id,country_code:"GN",cities:"Conakry",entry_date:"2026-01-01",exit_date:"2026-01-02",purpose:"Autre",note:"A-original-note"};
let ta;
try {
const {data:created,error:ea}=await A.from("trips").insert(original).select().single();
ta=created;
if(ea) throw ea;

const {data:seenByB,error:readErr}=await B.from("trips").select("*").eq("id",ta.id);
if(readErr) throw readErr;
if(seenByB.length) throw new Error("SECURITY REGRESSION: B can read A trip");
console.log("PASS B cannot read A trip");

const {data:changedByB,error:updateErr}=await B.from("trips").update({cities:"ATTACK"}).eq("id",ta.id).select();
if(updateErr) console.log("PASS B update rejected");
else if(changedByB.length) throw new Error("SECURITY REGRESSION: B modified A trip");
else console.log("PASS B update affected zero rows");

const {data:afterUpdate,error:afterUpdateErr}=await A.from("trips").select("id,cities,entry_date,exit_date,note").eq("id",ta.id).single();
if(afterUpdateErr) throw afterUpdateErr;
if(afterUpdate.cities!==original.cities || afterUpdate.entry_date!==original.entry_date || afterUpdate.exit_date!==original.exit_date || afterUpdate.note!==original.note)
  throw new Error("SECURITY REGRESSION: A trip changed after B update attempt");
console.log("PASS A trip intact after B update attempt");

const {data:deletedByB,error:deleteErr}=await B.from("trips").delete().eq("id",ta.id).select();
if(deleteErr) console.log("PASS B delete rejected");
else if(deletedByB.length) throw new Error("SECURITY REGRESSION: B deleted A trip");
else console.log("PASS B delete affected zero rows");

const {data:afterDelete,error:afterDeleteErr}=await A.from("trips").select("id,cities,entry_date,exit_date,note").eq("id",ta.id).single();
if(afterDeleteErr) throw afterDeleteErr;
if(afterDelete.cities!==original.cities || afterDelete.entry_date!==original.entry_date || afterDelete.exit_date!==original.exit_date || afterDelete.note!==original.note)
  throw new Error("SECURITY REGRESSION: A trip missing or changed after B delete attempt");
console.log("PASS A trip intact after B delete attempt");

const {error:foreignInsert}=await B.from("trips").insert({...original,user_id:sa.user.id});
expectDenied("B inserts trip with user_id=A",foreignInsert);

const {error:reserved}=await A.from("profiles").update({deleting:false}).eq("id",sa.user.id);
expectDenied("A updates profiles.deleting",reserved);

console.log("BASE RLS TESTS PASSED");
console.log("Next phase: Storage upload/cross-user/upsert + retained-JWT deletion replay.");
} finally {
  if (ta?.id) {
    const {error:cleanupError}=await A.from("trips").delete().eq("id",ta.id);
    if (cleanupError) console.error("CLEANUP FAILED:",cleanupError.message);
    else console.log("CLEANUP PASS: A test trip removed");
  }
  await A.auth.signOut();
  await B.auth.signOut();
}
