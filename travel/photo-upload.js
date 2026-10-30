// Row-first upload: a photo DB reservation must exist before Storage can accept
// the exact path. Browser DELETE on media stays revoked: cleanup via travel-delete.
(function (root) {
  "use strict";
  async function uploadOne({client, photoApi, userId, tripId, file, idProvider}) {
    const converted = await photoApi.convert(file);
    const id = (idProvider || (() => crypto.randomUUID()))();
    const path = userId + "/" + tripId + "/" + id + ".webp";
    const {error:reservationError} = await client.from("media").insert({
      id, trip_id:tripId, user_id:userId, storage_path:path, kind:"photo",
      width:converted.width, height:converted.height, bytes:converted.blob.size
    });
    if (reservationError) {
      if (/PHOTO_LIMIT_REACHED/.test(reservationError.message || "")) {
        throw new Error("Ce voyage possède déjà 10 photos. Supprimez-en une avant d’en ajouter.");
      }
      throw new Error("Impossible de réserver cette photo. Aucun fichier n’a été envoyé.");
    }
    let failed=false;
    try {
      const {error}=await client.storage.from("media").upload(path, converted.blob, {
        contentType:"image/webp",cacheControl:"60",upsert:false
      });
      failed=Boolean(error);
    } catch {
      failed=true;
    }
    if (failed) {
      // A network failure may conceal a successful Storage write. The server
      // removes any object first, then the row; it also handles absent objects.
      let cleaned=false;
      try {
        const {data,error}=await client.functions.invoke("travel-delete",{
          body:{action:"delete_photo",media_id:id}
        });
        cleaned=!error && data?.ok===true;
      } catch {}
      if (!cleaned) {
        const problem=new Error("Envoi échoué et nettoyage non confirmé. Rouvrez le voyage pour supprimer la photo « Prévisualisation indisponible », ou contactez BEAM.");
        problem.code="PHOTO_CLEANUP_UNCONFIRMED";
        throw problem;
      }
      throw new Error("L’envoi d’une photo a échoué. Vérifiez votre connexion.");
    }
    return {id,path};
  }
  const api=Object.freeze({uploadOne});
  if(root)root.BEAM_PHOTO_UPLOAD=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
