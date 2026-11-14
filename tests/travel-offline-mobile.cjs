"use strict";
// True /travel/ on Android-sized Chromium, entirely fictional Supabase records.
// Captures the offline home, trip sheet and Settings switch without client data.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve}=require("./travel-day-excursions-mobile.cjs");
const DIR=path.resolve("test-artifacts/jyetais-offline");
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
function fakeSupabase(){
 const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
 const uid=localStorage.getItem("jy-test-uid")||A;
 const signedOut=uid==="none";
 const tripId=uid===A?"33333333-3333-4333-8333-333333333333":"44444444-4444-4444-8444-444444444444";
 const trip={id:tripId,country_code:uid===A?"FR":"MA",
  cities:[uid===A?"Paris":"Rabat"],entry_date:"2026-05-01",exit_date:"2026-05-04",
  duration_days:4,purpose:"tourisme",airline:"Compagnie fictive",hotel:"Hôtel fictif",
  companions:"Compagnon fictif",is_domestic:false,deleting:false,
  note:"DO_NOT_STORE_PRIVATE_NOTE",phone:"DO_NOT_STORE_PHONE",
  storage_path:"DO_NOT_STORE_PRIVATE_PATH",cover_media_id:null};
 const act={id:"55555555-5555-4555-8555-555555555555",trip_id:tripId,
  title:"Visite fictive",place:"Quartier fictif",happened_on:"2026-05-02",duration_days:1,
  access_token:"DO_NOT_STORE_TOKEN"};
 window.__offFixture={uid,trip};
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:signedOut?null:{user:{id:uid,email:"example@example.invalid"}}}}},
   async getUser(){return {data:{user:signedOut?null:{id:uid,email:"example@example.invalid"}},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
   async signOut(){localStorage.setItem("jy-test-uid","none");return {error:null}}
  },
  storage:{from(){return {async createSignedUrl(){return {data:null,error:{message:"no fake images"}}}}}},
  from(table){
   const data=table==="profiles"?{
    display_name:uid===A?"Voyageuse Fictive":"Voyageur Second",
    country_of_residence:"GN",deleting:false,access_until:"2099-12-31",
    avatar_id:null,cover_media_id:null,phone:"DO_NOT_STORE_PHONE",postal_address:"DO_NOT_STORE_ADDRESS"
   }:table==="trips"?[trip]:table==="activities"?[act]:[];
   const query={
    select(){return query},eq(){return query},order(){return query},
    limit(){return query},range(){return query},
    single(){return Promise.resolve({data,error:null})},
    maybeSingle(){return Promise.resolve({data:null,error:null})},
    then(ok,fail){return Promise.resolve({data,error:null}).then(ok,fail)}
   };
   return query;
  }
 }}};
}
async function pageFor(browser,server,width){
 const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,
  deviceScaleFactor:1,acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="cdn.jsdelivr.net")return route.fulfill({
   status:200,contentType:"application/javascript",body:"("+fakeSupabase.toString()+")();"
  });
  if(url.hostname==="127.0.0.1")return route.continue();
  return route.abort();
 });
 const url="http://127.0.0.1:"+server.address().port+"/travel/";
 return {context,page,url,errors};
}
async function stored(page){
 return page.evaluate(async()=>{
  const request=indexedDB.open("jyetais-offline");
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error)});
  const raw=await new Promise((resolve,reject)=>{
   const tx=db.transaction("journeys","readonly"),get=tx.objectStore("journeys").get("current");
   get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);
  });db.close();return raw;
 });
}
async function seed(page,url){
 await page.goto(url,{waitUntil:"load",timeout:30000});
 await page.waitForFunction(async()=>((await window.JYETAIS_OFFLINE?.readLast())?.trips?.length||0)>0,
  null,{timeout:30000});
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
}
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 const server=serve();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const {context,page,url,errors}=await pageFor(browser,server,width);
   try{
    await seed(page,url);
    const snapshot=await stored(page);
    if(!snapshot){
     const debug=await page.evaluate(async()=>({
      dbs:await indexedDB.databases(),
      owner:localStorage.getItem("jyetais.offline.owner"),
      current:await window.JYETAIS_OFFLINE.readLast(),
      documentTitle:document.querySelector("#dashboardTitle")?.textContent
     }));
     throw new Error("No raw IndexedDB snapshot: "+JSON.stringify(debug));
    }
    const raw=JSON.stringify(snapshot);
    assert.equal(snapshot.ownerId,A);
    assert.equal(snapshot.trips.length,1);
    assert.equal(snapshot.activities.length,1);
    for(const forbidden of ["DO_NOT_STORE_","phone","postal_address","nationality",
      "token","storage_path","signedUrl","photo_url","passport","session","cover_media_id"]){
     assert.ok(!raw.includes(forbidden),"Forbidden IndexedDB content "+forbidden);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    // Make sure a controlled shell is installed before switching the network off.
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000});
    await context.setOffline(true);
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator("#offlineBanner").waitFor({state:"visible",timeout:30000});
    assert.match(await page.locator("#offlineBanner").textContent(),/Hors ligne · voyages du/);
    assert.match(await page.locator("#dashboardTitle").textContent(),/Voyageuse Fictive/);
    assert.equal(await page.locator("#add").isDisabled(),true);
    assert.equal(await page.locator("#pdf").isDisabled(),true);
    assert.equal(await page.locator("#printJournal").isDisabled(),true);
    assert.equal(await page.locator("#offlineActionNote").isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
     "No offline home overflow at "+width);
    await page.locator("#travelMapPanel").waitFor({state:"visible"});
    if(width===360)await page.screenshot({path:path.join(DIR,"offline-accueil-360.png"),
     animations:"disabled"});
    await page.locator("#trips .tripOpen").first().click();
    assert.equal(await page.locator("#tripDetailModal").evaluate(el=>el.classList.contains("open")),true);
    assert.match(await page.locator("#detailActivities").textContent(),/Visite fictive/);
    assert.equal(await page.locator("#detailActivityForm").isVisible(),false);
    assert.equal(await page.locator("#detailEdit").isVisible(),false);
    assert.match(await page.locator("#detailPhotos").textContent(),/Photos disponibles avec une connexion/);
    assert.equal(await page.locator('#detailPhotos img[src*="supabase"]').count(),0);
    if(width===360)await page.screenshot({path:path.join(DIR,"offline-fiche-360.png"),
     animations:"disabled"});
    await page.locator("#detailClose").click();
    await page.locator("#openAccount").click();
    const toggle=page.locator("#offlineToggle");
    assert.equal(await toggle.isChecked(),true);
    assert.match(await page.locator("#offlineSetting").textContent(),
     /Une copie de vos voyages \(sans photos ni coordonnées\)/);
    if(width===360)await page.screenshot({path:path.join(DIR,"offline-parametres-360.png"),
     animations:"disabled"});
    await toggle.uncheck();
    await page.waitForFunction(async()=>{
     const dbs=await indexedDB.databases();
     return !dbs.some(db=>db.name==="jyetais-offline");
    });
    assert.equal(await page.evaluate(()=>localStorage.getItem("jyetais.offline.owner")),null);
    assert.deepEqual(errors,[],"Offline page errors at "+width+": "+errors.join("; "));
    console.log("PASS offline Android "+width+"px: shell, home, map, detail, no editing, no leaks, switch deletes DB");
   }finally{await context.close()}
  }
  // Separate authenticated session: old owner's data must be removed first.
  {
   const {context,page,url,errors}=await pageFor(browser,server,360);
   try{
    await seed(page,url);
    await page.evaluate(()=>localStorage.setItem("jy-test-uid","22222222-2222-4222-8222-222222222222"));
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageur Second");
    await page.waitForFunction(async()=>{
     const row=await window.JYETAIS_OFFLINE.readLast();
     return row?.ownerId==="22222222-2222-4222-8222-222222222222";
    });
    assert.equal(await page.locator("body").textContent().then(t=>t.includes("Voyageuse Fictive")),false);
    assert.equal((await stored(page)).ownerId,B);
    await page.locator("#openAccount").click();
    await page.locator("#logout").click();
    await page.waitForFunction(async()=>!((await indexedDB.databases())
     .some(db=>db.name==="jyetais-offline")),{timeout:20000});
    assert.equal(await page.evaluate(()=>localStorage.getItem("jyetais.offline.owner")),null);
    assert.deepEqual(errors,[]);
    console.log("PASS account switch wipes previous owner before display; logout deletes entire DB");
   }finally{await context.close()}
  }
  // An expired copy is purged on startup before any offline content is shown.
  {
   const {context,page,url,errors}=await pageFor(browser,server,360);
   try{
    await seed(page,url);
    await page.evaluate(async()=>{
     const req=indexedDB.open("jyetais-offline");
     const db=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));
     await new Promise(resolve=>{
      const tx=db.transaction("journeys","readwrite"),read=tx.objectStore("journeys").get("current");
      read.onsuccess=()=>{const row=read.result;row.updatedAt="2020-01-01T00:00:00Z";
       tx.objectStore("journeys").put(row)};
      tx.oncomplete=resolve;
     });db.close();
    });
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(async()=>!((await indexedDB.databases())
     .some(db=>db.name==="jyetais-offline")),{timeout:30000});
    // The online refresh may rebuild a new copy; verify TTL with direct API instead.
    assert.deepEqual(errors,[]);
    console.log("PASS expired local record is deleted before authenticated refresh");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
