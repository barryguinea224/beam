// Private BTH avatar: client-side centered square WebP, row-first Storage, server cleanup.
// Never store source images, signed URLs or EXIF outside memory/temporary DOM.
(function(root){
"use strict";
const MAX_SIDE=512,MAX_BYTES=2*1024*1024,SIGNED_SECONDS=300;
const ERROR_UPLOAD="Impossible d’envoyer la photo de profil. Vérifiez votre connexion.";
const ERROR_CLEANUP="Envoi interrompu et nettoyage non confirmé. Réessayez depuis « Mon compte » ou contactez l’assistance.";
function uuid(){return crypto.randomUUID()}
async function convert(file,photoApi){
  await photoApi.validateFile(file);
  const snapshot=await photoApi.snapshot(file);
  let bitmap;
  try{
    try{bitmap=await createImageBitmap(snapshot,{imageOrientation:"from-image"})}
    catch{bitmap=await createImageBitmap(snapshot)}
    if(!bitmap.width||!bitmap.height)throw Error("DIMENSIONS");
    const side=Math.min(MAX_SIDE,bitmap.width,bitmap.height);
    const canvas=document.createElement("canvas");canvas.width=side;canvas.height=side;
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("NO_CANVAS");
    const sourceSide=Math.min(bitmap.width,bitmap.height);
    const sx=(bitmap.width-sourceSide)/2,sy=(bitmap.height-sourceSide)/2;
    ctx.drawImage(bitmap,sx,sy,sourceSide,sourceSide,0,0,side,side);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",.84));
    if(!blob||blob.type!=="image/webp"||!blob.size||blob.size>MAX_BYTES)
      throw Error("INVALID_WEBP");
    return {blob,width:side,height:side};
  }catch{throw Error("Impossible de recadrer la photo. Choisissez une autre image JPEG ou PNG.")}
  finally{bitmap?.close?.()}
}
async function removeByServer(client,id){
  const {data,error}=await client.functions.invoke("travel-delete",{
    body:{action:"delete_avatar",avatar_id:id}
  });
  if(error||data?.ok!==true)throw Error("Nettoyage serveur indisponible.");
  return data;
}
async function cleanupPending(client,uid){
  const {data,error}=await client.from("avatar_media").select("id")
    .eq("user_id",uid).eq("state","pending");
  if(error)throw Error("Impossible de vérifier les anciennes photos en attente.");
  for(const row of data||[])await removeByServer(client,row.id);
}
async function upload({client,photoApi,uid,file,idProvider=uuid,canWrite=()=>true}){
  if(!canWrite())throw Error("Accès en lecture seule : impossible de modifier la photo.");
  const converted=await convert(file,photoApi);
  if(!canWrite())throw Error("Accès en lecture seule : impossible de modifier la photo.");
  await cleanupPending(client,uid);
  const id=idProvider(),path=uid+"/profile/"+id+".webp";
  const {error:reservationError}=await client.from("avatar_media").insert({
    id,user_id:uid,storage_path:path,state:"pending",
    width:converted.width,height:converted.height,bytes:converted.blob.size
  });
  if(reservationError)throw Error("Impossible de réserver la photo de profil. Aucun fichier n’a été envoyé.");
  try{
    const {error}=await client.storage.from("media").upload(path,converted.blob,{
      contentType:"image/webp",cacheControl:"60",upsert:false
    });
    if(error)throw Error("UPLOAD_FAILED");
  }catch{
    try{await removeByServer(client,id)}catch{
      const e=Error(ERROR_CLEANUP);e.code="AVATAR_CLEANUP_UNCONFIRMED";throw e;
    }
    throw Error(ERROR_UPLOAD);
  }
  let activated=false,cleanupPendingOnServer=false;
  try{
    const {data,error}=await client.functions.invoke("travel-delete",{
      body:{action:"activate_avatar",avatar_id:id}
    });
    activated=!error&&data?.ok===true&&data?.avatar_id===id;
    cleanupPendingOnServer=Boolean(data?.cleanup_pending);
  }catch{}
  if(!activated){
    // A timeout could hide a committed promotion. Read the authoritative
    // pointer first, rather than accidentally deleting the active photo.
    const {data:profile,error}=await client.from("profiles")
      .select("avatar_id").eq("id",uid).single();
    if(!error&&profile?.avatar_id===id)activated=true;
    else {
      try{await removeByServer(client,id)}catch{
        const e=Error(ERROR_CLEANUP);e.code="AVATAR_CLEANUP_UNCONFIRMED";throw e;
      }
      throw Error("Impossible d’activer la photo. L’ancienne photo est conservée.");
    }
  }
  return {id,path,cleanupPending:cleanupPendingOnServer};
}
async function signedUrl(client,uid,avatarId){
  if(!avatarId)return null;
  const {data:row,error}=await client.from("avatar_media")
    .select("id,storage_path,state").eq("id",avatarId).eq("user_id",uid).single();
  if(error||!row||row.state!=="active"||row.storage_path!==uid+"/profile/"+avatarId+".webp")
    throw Error("Photo de profil temporairement indisponible.");
  const {data,error:signedError}=await client.storage.from("media")
    .createSignedUrl(row.storage_path,SIGNED_SECONDS);
  if(signedError||!data?.signedUrl)throw Error("Photo de profil temporairement indisponible.");
  return data.signedUrl;
}
const api=Object.freeze({convert,upload,signedUrl,removeByServer,cleanupPending,MAX_SIDE,MAX_BYTES,SIGNED_SECONDS});
if(root)root.BEAM_TRAVEL_AVATAR=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
