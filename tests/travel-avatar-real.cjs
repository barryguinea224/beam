"use strict";
// REAL travel/index.html in Chromium; synthetic JWT/Storage only, never staging.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const root=path.resolve(__dirname,"../travel");
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
  ".css":"text/css;charset=utf-8",".svg":"image/svg+xml",".png":"image/png",
  ".webp":"image/webp",".webmanifest":"application/manifest+json"};
function server(){return http.createServer(async(req,res)=>{
 if(syntheticTravelConfig(req,res))return;
 const reqPath=new URL(req.url,"http://localhost").pathname;
 if(!reqPath.startsWith("/travel/")){res.writeHead(404);res.end();return}
 const name=reqPath.slice("/travel/".length)||"index.html";
 const f=path.resolve(root,name);
 if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 try{res.writeHead(200,{"content-type":mime[path.extname(f)]||"application/octet-stream",
   "cache-control":"no-store"});res.end(await fs.readFile(f))}
 catch{res.writeHead(404);res.end()}
})}
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222", email="avatar-test@example.invalid";
 const initial=window.__avatarFixture||{};
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,
  phone:null,postal_address:null,access_until:initial.until,avatar_id:initial.avatar?initial.avatar:null};
 const avatars=new Map(),pending=[];
 const pathFor=id=>uid+"/profile/"+id+".webp";
 if(initial.avatar)avatars.set(initial.avatar,{id:initial.avatar,user_id:uid,
   storage_path:pathFor(initial.avatar),state:"active"});
 const calls=window.__avatarCalls={uploads:[],functions:[],signed:[],directDeletes:0,
   unexpected:[],getProfile:()=>({...profile}),getAvatars:()=>[...avatars.values()]};
 const fixtureImage="/travel/icons/icon-192.png";
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return{data:{session:{access_token:"local-only-token",user:{id:uid,email}}}}},
   async getUser(){return{data:{user:{id:uid,email}},error:null}},
   onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},
   async signOut(){return{error:null}}
  },
  from(table){
   const filters=[];
   const matches=x=>filters.every(([k,v])=>String(x[k])===String(v));
   const q={
    select(){return q},eq(k,v){filters.push([k,v]);return q},
    limit(){return q},
    async single(){
     if(table==="profiles")return {data:matches({...profile,id:uid})?{...profile}:null,error:null};
     if(table==="avatar_media"){
      const item=[...avatars.values()].find(matches);
      return{data:item||null,error:item?null:{message:"not found"}}
     }
     return{data:null,error:{message:"unknown table"}}
    },
    async maybeSingle(){return {data:null,error:null}},
    async order(){return{data:table==="trips"?[]:[],error:null}},
    then(resolve,reject){
     return Promise.resolve({data:table==="avatar_media"?[...avatars.values()].filter(matches):[],
       error:null}).then(resolve,reject)
    }
   };
   q.insert=async item=>{
    if(table!=="avatar_media")return{data:null,error:{message:"unexpected insert"}};
    if(item.user_id!==uid||item.state!=="pending"||item.storage_path!==pathFor(item.id))
     return{data:null,error:{message:"FORBIDDEN"}};
    avatars.set(item.id,{...item});pending.push(item.id);
    return{data:null,error:null}
   };
   return q;
  },
  storage:{from(bucket){
   if(bucket!=="media")throw Error("Unexpected bucket");
   return{
    async upload(file,blob,opts){
     calls.uploads.push({file,type:blob.type,size:blob.size,opts});
     if(!file.startsWith(uid+"/profile/")||blob.type!=="image/webp"||opts.upsert!==false)
      return{data:null,error:{message:"WRONG_AVATAR_UPLOAD"}};
     const item=[...avatars.values()].find(a=>a.storage_path===file&&a.state==="pending");
     if(!item)return{data:null,error:{message:"NO_ROW_FIRST_RESERVATION"}};
     return{data:{path:file},error:null}
    },
    async createSignedUrl(file,expires){
     calls.signed.push({file,expires});
     if(expires!==300||!file.startsWith(uid+"/profile/"))
      return{data:null,error:{message:"INVALID_SIGNED_URL"}};
     return{data:{signedUrl:location.origin+fixtureImage+"?signed="+encodeURIComponent(file)},
      error:null}
    },
    async remove(){calls.directDeletes++;return{data:null,error:{message:"BROWSER_DELETE_FORBIDDEN"}}}
   };
  }},
  functions:{async invoke(name,{body}){
   calls.functions.push({name,body});
   if(name!=="travel-delete")return{data:null,error:{message:"wrong function"}};
   const {action,avatar_id:id}=body;
   if(action==="activate_avatar"){
    const item=avatars.get(id);
    if(!item||item.state!=="pending")return{data:null,error:{message:"NOT_RESERVED"}};
    const previous=profile.avatar_id;
    if(previous&&avatars.has(previous))avatars.get(previous).state="retired";
    item.state="active";profile.avatar_id=id;
    if(previous)avatars.delete(previous);
    return{data:{ok:true,avatar_id:id,cleanup_pending:false},error:null}
   }
   if(action==="delete_avatar"){
    const item=avatars.get(id);
    if(!item)return{data:{ok:true,already_absent:true},error:null};
    if(profile.avatar_id===id)profile.avatar_id=null;
    avatars.delete(id);
    return{data:{ok:true},error:null}
   }
   return{data:null,error:{message:"Unexpected action"}}
  }}
 }}};
}
const date=offset=>{
 const d=new Date();d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10)
};
async function main(){
 const host=server();await new Promise(ok=>host.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [360,1024]){
   for(const cfg of [
    {label:"without-photo",until:date(600),avatar:null,modify:true},
    {label:"expired-existing",until:date(-1),
      avatar:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",modify:false}
   ]){
    const ctx=await browser.newContext({viewport:{width,height:800},
      isMobile:width===360,hasTouch:width===360,serviceWorkers:"block"});
    const p=await ctx.newPage();
    const errors=[];p.on("pageerror",e=>errors.push(String(e)));
    await p.addInitScript(fixture=>{window.__avatarFixture=fixture},cfg);
    await p.route("**/*",route=>{
     const hostname=new URL(route.request().url()).hostname;
     if(hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,
       contentType:"text/javascript",body:"("+fakeSupabase.toString()+")();"});
     if(hostname==="127.0.0.1")return route.continue();
     return route.abort();
    });
    try{
     const base="http://127.0.0.1:"+host.address().port+"/travel/";
     await p.goto(base,{waitUntil:"load"});
     await p.locator("#dashboardTitle").getByText("Aminata Diallo").waitFor({timeout:15000});
     if(cfg.avatar){
      await p.locator("#travelerAvatar img").waitFor({state:"visible"});
      assert.equal(await p.locator("#travelerAvatar img").getAttribute("data-is-private"),"true");
     }else{
      assert.equal((await p.locator("#travelerAvatar").innerText()).trim(),"AD");
      assert.equal(await p.locator("#travelerAvatar img").count(),0);
     }
     await p.locator("#openAccount").click();
     await p.locator("#accountOverlay").waitFor({state:"visible"});
     if(cfg.avatar){
      await p.locator("#accountAvatar img").waitFor({state:"visible"});
     }else{
      assert.equal((await p.locator("#accountAvatar").innerText()).trim(),"AD");
      assert.equal(await p.locator("#accountAvatar img").count(),0);
     }
     if(cfg.modify){
      await p.locator("#avatarPick").setInputFiles({
       name:"photo-camera.png",mimeType:"image/png",
       buffer:await fs.readFile(path.join(root,"icons/icon-192.png"))
      });
      await p.waitForFunction(()=>window.__avatarCalls.getProfile().avatar_id!==null);
      await p.locator("#travelerAvatar img").waitFor({state:"visible"});
      await p.locator("#accountAvatar img").waitFor({state:"visible"});
      const info=await p.evaluate(()=>window.__avatarCalls);
      assert.equal(info.uploads.length,1,"one row-first private upload");
      assert.equal(info.uploads[0].opts.upsert,false);
      assert.equal(info.uploads[0].type,"image/webp");
      assert.match(info.uploads[0].file,/\/profile\/[0-9a-f-]+\.webp$/);
      assert.equal(info.signed.at(-1).expires,300);
      assert.equal(info.directDeletes,0);
      assert.ok(info.functions.some(f=>f.body.action==="activate_avatar"));
      await p.locator("#avatarRemove").click();
      await p.waitForFunction(()=>window.__avatarCalls.getProfile().avatar_id===null);
      assert.equal((await p.locator("#travelerAvatar").innerText()).trim(),"AD");
      assert.equal((await p.locator("#accountAvatar").innerText()).trim(),"AD");
      assert.equal(await p.locator("#travelerAvatar img").count(),0);
      assert.equal(await p.locator("#accountAvatar img").count(),0);
      const after=await p.evaluate(()=>window.__avatarCalls);
      assert.ok(after.functions.some(f=>f.body.action==="delete_avatar"));
      assert.equal(after.directDeletes,0,"browser must not directly delete Storage");
      console.log("PASS real page avatar add/read/remove, both initials, "+width+"px");
     }else{
      assert.equal(await p.locator("#avatarChange").isVisible(),false);
      assert.equal(await p.locator("#avatarRemove").isVisible(),false);
      const signed=await p.evaluate(()=>window.__avatarCalls.signed);
      assert.equal(signed.length,1,"expired account must retain signed avatar display");
      console.log("PASS real page expired keeps avatar, hides writes, "+width+"px");
     }
     assert.deepEqual(errors,[],"No browser exceptions for "+cfg.label+" "+width);
    }finally{await ctx.close()}
   }
  }
 }finally{
  await browser.close();await new Promise(ok=>host.close(ok));
 }
 console.log("PASS real-page avatar privacy and appearance, 360px and 1024px");
}
main().catch(error=>{console.error(error);process.exitCode=1});
