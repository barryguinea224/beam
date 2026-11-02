"use strict";
// Pure browser-shim contract for the private avatar module, no network/keys.
const assert=require("node:assert/strict");
const Avatar=require("../travel/avatar.js");
async function run(){
 const calls=[],image={width:900,height:600,close(){calls.push("bitmap-close")}};
 global.createImageBitmap=async(file,opts)=>{calls.push(["decode",opts?.imageOrientation]);return image};
 const ctx={drawImage(...args){calls.push(["draw",...args.slice(1)])}};
 global.document={createElement(tag){
   assert.equal(tag,"canvas");
   return{width:0,height:0,getContext(name){
     assert.equal(name,"2d");return ctx;
   },toBlob(done,type){
     assert.equal(type,"image/webp");
     done(new Blob(["small-webp-encoded"],{type:"image/webp"}));
   }};
 }};
 const photoApi={async validateFile(){calls.push("validated")},
   async snapshot(file){calls.push("snapshot");return file}};
 const sample=new Blob(["private source image"],{type:"image/png"});
 const converted=await Avatar.convert(sample,photoApi);
 assert.deepEqual([converted.width,converted.height],[512,512],
   "center-crop must produce <=512 square WebP");
 const draw=calls.find(e=>Array.isArray(e)&&e[0]==="draw");
 assert.ok(draw,"Canvas must draw pixels, never upload original metadata");
 // drawImage(image, x, y, sw, sh, dx, dy, dw, dh)
 assert.deepEqual(draw.slice(1),[150,0,600,600,0,0,512,512]);
 assert.equal(converted.blob.type,"image/webp");
 assert.ok(calls.includes("bitmap-close"));
 assert.ok(calls.indexOf("validated")<calls.indexOf("snapshot"));
 const uid="11111111-1111-4111-8111-111111111111";
 const id="22222222-2222-4222-8222-222222222222",path=uid+"/profile/"+id+".webp";
 let profileId=null,readonly=false,shouldFail=false;
 const operations=[],rows=new Map();
 const client={
   from(table){
    if(table==="avatar_media"){
     const q={select(){return q},eq(key,v){q.filters.push([key,v]);return q},filters:[],
       then(done){return Promise.resolve({data:[...rows.values()].filter(row=>
         q.filters.every(([key,v])=>row[key]===v)),error:null}).then(done)}};
     q.single=async()=>({data:rows.get(id),error:null});
     q.insert=async row=>{
       operations.push("reserve");assert.equal(row.storage_path,path);assert.equal(row.state,"pending");
       rows.set(row.id,{...row});return{error:null};
     };
     return q;
    }
    if(table==="profiles"){
     const q={select(){return q},eq(){return q},async single(){
       return{data:{avatar_id:profileId},error:null}
     }};return q;
    }
    throw Error("Unexpected table");
   },
   storage:{from(bucket){
     assert.equal(bucket,"media");return{
       async upload(actualPath,blob,opts){
         operations.push("upload");
         assert.equal(actualPath,path);
         assert.equal(blob.type,"image/webp");assert.equal(opts.upsert,false);
         assert.ok(rows.has(id),"DB row MUST exist before upload");
         return {error:shouldFail?{message:"network interruption"}:null};
       },
       async createSignedUrl(actualPath,sec){
         operations.push("sign");assert.equal(actualPath,path);assert.equal(sec,300);
         return {data:{signedUrl:"https://example.invalid/private?token=fixture"},error:null};
       },
       async remove(){assert.fail("Browser must NEVER remove objects directly")}
     };
   }},
   functions:{async invoke(name,{body}){
     assert.equal(name,"travel-delete");operations.push(body.action);
     if(body.action==="activate_avatar"){
       profileId=body.avatar_id;const row=rows.get(id);row.state="active";
       return{data:{ok:true,avatar_id:id,cleanup_pending:false},error:null}
     }
     if(body.action==="delete_avatar"){
       if(profileId===id)profileId=null;rows.delete(id);
       return{data:{ok:true},error:null}
     }
     throw Error("Unsupported action");
   }}
 };
 const active=await Avatar.upload({client,photoApi,uid,file:sample,idProvider:()=>id,
   canWrite:()=>!readonly});
 assert.deepEqual([active.id,active.path],[id,path]);
 assert.deepEqual(operations.slice(0,3),["reserve","upload","activate_avatar"]);
 assert.equal(profileId,id);
 assert.equal(await Avatar.signedUrl(client,uid,id),"https://example.invalid/private?token=fixture");
 await Avatar.removeByServer(client,id);
 assert.equal(profileId,null);
 assert.equal(rows.size,0);
 readonly=true;
 await assert.rejects(()=>Avatar.upload({client,photoApi,uid,file:sample,idProvider:()=>id,
   canWrite:()=>!readonly}),/lecture seule/);
 assert.equal(rows.size,0,"expired account cannot reserve");
 readonly=false;shouldFail=true;operations.length=0;
 await assert.rejects(()=>Avatar.upload({client,photoApi,uid,file:sample,idProvider:()=>id,
   canWrite:()=>true}),/Envoi.*échoué|Impossible d’envoyer/i);
 assert.deepEqual(operations.slice(0,3),["reserve","upload","delete_avatar"],
   "failed upload MUST clean server-side after reservation");
 assert.equal(rows.size,0);
 console.log("PASS avatar square WebP/EXIF-safe conversion, row-first upload, server deletion, expiry and rollback");
}
run().catch(e=>{console.error(e);process.exitCode=1});
