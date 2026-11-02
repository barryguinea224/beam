// BEAM Travel History — hostile A/B staging test
// Secrets stay in local environment variables. Never commit credentials.
// Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_A_EMAIL,
// TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD
// CI identities only: never reuse accounts used for manual/product testing.

import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { ACTIVITY_KINDS } from "../../constants.js";

const TEST_ACTIVITY_KIND = ACTIVITY_KINDS[0];
if (!TEST_ACTIVITY_KIND) throw new Error("No allowed activity kind configured");

const env = Deno.env.toObject();
const required = ["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","TEST_A_EMAIL","TEST_A_PASSWORD","TEST_B_EMAIL","TEST_B_PASSWORD"];
for (const k of required) if (!env[k]) throw new Error(`Missing ${k}`);
for (const k of ["TEST_A_EMAIL","TEST_B_EMAIL"]) if (!/\+ci-[ab]@/i.test(env[k])) throw new Error(`${k} must be a dedicated CI identity (+ci-a / +ci-b)`);

const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false }
});
const A=client(), B=client();
const login=async(label: string,c: ReturnType<typeof client>,email: string,password: string)=>{
  console.log(`${label} email trim mismatch:`, email!==email.trim() ? "yes" : "no");
  console.log(`${label} password trim mismatch:`, password!==password.trim() ? "yes" : "no");
  const {data,error}=await c.auth.signInWithPassword({email,password});
  if(error) throw new Error(`LOGIN_${label}_FAILED: ${error.message}`);
  console.log(`LOGIN_${label}_PASS`);
  return data.session;
};
const expectDenied=(label: string,error: { status?: number; code?: string; name?: string; message?: string } | null)=>{
  if(!error) throw new Error(`SECURITY REGRESSION: ${label} unexpectedly succeeded`);
  console.log("PASS denied:", label, "| status:", error.status ?? "n/a", "| code:", error.code ?? error.name ?? "n/a", "| message:", error.message ?? String(error));
};

const sa=await login("A",A,env.TEST_A_EMAIL,env.TEST_A_PASSWORD);
const sb=await login("B",B,env.TEST_B_EMAIL,env.TEST_B_PASSWORD);

// Preflight FIRST: these accounts already exist in staging. The database
// administrator sets access_until in the SQL Editor, never in this JWT bench.
// Do not modify a date here or attempt any write until BOTH pass the check.
const assertAccessValid=async(label:"A"|"B",c:ReturnType<typeof client>,uid:string)=>{
  const {data,error}=await c.from("profiles")
    .select("access_until").eq("id",uid).single();
  if(error||!data){
    throw new Error(`BANC A/B BLOQUÉ : impossible de lire access_until pour ${label}. Vérifiez la migration et les droits SELECT sur staging (aucune écriture de test lancée).`);
  }
  const until=data.access_until;
  const today=new Date().toISOString().slice(0,10);
  if(typeof until!=="string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(until) || until<today){
    throw new Error(`BANC A/B BLOQUÉ : date access_until absente ou expirée pour ${label}. Renouvelez son accès dans le SQL Editor staging avant de relancer le banc (aucune écriture de test lancée).`);
  }
  console.log(`PASS ${label} access_until valide (échéance : ${until})`);
};
await assertAccessValid("A",A,sa.user.id);
await assertAccessValid("B",B,sb.user.id);
console.log("Authenticated A/B with real JWTs; both access dates valid");

const original={user_id:sa.user.id,country_code:"GN",cities:["Conakry"],entry_date:"2026-01-01",exit_date:"2026-01-02",purpose:"autre",note:"A-original-note"};
let ta,tb,domesticTrip;
try {
const {data:created,error:ea}=await A.from("trips").insert(original).select().single();
ta=created;
if(ea) throw ea;

const {data:seenByB,error:readErr}=await B.from("trips").select("*").eq("id",ta.id);
if(readErr) throw readErr;
if(seenByB.length) throw new Error("SECURITY REGRESSION: B can read A trip");
console.log("PASS B cannot read A trip");

// PDF V1 must read an invoker-secured, server-filtered view, not the full journal.
const PDF_FIELDS="country_code,cities,entry_date,exit_date,duration_days,purpose";
const {data:ownPDF,error:pdfOwnErr}=await A.from("travel_history_pdf").select(PDF_FIELDS)
  .eq("user_id",sa.user.id).eq("entry_date",original.entry_date);
if(pdfOwnErr)throw new Error("PDF VIEW AUTHENTICATED SELECT FAILED: "+pdfOwnErr.message);
if(!ownPDF?.some(row=>row.country_code===original.country_code))
  throw new Error("PDF VIEW REGRESSION: own international trip absent");
const {data:foreignPDF,error:pdfForeignErr}=await B.from("travel_history_pdf").select(PDF_FIELDS)
  .eq("user_id",sa.user.id).eq("entry_date",original.entry_date);
if(pdfForeignErr)throw new Error("PDF VIEW FOREIGN READ ERROR: "+pdfForeignErr.message);
if(foreignPDF?.length)throw new Error("PRIVACY REGRESSION: B reads A's PDF travel history");
console.log("PASS PDF view permits owner, denies other JWT");

const {data:privateTrip,error:domesticInsertErr}=await A.from("trips").insert({
  ...original,entry_date:"2026-02-10",exit_date:"2026-02-12",
  note:"DOMESTIC_PRIVATE_NOTE_DO_NOT_EXPORT",is_domestic:true
}).select().single();
if(domesticInsertErr)throw new Error("PDF DOMESTIC FIXTURE FAILED: "+domesticInsertErr.message);
domesticTrip=privateTrip;
const {data:domesticPDF,error:domesticPDFError}=await A.from("travel_history_pdf").select(PDF_FIELDS)
  .eq("user_id",sa.user.id).eq("entry_date","2026-02-10");
if(domesticPDFError)throw new Error("PDF DOMESTIC VIEW CHECK FAILED: "+domesticPDFError.message);
if(domesticPDF?.length)throw new Error("PRIVACY REGRESSION: domestic trip exposed in PDF view");
console.log("PASS PDF view excludes domestic trip and private note");

const {data:changedByB,error:updateErr}=await B.from("trips").update({cities:"ATTACK"}).eq("id",ta.id).select();
if(updateErr) console.log("PASS B update rejected");
else if(changedByB.length) throw new Error("SECURITY REGRESSION: B modified A trip");
else console.log("PASS B update affected zero rows");

const {data:afterUpdate,error:afterUpdateErr}=await A.from("trips").select("id,cities,entry_date,exit_date,purpose,note,updated_at").eq("id",ta.id).single();
if(afterUpdateErr) throw afterUpdateErr;
const same=(a: unknown,b: unknown)=>JSON.stringify(a)===JSON.stringify(b);
const diffs=[];
for (const field of ["cities","entry_date","exit_date","purpose","note"] as const) {
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
for (const field of ["cities","entry_date","exit_date","purpose","note"] as const) {
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
  trip_id:ta.id,user_id:sb.user.id,storage_path:`${sb.user.id}/${ta.id}/${crypto.randomUUID()}.webp`,kind:"photo"
});
expectDenied("B inserts own media attached to A trip",foreignMediaInsert);

const {error:foreignActivityInsert}=await B.from("activities").insert({
  trip_id:ta.id,user_id:sb.user.id,kind:TEST_ACTIVITY_KIND,title:"Hostile insert"
});
expectDenied("B inserts own activity attached to A trip",foreignActivityInsert);

const {data:bMedia,error:bMediaErr}=await B.from("media").insert({
  trip_id:tb.id,user_id:sb.user.id,storage_path:`${sb.user.id}/${tb.id}/${crypto.randomUUID()}.webp`,kind:"photo"
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

// Storage hostile bench. Use random technical names only.
const bucketA=A.storage.from("media"), bucketB=B.storage.from("media");
const storageId=crypto.randomUUID();
const storagePath=`${sa.user.id}/${ta.id}/${storageId}.webp`;
const storageIdB=crypto.randomUUID();
const storagePathB=`${sb.user.id}/${tb.id}/${storageIdB}.webp`;
const tinyWebp=Uint8Array.from(atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=="),c=>c.charCodeAt(0));
const blob=(bytes: Uint8Array,type: string)=>new Blob([bytes.slice().buffer],{type});
let storageUploaded=false, storageUploadedB=false, signedBeforeDelete;
try {
  // Row-first contract: the server must see a matching, owner-scoped media row.
  const {error:reserveAErr}=await A.from("media").insert({
    id:storageId,trip_id:ta.id,user_id:sa.user.id,
    storage_path:storagePath,kind:"photo",bytes:tinyWebp.length
  });
  if(reserveAErr)throw new Error("LEGITIMATE A RESERVATION FAILED: "+reserveAErr.message);
  const {error:reserveBErr}=await B.from("media").insert({
    id:storageIdB,trip_id:tb.id,user_id:sb.user.id,
    storage_path:storagePathB,kind:"photo",bytes:tinyWebp.length
  });
  if(reserveBErr)throw new Error("LEGITIMATE B RESERVATION FAILED: "+reserveBErr.message);
  const unreservedPath=`${sa.user.id}/${ta.id}/${crypto.randomUUID()}.webp`;
  const {error:unreservedErr}=await bucketA.upload(unreservedPath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",upsert:false});
  expectDenied("A cannot upload WebP without a media reservation",unreservedErr);
  const {error:uploadErr}=await bucketA.upload(storagePath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",cacheControl:"60",upsert:false});
  if(uploadErr) throw new Error("LEGITIMATE STORAGE UPLOAD FAILED: "+uploadErr.message);
  storageUploaded=true;
  if(!storagePath.startsWith(`${sa.user.id}/${ta.id}/`) || !/\/[0-9a-f-]{36}\.webp$/i.test(storagePath))
    throw new Error("SECURITY REGRESSION: storage path is not <user>/<trip>/<uuid>.webp");
  console.log("PASS A legitimate WebP upload; random technical path");

  const {error:uploadBErr}=await bucketB.upload(storagePathB,blob(tinyWebp,"image/webp"),{contentType:"image/webp",cacheControl:"60",upsert:false});
  if(uploadBErr) throw new Error("LEGITIMATE B STORAGE UPLOAD FAILED: "+uploadBErr.message);
  storageUploadedB=true;
  console.log("PASS B legitimate WebP upload in B folder");

  const {data:aDownload,error:aDownloadErr}=await bucketA.download(storagePath);
  if(aDownloadErr||!aDownload) throw new Error("A cannot download own object");
  console.log("PASS A can download own private object");

  const cacheProbe=await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/media/${storagePath}?cacheProbe=${crypto.randomUUID()}`,{
    headers:{Authorization:`Bearer ${sa.access_token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY},
    cache:"no-store"
  });
  if(!cacheProbe.ok) throw new Error("CACHE CONTROL PROBE FAILED: HTTP "+cacheProbe.status);
  const cacheHeader=cacheProbe.headers.get("cache-control") ?? "";
  console.log("Private photo Cache-Control:",cacheHeader);
  if(!/(?:^|[, ]|max-age=)60(?:$|[, ])/i.test(cacheHeader) && !/max-age=60(?:$|[, ])/i.test(cacheHeader))
    throw new Error("PRIVACY REGRESSION: private photo Cache-Control is not 60 seconds");
  console.log("PASS private photo Cache-Control is 60 seconds");

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
    `${sb.user.id}/../${sa.user.id}/${crypto.randomUUID()}.webp`,
    `${sa.user.id}/${crypto.randomUUID()}.webp`,
    `/${sa.user.id}/${crypto.randomUUID()}.webp`
  ]) {
    const {error}=await bucketB.upload(hostilePath,blob(tinyWebp,"image/webp"),{contentType:"image/webp",upsert:false});
    expectDenied("B hostile/cross-owner path "+hostilePath.replaceAll(sa.user.id,"<A>").replaceAll(sb.user.id,"<B>"),error);
  }

  const changedBytes=new Uint8Array([...tinyWebp]); changedBytes[changedBytes.length-1]^=0xff;
  const {error:upsertOwn}=await bucketA.upload(storagePath,blob(changedBytes,"image/webp"),{contentType:"image/webp",upsert:true});
  expectDenied("A cannot overwrite existing object with upsert:true",upsertOwn);
  const {data:afterUpsert,error:afterUpsertErr}=await bucketA.download(storagePath);
  if(afterUpsertErr||!afterUpsert) throw new Error("Cannot verify A object after denied upsert");
  const afterUpsertBytes=new Uint8Array(await afterUpsert.arrayBuffer());
  if(afterUpsertBytes.length!==tinyWebp.length || afterUpsertBytes.some((v,i)=>v!==tinyWebp[i]))
    throw new Error("SECURITY REGRESSION: denied upsert changed A object bytes");
  console.log("PASS denied upsert left original A object unchanged");

  // Negative bucket-configuration probes must have VALID media reservations.
  // Otherwise the row-first RLS check would reject them first and hide size/MIME regressions.
  const ownedTripId=String(ta.id);
  const rejectReservedUpload=async (
    label: string, bytes: Uint8Array, mime: string, rejection: "size" | "mime"
  )=>{
    const photoId=crypto.randomUUID();
    const path=`${sa.user.id}/${ownedTripId}/${photoId}.webp`;
    // Use a valid media.bytes value. An 11 MiB value would fail the DB check
    // before we could exercise the actual Storage bucket size limit.
    const {error:reserveErr}=await A.from("media").insert({
      id:photoId,trip_id:ownedTripId,user_id:sa.user.id,storage_path:path,
      kind:"photo",bytes:tinyWebp.length
    });
    if(reserveErr)throw new Error(label+" RESERVATION FAILED: "+reserveErr.message);
    try{
      const {error}=await bucketA.upload(path,blob(bytes,mime),{
        contentType:mime,cacheControl:"60",upsert:false
      });
      expectDenied(label,error);
      const fault=error as unknown as Record<string,unknown> | null;
      const explanation=[fault?.code,fault?.error,fault?.message,fault?.status,fault?.statusCode]
        .filter(value=>value!==undefined&&value!==null).join(" ");
      if(/row.level.security|permission denied|policy violation|insufficient privilege/i.test(explanation)){
        throw new Error("INVALID TEST: "+label+" was denied by RLS, not the bucket restriction");
      }
      const matches=rejection==="size"
        ? /EntityTooLarge|PayloadTooLarge|file.?size|too.large|exceed|maximum.*size|413/i.test(explanation)
        : /InvalidMimeType|mime.?type|content.?type|unsupported.*type|not.supported/i.test(explanation);
      if(!matches){
        throw new Error("INVALID TEST: "+label+" failed for an unrelated reason: "+explanation);
      }
      console.log("PASS "+label+" rejected by Storage "+rejection+" limit");
    }finally{
      // Server-side deletion also removes an object if the upload unexpectedly succeeded.
      // Never leave quota-consuming reservations behind on staging.
      const {data, error}=await A.functions.invoke("travel-delete",{
        body:{action:"delete_photo",media_id:photoId}
      });
      if(error||data?.ok!==true)
        throw new Error("TEST FIXTURE CLEANUP FAILED ("+label+"): "+(error?.message||JSON.stringify(data)));
      const {data:remaining,error:checkError}=await A.from("media")
        .select("id").eq("id",photoId);
      if(checkError||remaining?.length)
        throw new Error("TEST FIXTURE RESERVATION REMAINS ("+label+")");
      console.log("CLEANUP PASS "+label+" reserved row removed");
    }
  };

  const elevenMiB=new Uint8Array(11*1024*1024);
  await rejectReservedUpload("11 MiB WebP bucket size",elevenMiB,"image/webp","size");

  for (const [mime,bytes] of [
    ["image/svg+xml",new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")],
    ["text/html",new TextEncoder().encode("<html></html>")]
  ] as const){
    // Keep the Storage path .webp and reserve it; only MIME varies.
    await rejectReservedUpload("Disallowed "+mime+" on reserved .webp path",bytes,mime,"mime");
  }

  const {data:signedA,error:signedAErr}=await bucketA.createSignedUrl(storagePath,300);
  if(signedAErr||!signedA?.signedUrl) throw new Error("A cannot create pre-deletion signed URL");
  signedBeforeDelete=signedA.signedUrl;
  console.log("PASS A created signed URL before deletion");

  console.log("STORAGE HOSTILE TESTS PASSED");
} finally {
  if(storageUploaded){
    // Browser DELETE is forbidden. A no-op [] response is also a denial:
    // prove that the existing object remains readable before server deletion.
    const {data:rawRemovedA,error:rawRemoveAErr}=await bucketA.remove([storagePath]);
    if(!rawRemoveAErr && (rawRemovedA?.length ?? 0)>0)
      throw new Error("SECURITY REGRESSION: direct client Storage DELETE accepted");
    const {data:stillA,error:stillAErr}=await bucketA.download(storagePath);
    if(stillAErr||!stillA)throw new Error("INVALID TEST: direct DELETE removed/blocked owner's file");
    const {data:listedA,error:listedAErr}=await bucketA.list(`${sa.user.id}/${ta.id}`,{limit:100});
    if(listedAErr||!listedA?.some(row=>row.name===`${storageId}.webp`))
      throw new Error("SECURITY REGRESSION: client DELETE removed A object from Storage listing");
    console.log("PASS direct client Storage DELETE denied without removing file");

    // The only supported deletion path is travel-delete: Storage first,
    // media row second, verified by the server.
    const {data:removedA,error:removeErr}=await A.functions.invoke("travel-delete",{
      body:{action:"delete_photo",media_id:storageId}
    });
    if(removeErr||removedA?.ok!==true)
      throw new Error("STORAGE SERVER CLEANUP FAILED: "+(removeErr?.message??JSON.stringify(removedA)));
    const {data:mediaAfterA,error:mediaAfterAErr}=await A.from("media").select("id").eq("id",storageId);
    if(mediaAfterAErr||(mediaAfterA??[]).length)
      throw new Error("STORAGE SERVER CLEANUP FAILED: media reservation remains");

    const fileName=storagePath.split("/").at(-1)!;
    const folder=`${sa.user.id}/${ta.id}`;
    const {data:listAfter,error:listAfterErr}=await bucketA.list(folder,{limit:100});
    if(listAfterErr) throw new Error("STORAGE CLEANUP VERIFY LIST FAILED: "+listAfterErr.message);
    if((listAfter??[]).some(x=>x.name===fileName))
      throw new Error("SECURITY REGRESSION: deleted Storage object still appears in A folder listing");
    console.log("CLEANUP PASS: removed object absent from A folder listing");

    const {data:signedMissing,error:signedMissingErr}=await bucketA.createSignedUrl(storagePath,60);
    if(!signedMissingErr && signedMissing?.signedUrl)
      throw new Error("SECURITY REGRESSION: signed URL can still be created for deleted object");
    console.log("CLEANUP PASS: cannot create new signed URL for deleted object");

    if(signedBeforeDelete){
      const signedAfter=await fetch(signedBeforeDelete,{redirect:"manual"});
      console.log("Pre-deletion signed URL after remove status:",signedAfter.status);
      if(signedAfter.ok) throw new Error("SECURITY REGRESSION: pre-deletion signed URL still serves deleted object");
      console.log("PASS pre-deletion signed URL no longer serves deleted object");
    }

    await new Promise(r=>setTimeout(r,1500));
    const {data:afterRemove,error:afterRemoveErr}=await bucketA.download(storagePath);
    if(afterRemove){
      const sdkBytes=new Uint8Array(await afterRemove.arrayBuffer());
      const preview=new TextDecoder().decode(sdkBytes.slice(0,160));
      const exactOriginal=sdkBytes.length===tinyWebp.length && sdkBytes.every((v,i)=>v===tinyWebp[i]);
      console.log("SDK download after remove:", {
        size: afterRemove.size,
        type: afterRemove.type,
        firstBytes: Array.from(sdkBytes.slice(0,16)),
        textPreview: preview,
        exactOriginal
      });
    } else {
      console.log("SDK download after remove returned no Blob; error:",afterRemoveErr?.message ?? null);
    }

    const exactSdkUrl=`${env.SUPABASE_URL}/storage/v1/object/authenticated/media/${storagePath}`;
    const probeExact=async(label: string, token: string)=>{
      const r=await fetch(exactSdkUrl,{
        headers:{Authorization:`Bearer ${token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY},
        cache:"no-store"
      });
      const bytes=new Uint8Array(await r.arrayBuffer());
      const exact=bytes.length===tinyWebp.length && bytes.every((v,i)=>v===tinyWebp[i]);
      console.log(`OBSERVE exact Storage URL ${label} after remove:`,{
        status:r.status,
        cfCacheStatus:r.headers.get("cf-cache-status"),
        age:r.headers.get("age"),
        cacheControl:r.headers.get("cache-control"),
        size:bytes.length,
        exactOriginal:exact
      });
      return {status:r.status,exact};
    };
    const exactA=await probeExact("A",sa.access_token);
    const exactB=await probeExact("B",sb.access_token);
    if(exactB.status>=200 && exactB.status<300 && exactB.exact)
      throw new Error("SECURITY REGRESSION: B received deleted A object on exact Storage URL");
    console.log("PASS B cannot receive deleted A object on exact Storage URL");
    console.log("OBSERVATION ONLY: A exact-URL post-delete result does not determine bench pass/fail",exactA);

    const directUrl=`${env.SUPABASE_URL}/storage/v1/object/authenticated/media/${storagePath}?nocache=${crypto.randomUUID()}`;
    const direct=await fetch(directUrl,{
      headers:{Authorization:`Bearer ${sa.access_token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY},
      cache:"no-store"
    });
    const directBytes=new Uint8Array(await direct.arrayBuffer());
    const directExact=directBytes.length===tinyWebp.length && directBytes.every((v,i)=>v===tinyWebp[i]);
    console.log("DIRECT HTTP after remove:",{
      status:direct.status,
      contentType:direct.headers.get("content-type"),
      cfCacheStatus:direct.headers.get("cf-cache-status"),
      age:direct.headers.get("age"),
      size:directBytes.length,
      exactOriginal:directExact,
      firstBytes:Array.from(directBytes.slice(0,16))
    });
    if(direct.ok && directExact) throw new Error("SECURITY REGRESSION: deleted original object still served by direct authenticated HTTP");
    if(direct.ok) throw new Error("SECURITY REGRESSION: deleted object endpoint returned successful HTTP");
    console.log("CLEANUP PASS: direct authenticated HTTP no longer serves deleted object");
  }
  if(storageUploadedB){
    const {data:rawRemovedB,error:rawRemoveBErr}=await bucketB.remove([storagePathB]);
    if(!rawRemoveBErr && (rawRemovedB?.length ?? 0)>0)
      throw new Error("SECURITY REGRESSION: B direct client Storage DELETE accepted");
    const {data:stillB,error:stillBErr}=await bucketB.download(storagePathB);
    if(stillBErr||!stillB)throw new Error("INVALID TEST: B direct DELETE removed/blocked own file");
    const {data:listedB,error:listedBErr}=await bucketB.list(`${sb.user.id}/${tb.id}`,{limit:100});
    if(listedBErr||!listedB?.some(row=>row.name===`${storageIdB}.webp`))
      throw new Error("SECURITY REGRESSION: client DELETE removed B object from Storage listing");
    console.log("PASS B direct Storage DELETE denied without removing file");

    const {data:removedB,error:removeBErr}=await B.functions.invoke("travel-delete",{
      body:{action:"delete_photo",media_id:storageIdB}
    });
    if(removeBErr||removedB?.ok!==true)
      throw new Error("STORAGE B SERVER CLEANUP FAILED: "+(removeBErr?.message??JSON.stringify(removedB)));
    // A post-delete SDK download can still return a cached Blob (60 s). Use
    // server-side Storage metadata plus a cache-busting HTTP read as proof.
    const {data:bListAfter,error:bListAfterErr}=await bucketB.list(`${sb.user.id}/${tb.id}`,{limit:100});
    if(bListAfterErr||bListAfter?.some(row=>row.name===`${storageIdB}.webp`))
      throw new Error("SECURITY REGRESSION: B Storage object remains in listing");
    const freshB=await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/authenticated/media/${storagePathB}?nocache=${crypto.randomUUID()}`,{
        headers:{Authorization:`Bearer ${sb.access_token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY},
        cache:"no-store"
      }
    );
    if(freshB.ok)throw new Error("SECURITY REGRESSION: B Storage object still served by fresh HTTP read");
    await freshB.body?.cancel();
    const {data:bRow,error:bRowErr}=await B.from("media").select("id").eq("id",storageIdB);
    if(bRowErr||(bRow??[]).length)throw new Error("SECURITY REGRESSION: B media reservation remains");
    console.log("CLEANUP PASS: B Storage object and media row removed through travel-delete");
  }
}
console.log("Next phase: server deletion operations + retained-JWT deletion replay.");
} finally {
  if (domesticTrip?.id) {
    const {data,error}=await A.functions.invoke("travel-delete",{
      body:{action:"delete_trip",trip_id:domesticTrip.id}
    });
    if(error||!data?.ok)throw new Error("PDF DOMESTIC FIXTURE CLEANUP FAILED: "+(error?.message||JSON.stringify(data)));
    console.log("CLEANUP PASS: domestic PDF fixture deleted");
  }
  if (tb?.id) {
    const {data,error}=await B.functions.invoke("travel-delete",{body:{action:"delete_trip",trip_id:tb.id}});
    if(error || !data?.ok) throw new Error("CLEANUP B FAILED via travel-delete: "+(error?.message||JSON.stringify(data)));
    console.log("CLEANUP PASS: B test trip removed via server deletion");
  }
  if (ta?.id) {
    const {data,error}=await A.functions.invoke("travel-delete",{body:{action:"delete_trip",trip_id:ta.id}});
    if(error || !data?.ok) throw new Error("CLEANUP A FAILED via travel-delete: "+(error?.message||JSON.stringify(data)));
    console.log("CLEANUP PASS: A test trip removed via server deletion");
  }
  await A.auth.signOut();
  await B.auth.signOut();
}
