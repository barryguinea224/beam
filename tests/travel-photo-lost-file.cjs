"use strict";
// Android Chrome's provider-backed File may become unreadable after selection.
// These are local synthetic Blob fixtures; no Supabase connection is used.
const assert=require("node:assert/strict");
const PHOTO=require("../travel/photo-utils.js");
const jpeg=new Uint8Array([255,216,255,225,0,16,69,120,105,102,0,0]);
const ENGLISH="A requested file or directory could not be found at the time an operation was processed";
function source(name,mode="ok"){
 const bytes=new Blob([jpeg],{type:"image/jpeg"});
 let revoked=false;
 const file={name,size:bytes.size,type:"image/jpeg",slice(start,end){
   if(revoked||mode==="NotFoundError"){
     const error=new Error(ENGLISH);error.name="NotFoundError";throw error;
   }
   if(mode==="NotReadableError"){
     const error=new Error(ENGLISH);error.name="NotReadableError";
     return {arrayBuffer:async()=>{throw error}};
   }
   if(mode==="short")return new Blob([jpeg.subarray(0,4)],{type:"image/jpeg"});
   return bytes.slice(start,end);
 }};
 return {file,revoke(){revoked=true}};
}
async function main(){
 assert.equal(PHOTO.friendlyError({name:"NotFoundError",message:ENGLISH}),PHOTO.UNAVAILABLE);
 assert.equal(PHOTO.friendlyError({name:"NotReadableError",message:ENGLISH}),PHOTO.UNAVAILABLE);
 assert.doesNotMatch(PHOTO.friendlyError(new Error(ENGLISH)),/A requested file or directory/);
 for(const mode of ["NotFoundError","NotReadableError","short"]){
   const {file}=source(mode+".jpg",mode);
   await assert.rejects(PHOTO.snapshotFile(file),error=>{
     assert.equal(error.message,PHOTO.UNAVAILABLE);
     assert.equal(error.code,"PHOTO_FILE_INACCESSIBLE");
     assert.doesNotMatch(error.message,/A requested file or directory/);
     return true;
   });
 }
 const original=source("telegram-photo.jpg");
 const snapshot=await PHOTO.snapshotFile(original.file);
 assert.equal(snapshot.name,"telegram-photo.jpg");
 assert.equal(snapshot.size,jpeg.length);
 assert.equal(snapshot.type,"image/jpeg");
 original.revoke();
 assert.deepEqual([...new Uint8Array(await snapshot.arrayBuffer())],[...jpeg]);
 assert.equal(await PHOTO.validateFile(snapshot),"jpeg");
 assert.notEqual(snapshot,original.file,"queue holds copied pixels, not the Android File");
 const unsupported=source("video.heic");
 await assert.rejects(PHOTO.snapshotFile(unsupported.file),error=>error.message===PHOTO.UNSUPPORTED);
 console.log("PASS Android revoked File: NotFoundError, NotReadableError, byte truncation, stable snapshot, safe French errors");
}
main().catch(error=>{console.error(error);process.exitCode=1});
