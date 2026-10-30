"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {uploadOne}=require("../travel/photo-upload.js");
new vm.Script(fs.readFileSync("travel/index.html","utf8").match(/<script>([\s\S]*?)<\/script>/)[1]);

function fake({reserveError=null,uploadError=null,throwNetwork=false,cleanupError=null,cleanupData={ok:true}}={}){
 const calls=[];
 const client={
   from(table){
     assert.equal(table,"media");
     return {async insert(row){calls.push(["reserve",row]);return {error:reserveError}}};
   },
   storage:{
     from(bucket){
       assert.equal(bucket,"media");
       return {async upload(path,blob,options){
         calls.push(["upload",path,blob.type,options.contentType]);
         if(throwNetwork)throw Error("network");
         return {error:uploadError};
       }};
     }
   },
   functions:{
     async invoke(name,args){
       calls.push(["cleanup",name,args.body]);
       return {data:cleanupData,error:cleanupError};
     }
   }
 };
 const photoApi={async convert(){
   calls.push(["convert"]);
   return {blob:new Blob(["pixel-only"],{type:"image/webp"}),width:100,height:160};
 }};
 return {client,photoApi,calls};
}
const sample={
  userId:"30000000-0000-4000-8000-000000000021",
  tripId:"40000000-0000-4000-8000-000000000021",
  file:{name:"portrait.jpg"},
  idProvider:()=>"50000000-0000-4000-8000-000000000021"
};
async function main(){
 const success=fake();
 const created=await uploadOne({...success,...sample});
 assert.deepEqual(success.calls.map(x=>x[0]),["convert","reserve","upload"]);
 assert.equal(created.path,success.calls[1][1].storage_path);
 assert.equal(success.calls[1][1].bytes,10);
 assert.equal(success.calls[2][2],"image/webp");
 assert.equal(success.calls[2][3],"image/webp");

 const quota=fake({reserveError:{message:"PHOTO_LIMIT_REACHED",code:"23514"}});
 await assert.rejects(uploadOne({...quota,...sample}),/10 photos/);
 assert.deepEqual(quota.calls.map(x=>x[0]),["convert","reserve"]);

 const refused=fake({uploadError:{message:"simulated storage rejection"}});
 await assert.rejects(uploadOne({...refused,...sample}),/connexion/);
 assert.deepEqual(refused.calls.map(x=>x[0]),["convert","reserve","upload","cleanup"]);
 assert.deepEqual(refused.calls[3][2],{action:"delete_photo",media_id:sample.idProvider()});

 const network=fake({throwNetwork:true});
 await assert.rejects(uploadOne({...network,...sample}),/connexion/);
 assert.deepEqual(network.calls.map(x=>x[0]),["convert","reserve","upload","cleanup"]);

 const cleanupFailed=fake({uploadError:{message:"staging interrupted"},cleanupError:{message:"cleanup failed"}});
 await assert.rejects(uploadOne({...cleanupFailed,...sample}),/nettoyage non confirmé/);
 assert.deepEqual(cleanupFailed.calls.map(x=>x[0]),["convert","reserve","upload","cleanup"]);
 console.log("BEAM photo upload: reserve first, quota refuse, cleanup success/failure PASS");
}
main().catch(e=>{console.error(e);process.exitCode=1});
