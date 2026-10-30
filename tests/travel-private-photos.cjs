"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const PHOTO = require("../travel/photo-utils.js");
const html = fs.readFileSync("travel/index.html", "utf8");
const tag = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes("const PHOTO=window.BEAM_PHOTO;"));
assert.ok(tag, "Travel History inline script missing");
new vm.Script(tag[1], { filename: "travel/index.html" });
assert.ok(html.includes('<script src="./photo-utils.js"></script>'), "Photo converter must load before inline app");
assert.ok(html.includes('id="photoGallery"'), "A private gallery must exist");
assert.ok(html.includes('id="photoUsage"'), "Limits/count must be displayed");
assert.ok(html.includes('id="photos"'), "Photo input missing");
assert.ok(html.indexOf('id="photoField"') < html.indexOf('name="note"'), "Photos must precede souvenirs");
assert.ok(html.includes('PHOTO.validateSelection'), "Selection must be validated before trip save");
const uploadSource = fs.readFileSync("travel/photo-upload.js", "utf8");
new vm.Script(uploadSource, {filename:"travel/photo-upload.js"});
assert.ok(html.includes('<script src="./photo-upload.js"></script>'), "Row-first helper loaded");
assert.ok(html.includes('BEAM_PHOTO_UPLOAD.uploadOne'), "App must use row-first helper");
assert.ok(uploadSource.indexOf('.from("media").insert(') <
  uploadSource.indexOf('.storage.from("media").upload('), "DB row must precede Storage upload");
assert.ok(uploadSource.includes('contentType:"image/webp"'), "Only WebP can be uploaded");
assert.ok(uploadSource.includes('action:"delete_photo"'), "Failed upload cleanup must use server deletion");
assert.ok(html.includes('S.storage.from("media").download(row.storage_path)'), "Private WebP must be downloadable");
assert.ok(html.includes('S.functions.invoke("travel-delete",{body:{action:"delete_photo"'), "Photo deletion must be server-side");
assert.ok(html.includes('createSignedUrl(row.storage_path,300)'), "Private gallery must use short-lived URLs");
assert.ok(!html.includes('async function clean(file)'), "Legacy conversion path must not remain");

const jpeg = Uint8Array.from([255, 216, 255, 225, 0, 16, 69, 120, 105, 102, 0, 0]);
const png = Uint8Array.from([137,80,78,71,13,10,26,10, 0, 0, 0, 0]);
const webp = Uint8Array.from([82,73,70,70,20,0,0,0,87,69,66,80,0,0]);
const heic = Uint8Array.from([0,0,0,24,102,116,121,112,104,101,105,99]);
function fake(bytes, name, type, sizeOverride) {
  const blob = new Blob([bytes], { type });
  return {
    name, type, size: sizeOverride ?? blob.size,
    slice: (start, end) => blob.slice(start, end)
  };
}
async function rejectWith(file, text) {
  await assert.rejects(PHOTO.validateFile(file), error => error.message.includes(text));
}
async function main() {
  assert.equal(PHOTO.MAX_PHOTOS, 10);
  assert.equal(PHOTO.MAX_SOURCE_BYTES, 8 * 1024 * 1024);
  assert.equal(await PHOTO.validateFile(fake(jpeg, "test.jpg", "image/jpeg")), "jpeg");
  assert.equal(await PHOTO.validateFile(fake(png, "test.png", "image/png")), "png");
  assert.equal(await PHOTO.validateFile(fake(webp, "test.webp", "image/webp")), "webp");
  await rejectWith(fake(heic, "photo.heic", "image/heic"), "Format non pris en charge");
  await rejectWith(fake(jpeg, "photo.HEIF", "image/jpeg"), "Format non pris en charge");
  await rejectWith(fake(jpeg, "clip.mp4", "video/mp4"), "Format non pris en charge");
  await rejectWith(fake(heic, "photo.jpg", "image/jpeg"), "Format non pris en charge");
  await rejectWith(fake(jpeg, "big.jpg", "image/jpeg", PHOTO.MAX_SOURCE_BYTES + 1), "8 Mo");
  await assert.rejects(PHOTO.validateSelection([fake(jpeg, "a.jpg", "image/jpeg")], 10), /10 photos maximum/);
  await assert.rejects(PHOTO.validateSelection(Array.from({length: 11}, (_,i) => fake(jpeg,i+".jpg","image/jpeg")),0), /10 photos maximum/);
  await assert.rejects(PHOTO.validateSelection([], -1), /Impossible de vérifier/);
  assert.equal((await PHOTO.validateSelection([fake(jpeg,"a.jpg","image/jpeg")],9)).length, 1);

  // Browser stub: camera EXIF orientation is applied by createImageBitmap,
  // then pixels are copied to a NEW canvas-created WebP, not the original JPEG.
  let orientation, drawn, closed = false;
  global.createImageBitmap = async (_file, options) => {
    orientation = options?.imageOrientation;
    return { width: 900, height: 1600, close() { closed = true } };
  };
  global.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0, height: 0,
        getContext() {
          return { drawImage(_source,_x,_y,w,h) { drawn = [w,h] } };
        },
        toBlob(callback, mime) {
          assert.equal(mime, "image/webp");
          callback(new Blob(["CANVAS_PIXEL_DATA_ONLY"], {type:"image/webp"}));
        }
      };
    }
  };
  const gpsPhoto = fake(new Uint8Array([...jpeg, ...Buffer.from("GPSLatitude GPSLongitude")]),"portrait.jpg","image/jpeg");
  const converted = await PHOTO.convert(gpsPhoto);
  assert.deepEqual(drawn, [900,1600], "Portrait must not be rotated by app");
  assert.equal(orientation, "from-image");
  assert.equal(closed, true);
  assert.equal(converted.blob.type, "image/webp");
  assert.equal(converted.width,900);
  assert.equal(converted.height,1600);
  assert.ok(!((await converted.blob.text()).includes("GPS")), "Original GPS metadata must never be copied");
  console.log("BEAM private photos: format/size/count/portrait/canvas contract PASS");
  console.log("NOTE: true EXIF/GPS removal and device orientation require real phone download test.");
}
main().catch(err => { console.error(err); process.exitCode = 1; });
