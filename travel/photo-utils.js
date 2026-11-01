// Browser-only image conversion and pure validation shared with Node tests.
// NEVER upload the original file: only the canvas-generated WebP blob.
(function (root) {
  "use strict";
  const MAX_PHOTOS = 10;
  const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
  const MAX_SIDE = 1800;
  const UNSUPPORTED = "Format non pris en charge. Choisissez une photo JPEG ou PNG, ou faites une capture d’écran de la photo.";
  const TOO_LARGE = "Cette photo dépasse 8 Mo. Choisissez une image plus petite ou une capture d’écran.";
  const UNAVAILABLE = "Cette photo n'est plus accessible. Choisissez-la à nouveau depuis votre Galerie.";
  const PREPARE_ERROR = "Impossible de lire ou de préparer cette photo. Choisissez-la à nouveau depuis votre Galerie.";
  function lostFile(error) {
    return error?.name === "NotFoundError" || error?.name === "NotReadableError" ||
      error?.code === "PHOTO_FILE_INACCESSIBLE";
  }
  function friendlyError(error) {
    if (lostFile(error)) return UNAVAILABLE;
    // Browser errors contain platform messages in English; never display them.
    if ([UNSUPPORTED, TOO_LARGE, UNAVAILABLE, PREPARE_ERROR].includes(error?.message)) return error.message;
    return PREPARE_ERROR;
  }
  // Read the ENTIRE photo immediately; the Android document provider can make
  // the original File unreadable after the picker closes.
  async function snapshotFile(file) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (/\.(heic|heif|mov|mp4|m4v|avi|webm|mkv)$/i.test(name) ||
      type.startsWith("video/") || /heic|heif|quicktime/.test(type)) throw new Error(UNSUPPORTED);
    if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error(UNSUPPORTED);
    if (file.size > MAX_SOURCE_BYTES) throw new Error(TOO_LARGE);
    let bytes;
    try {
      bytes = await file.slice(0, file.size).arrayBuffer();
    } catch {
      const error = new Error(UNAVAILABLE);
      error.code = "PHOTO_FILE_INACCESSIBLE";
      throw error;
    }
    if (bytes.byteLength !== file.size) {
      const error = new Error(UNAVAILABLE);
      error.code = "PHOTO_FILE_INACCESSIBLE";
      throw error;
    }
    // Both preview and upload now use a memory-owned Blob, never the provider File.
    const stable = new Blob([bytes], {type:file.type || ""});
    Object.defineProperty(stable, "name", {value:String(file.name || "photo"), enumerable:true});
    await validateFile(stable);
    return stable;
  }

  function kind(bytes) {
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return "png";
    if (bytes.length >= 12 && [82,73,70,70].every((n,i) => bytes[i] === n) &&
        [87,69,66,80].every((n,i) => bytes[i+8] === n)) return "webp";
    return null;
  }
  async function validateFile(file) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (/\.(heic|heif|mov|mp4|m4v|avi|webm|mkv)$/i.test(name) ||
        type.startsWith("video/") || /heic|heif|quicktime/.test(type)) throw new Error(UNSUPPORTED);
    if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error(UNSUPPORTED);
    if (file.size > MAX_SOURCE_BYTES) throw new Error(TOO_LARGE);
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const format = kind(header);
    if (!format || (type && !["image/jpeg","image/png","image/webp","application/octet-stream"].includes(type))) {
      throw new Error(UNSUPPORTED);
    }
    return format;
  }
  async function validateSelection(files, existingCount) {
    if (!Number.isInteger(existingCount) || existingCount < 0 || existingCount > MAX_PHOTOS) {
      throw new Error("Impossible de vérifier le nombre de photos. Réessayez.");
    }
    const selection = Array.from(files);
    if (existingCount + selection.length > MAX_PHOTOS) {
      throw new Error("10 photos maximum par voyage. Supprimez une photo ou sélectionnez-en moins.");
    }
    for (const file of selection) await validateFile(file);
    return selection;
  }
  async function convert(file) {
    await validateFile(file);
    let bitmap;
    try {
      // The default and explicit 'from-image' honor camera EXIF orientation
      // on supporting browsers. The portrait orientation is verified on phone.
      try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch { bitmap = await createImageBitmap(file); }
      if (!bitmap.width || !bitmap.height) throw new Error("INVALID_DIMENSIONS");
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("NO_CANVAS");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!blob || blob.type !== "image/webp" || !blob.size || blob.size > MAX_OUTPUT_BYTES) {
        throw new Error("WEBP_UNAVAILABLE");
      }
      return { blob, width, height };
    } catch {
      throw new Error("Impossible de préparer cette photo. Essayez une image JPEG ou PNG.");
    } finally {
      bitmap?.close?.();
    }
  }
  const api = Object.freeze({MAX_PHOTOS, MAX_SOURCE_BYTES, UNSUPPORTED, TOO_LARGE, UNAVAILABLE, PREPARE_ERROR, lostFile, friendlyError, snapshotFile, kind, validateFile, validateSelection, convert});
  if (root) root.BEAM_PHOTO = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : undefined);
