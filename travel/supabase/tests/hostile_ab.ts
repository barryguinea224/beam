// BEAM Travel History — hostile A/B staging test
// Secrets stay in local environment variables. Never commit credentials.
// Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_A_EMAIL,
// TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ACTIVITY_KINDS } from "../../constants.js";

const TEST_ACTIVITY_KIND = ACTIVITY_KINDS[0];
if (!TEST_ACTIVITY_KIND) throw new Error("No allowed activity kind configured");

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

const original={user_id:sa.user.id,country_code:"GN",cities:["Conakry"],entry_date:"2026-01-01",exit_date:"2026-01-02",purpose:"autre",note:"A-original-note"};
let ta,tb;
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

const {data:afterUpdate,error:afterUpdateErr}=await A.from("trips").select("id,cities,entry_date,exit_date,purpose,note,updated_at").eq("id",ta.id).single();
if(afterUpdateErr) throw afterUpdateErr;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const diffs=[];
for (const field of ["cities","entry_date","exit_date","purpose","note"]) {
  if (!same(afterUpdate[field],original[field])) diffs.push({field,before:original[field],after:afterUpdate[field]});
}
if (afterUpdate.updated_at!==ta.updated_at) diffs.push({field:"updated_at",before:ta.updated_at,after:afterUpdate.updated_at});
if (diffs.length) {
  console.error("A trip differences after B update attempt:",JSON.stringify(diffs));
  throw new Error("SECURITY REGRESSION: A trip changed after B update attempt: "+diffs.map(x=>x.field).join(", "));
}
console.log("PASS A trip intact after B update attempt; updated_at unchanged");

const {data:deletedByB,error:deleteErr}=await B.from("trips").delete().eq("id",ta.id).select();
if(deleteErr) console.log("PASS B delete rejected");
else if(deletedByB.length) throw new Error("SECURITY REGRESSION: B deleted A trip");
else console.log("PASS B delete affected zero rows");

const {data:afterDelete,error:afterDeleteErr}=await A.from("trips").select("id,cities,entry_date,exit_date,purpose,note,updated_at").eq("id",ta.id).single();
if(afterDeleteErr) throw afterDeleteErr;
const deleteDiffs=[];
for (const field of ["cities","entry_date","exit_date","purpose","note"]) {
  if (!same(afterDelete[field],original[field])) deleteDiffs.push({field,before:original[field],after:afterDelete[field]});
}
if (afterDelete.updated_at!==ta.updated_at) deleteDiffs.push({field:"updated_at",before:ta.updated_at,after:afterDelete.updated_at});
if (deleteDiffs.length) {
  console.error("A trip differences after B delete attempt:",JSON.stringify(deleteDiffs));
  throw new Error("SECURITY REGRESSION: A trip changed after B delete attempt: "+deleteDiffs.map(x=>x.field).join(", "));
}
console.log("PASS A trip intact after B delete attempt; updated_at unchanged");

const {error:foreignInsert}=await B.from("trips").insert({...original,user_id:sa.user.id});
expectDenied("B inserts trip with user_id=A",foreignInsert);

const {error:reserved}=await A.from("profiles").update({deleting:false}).eq("id",sa.user.id);
expectDenied("A updates profiles.deleting",reserved);

// Relational integrity: a B-owned child must never attach to A's trip.
const bTrip={user_id:sb.user.id,country_code:"SN",cities:["Dakar"],entry_date:"2025-01-01",exit_date:"2025-01-02",purpose:"autre",note:"B-owner-fixture"};
const {data:createdB,error:eb}=await B.from("trips").insert(bTrip).select().single();
if(eb) throw eb;
tb=createdB;

const {error:foreignMediaInsert}=await B.from("media").insert({
  trip_id:ta.id,user_id:sb.user.id,storage_path:`${sb.user.id}/hostile/foreign-insert.webp`,kind:"photo"
});
expectDenied("B inserts own media attached to A trip",foreignMediaInsert);

const {error:foreignActivityInsert}=await B.from("activities").insert({
  trip_id:ta.id,user_id:sb.user.id,kind:TEST_ACTIVITY_KIND,title:"Hostile insert"
});
expectDenied("B inserts own activity attached to A trip",foreignActivityInsert);

const {data:bMedia,error:bMediaErr}=await B.from("media").insert({
  trip_id:tb.id,user_id:sb.user.id,storage_path:`${sb.user.id}/hostile/own.webp`,kind:"photo"
}).select().single();
if(bMediaErr) throw bMediaErr;
const {data:movedMedia,error:movedMediaErr}=await B.from("media").update({trip_id:ta.id}).eq("id",bMedia.id).select();
expectDenied("B moves own media to A trip",movedMediaErr);
const {data:bMediaAfter,error:bMediaAfterErr}=await B.from("media").select("id,trip_id").eq("id",bMedia.id).single();
if(bMediaAfterErr) throw bMediaAfterErr;
if(bMediaAfter.trip_id!==tb.id) throw new Error("SECURITY REGRESSION: B media trip_id changed after denied move");
console.log("PASS B media remains attached to B trip");

const {data:bActivity,error:bActivityErr}=await B.from("activities").insert({
  trip_id:tb.id,user_id:sb.user.id,kind:TEST_ACTIVITY_KIND,title:"B own activity"
}).select().single();
if(bActivityErr) throw bActivityErr;
const {data:movedActivity,error:movedActivityErr}=await B.from("activities").update({trip_id:ta.id}).eq("id",bActivity.id).select();
expectDenied("B moves own activity to A trip",movedActivityErr);
const {data:bActivityAfter,error:bActivityAfterErr}=await B.from("activities").select("id,trip_id").eq("id",bActivity.id).single();
if(bActivityAfterErr) throw bActivityAfterErr;
if(bActivityAfter.trip_id!==tb.id) throw new Error("SECURITY REGRESSION: B activity trip_id changed after denied move");
console.log("PASS B activity remains attached to B trip");

console.log("BASE RLS + RELATIONAL INTEGRITY TESTS PASSED");
console.log("BASE RLS + RELATIONAL INTEGRITY TESTS PASSED");

// Storage hostile bench. Use random technical names only.
const bucketA=A.storage.from("media"), bucketB=B.storage.from("media");
const storageId=crypto.randomUUID();
const storagePath=\`\${sa.user.id}/\${ta.id}/\${storageId}.webp\`;
const tinyWebp=Uint8Array.from(atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=="),c=>c.charCodeAt(0));
const blob=(bytes,type)=>new Blob([bytes],{type});
let storageUploaded=false;
try {
  const {error:uploadErr}=await bucketA.upload(storagePath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",upsert:false});
  if(uploadErr) throw new Error("LEGITIMATE STORAGE UPLOAD FAILED: "+uploadErr.message);
  storageUploaded=true;
  if(!storagePath.startsWith(`${sa.user.id}/${ta.id}/`) || !/\/[0-9a-f-]{36}\.webp$/i.test(storagePath))
    throw new Error("SECURITY REGRESSION: storage path is not <user>/<trip>/<uuid>.webp");
  console.log("PASS A legitimate WebP upload; random technical path");

  const {data:aDownload,error:aDownloadErr}=await bucketA.download(storagePath);
  if(aDownloadErr||!aDownload) throw new Error("A cannot download own object");
  console.log("PASS A can download own private object");

  const {data:bDownload,error:bDownloadErr}=await bucketB.download(storagePath);
  if(!bDownloadErr && bDownload) throw new Error("SECURITY REGRESSION: B downloaded A object");
  console.log("PASS B cannot directly download A object");

  const {data:bSigned,error:bSignedErr}=await bucketB.createSignedUrl(storagePath,60);
  if(!bSignedErr && bSigned?.signedUrl) throw new Error("SECURITY REGRESSION: B created signed URL for A object");
  console.log("PASS B cannot create signed URL for A object");

  const {data:publicData}=bucketB.getPublicUrl(storagePath);
  const publicResp=await fetch(publicData.publicUrl,{redirect:"manual"});
  if(publicResp.ok) throw new Error("SECURITY REGRESSION: private object served through public URL");
  console.log("PASS public URL does not serve private A object");

  const {data:bList,error:bListErr}=await bucketB.list(sa.user.id,{limit:100});
  if(bListErr) console.log("PASS B list of A folder rejected");
  else if((bList??[]).length) throw new Error("SECURITY REGRESSION: B can list names in A folder");
  else console.log("PASS B list of A folder is empty");

  for (const hostilePath of [
    \`\${sb.user.id}/../\${sa.user.id}/\${crypto.randomUUID()}.webp\`,
    \`\${sa.user.id}/\${crypto.randomUUID()}.webp\`,
    \`/\${sa.user.id}/\${crypto.randomUUID()}.webp\`
  ]) {
    const {error}=await bucketB.upload(hostilePath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",upsert:false});
    expectDenied("B hostile/cross-owner path "+hostilePath.replaceAll(sa.user.id,"<A>").replaceAll(sb.user.id,"<B>"),error);
  }

  const {error:upsertOwn}=await bucketA.upload(storagePath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",upsert:true});
  expectDenied("A cannot overwrite existing object with upsert:true",upsertOwn);

  const elevenMiB=new Uint8Array(11*1024*1024);
  const {error:largeErr}=await bucketA.upload(\`\${sa.user.id}/\${ta.id}/\${crypto.randomUUID()}.webp\`,blob(elevenMiB,"image/webp"),{contentType:"image/webp",upsert:false});
  expectDenied("11 MiB object rejected by bucket limit",largeErr);

  for (const [ext,mime] of [["svg","image/svg+xml"],["html","text/html"]]) {
    const bytes=new TextEncoder().encode(ext==="svg"?"<svg xmlns='http://www.w3.org/2000/svg'></svg>":"<html></html>");
    const {error}=await bucketA.upload(\`\${sa.user.id}/\${ta.id}/\${crypto.randomUUID()}.\${ext}\`,blob(bytes,mime),{contentType:mime,upsert:false});
    expectDenied(\`\${mime} rejected by bucket MIME allowlist\`,error);
  }

  console.log("STORAGE HOSTILE TESTS PASSED");
} finally {
  if(storageUploaded){
    const {error:removeErr}=await bucketA.remove([storagePath]);
    if(removeErr) console.error("STORAGE CLEANUP FAILED:",removeErr.message);
    else {
      const {data:afterRemove,error:afterRemoveErr}=await bucketA.download(storagePath);
      if(!afterRemoveErr && afterRemove) throw new Error("SECURITY REGRESSION: Storage object still downloadable after removal");
      console.log("CLEANUP PASS: A Storage test object removed and no longer downloadable");
    }
  }
}
console.log("Next phase: Storage upload/cross-user/upsert + retained-JWT deletion replay.");
} finally {
  if (tb?.id) {
    const {error:cleanupBError}=await B.from("trips").delete().eq("id",tb.id);
    if (cleanupBError) console.error("CLEANUP B FAILED:",cleanupBError.message);
    else console.log("CLEANUP PASS: B test trip and children removed");
  }
  if (ta?.id) {
    const {error:cleanupError}=await A.from("trips").delete().eq("id",ta.id);
    if (cleanupError) console.error("CLEANUP FAILED:",cleanupError.message);
    else console.log("CLEANUP PASS: A test trip removed");
  }
  await A.auth.signOut();
  await B.auth.signOut();
}
