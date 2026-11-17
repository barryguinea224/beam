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
 const earlier={...trip,id:"66666666-6666-4666-8666-666666666666",
  country_code:"MA",cities:["Rabat"],entry_date:"2026-03-01",exit_date:"2026-03-04",
  note:"DO_NOT_STORE_EARLIER_NOTE"};
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
    home_city:"Conakry",country_of_residence:"GN",deleting:false,access_until:"2099-12-31",
    avatar_id:null,cover_media_id:null,phone:"DO_NOT_STORE_PHONE",postal_address:"DO_NOT_STORE_ADDRESS"
   }:table==="trips"?(uid===A?[trip,earlier]:[trip]):table==="activities"?[act]:[];
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
async function pageFor(browser,server,width,blockWorker=false){
 const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,
  deviceScaleFactor:1,acceptDownloads:true,serviceWorkers:blockWorker?"block":"allow"});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({
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
  if(!db.objectStoreNames.contains("journeys")){db.close();return null}
  const raw=await new Promise((resolve,reject)=>{
   const tx=db.transaction("journeys","readonly"),get=tx.objectStore("journeys").get("current");
   get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);
  });db.close();return raw;
 });
}
async function seed(page,url,{expectWorker=true}={}){
 await page.goto(url,{waitUntil:"load",timeout:30000});
 await page.waitForFunction(async()=>((await window.JYETAIS_OFFLINE?.readLast())?.trips?.length||0)>0,
  null,{timeout:30000});
 if(expectWorker)await page.evaluate(async()=>{await navigator.serviceWorker.ready});
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
    // Record real online flight geometry before disconnecting. The same
    // profile and travel fixtures must produce exactly the same departure.
    await page.waitForFunction(()=>document.querySelectorAll("#map .flightArc").length===2&&
      !!document.querySelector("#map .flightResidence"),null,{timeout:30000});
    const onlineOrigin=await page.evaluate(()=>({
     origin:[...document.querySelectorAll("#map .flightArc")].map(p=>
       p.getAttribute("d").match(/^M([\d.]+) ([\d.]+)/)?.slice(1,3)),
     marker:[document.querySelector("#map .flightResidence").getAttribute("cx"),
      document.querySelector("#map .flightResidence").getAttribute("cy")]
    }));
    assert.equal(new Set(onlineOrigin.origin.map(x=>x?.join(","))).size,1,
     "Every online arc must leave from the same GN residence centroid");
    const snapshot=await stored(page);
    if(!snapshot){
     const debug=await page.evaluate(async()=>({
      dbs:await indexedDB.databases(),
      owner:localStorage.getItem("jyetais.offline.owner"),
      current:await window.JYETAIS_OFFLINE.readLast(),
      documentTitle:document.querySelector("#dashboardTitle")?.textContent,
      authHidden:document.querySelector("#auth")?.className,
      appHidden:document.querySelector("#app")?.className,
      checking:document.querySelector("#accountStatusChecking")?.className,
      unavailable:document.querySelector("#accountStatusUnavailable")?.className,
      loginMessage:document.querySelector("#loginMsg")?.textContent,
      mockLoaded:!!window.__offFixture,
      supabaseLoaded:!!window.supabase,
      online:navigator.onLine,
      shellScripts:[...document.querySelectorAll("script[src]")].map(x=>x.src.split("/").pop())
     }));
     throw new Error("No raw IndexedDB snapshot: "+JSON.stringify(debug)+" PAGEERRORS="+JSON.stringify(errors));
    }
    const raw=JSON.stringify(snapshot);
    assert.equal(snapshot.ownerId,A);
    assert.equal(snapshot.trips.length,2);
    assert.equal(snapshot.activities.length,1);
    assert.deepEqual(snapshot.profile,{
     display_name:"Voyageuse Fictive",home_city:"Conakry",country_of_residence:"GN"
    },"Only the authorized profile fields are persisted");
    for(const forbidden of ["DO_NOT_STORE_","phone","postal_address","nationality","email",
      "token","storage_path","signedUrl","photo_url","passport","session","cover_media_id"]){
     assert.ok(!raw.includes(forbidden),"Forbidden IndexedDB content "+forbidden);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    // Make sure a controlled shell is installed before switching the network off.
    // clients.claim() activates the installed worker without reloading an online
    // mock session (a reload can substitute the real cached SDK for the fixture).

    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:20000});
    // This is the REAL installed SW and its CacheStorage, not a mocked fetch.
    assert.equal(await page.evaluate(async()=>{
     const names=await caches.keys();
     if(!names.some(x=>x.startsWith("beam-travel-shell-")))return false;
     const url=new URL("/travel/assets/world-map.svg",location.href).href;
     return !!(await caches.match(url));
    }),true,"The actual service worker precached world-map.svg");
    const privateOfflineRequests=[];
    page.on("request",request=>{
     if(/\/storage\/v1\/|\/rest\/v1\/|\/auth\/v1\/|signedUrl/i.test(request.url()))
      privateOfflineRequests.push(request.url());
    });
    await context.setOffline(true);
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
    try{
      await page.locator("#offlineBanner").waitFor({state:"visible",timeout:15000});
     }catch(error){
      const debug=await page.evaluate(async()=>{
       let exists=null;
       try{exists=!!(await window.JYETAIS_OFFLINE?.readLast())}catch{exists=false}
       return {navigatorOnline:navigator.onLine,htmlClass:document.documentElement.className,
        hasOfflineStore:!!window.JYETAIS_OFFLINE,hasLocalSnapshot:exists,
        previewBannerHidden:document.querySelector("#offlineBanner")?.hidden,
        appClass:document.querySelector("#app")?.className,
        offlineDisplay:getComputedStyle(document.querySelector("#offline")).display};
      });
      throw new Error("Offline preview not hydrated: "+JSON.stringify(debug)+
       "; page errors: "+JSON.stringify(errors)+"; "+String(error));
     }
    assert.match(await page.locator("#offlineBanner").textContent(),/Hors ligne · voyages du/);
    assert.match(await page.locator("#dashboardTitle").textContent(),/Voyageuse Fictive/);
    assert.equal(await page.locator("#add").isDisabled(),true);
    assert.equal(await page.locator("#pdf").isDisabled(),true);
    assert.equal(await page.locator("#printJournal").isDisabled(),true);
    assert.equal(await page.locator("#offlineActionNote").isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
     "No offline home overflow at "+width);
    await page.locator("#travelMapPanel").waitFor({state:"visible"});
    await page.waitForFunction(()=>
     document.querySelectorAll("#map svg path[data-country]").length>100,
     null,{timeout:30000});
    const map=await page.evaluate(()=>({
     count:document.querySelectorAll("#map svg path[data-country]").length,
     france:!!document.querySelector('#map svg path[data-country="FR"].visited'),
     morocco:!!document.querySelector('#map svg path[data-country="MA"].visited'),
     routes:document.querySelectorAll('#map svg g[data-flight-connections="true"] path.flightArc').length
    }));
    assert.ok(map.count>100,"Real SVG polygons must render after airplane-mode reload");
    assert.ok(map.france&&map.morocco,"Offline snapshot countries must be colored as visited");
    assert.equal(map.routes,2,"Both visited destinations must have a departure from GN");
    const offlineOrigin=await page.evaluate(()=>({
     origin:[...document.querySelectorAll("#map .flightArc")].map(p=>
       p.getAttribute("d").match(/^M([\d.]+) ([\d.]+)/)?.slice(1,3)),
     marker:[document.querySelector("#map .flightResidence")?.getAttribute("cx"),
      document.querySelector("#map .flightResidence")?.getAttribute("cy")]
    }));
    assert.deepEqual(offlineOrigin,onlineOrigin,
      "Offline arcs and visible origin must match the ONLINE profile at Conakry, GN");
    if(width===360)await page.locator("#travelMapPanel").screenshot({
     path:path.join(DIR,"offline-carte-conakry-360.png"),animations:"disabled"
    });
    const cover=await page.locator("#profileCoverImage").evaluate(img=>({
     src:img.getAttribute("src"),private:img.dataset.isPrivate,
     width:img.naturalWidth,hidden:img.hidden
    }));
    assert.match(cover.src||"",/\.\/assets\/countries\/fr\.svg$/,
     "Most recent visited country must illustrate offline cover");
    assert.equal(cover.private,"false","Private image URLs forbidden offline");
    assert.equal(cover.hidden,false);
    assert.ok(cover.width>0,"Country cover must load from public cache");
    assert.deepEqual(privateOfflineRequests,[],
     "Offline navigation must not request Supabase or signed private photos");
    if(width===360)await page.screenshot({path:path.join(DIR,"offline-accueil-360.png"),
     fullPage:true,animations:"disabled"});
    await page.locator("#trips .tripOpen").first().click();
    assert.equal(await page.locator("#tripDetailModal").evaluate(el=>el.classList.contains("open")),true);
    assert.match(await page.locator("#detailActivities").textContent(),/Visite fictive/);
    assert.equal(await page.locator("#detailActivityForm").isVisible(),false);
    assert.equal(await page.locator("#detailEdit").isVisible(),false);
    assert.equal(await page.locator("#detailShare").isDisabled(),true);
    assert.match(await page.locator("#detailShareHelp").textContent(),/Photos disponibles avec une connexion/);
    assert.equal(await page.locator("#detailPhotos .detailHeroFallback").count(),1);
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
    // A logout may reload the SPA as storage clears; wait across navigation.
     await page.waitForFunction(()=>localStorage.getItem("jyetais.offline.owner")===null,null,{timeout:15000});
    assert.deepEqual(errors,[],"Offline page errors at "+width+": "+errors.join("; "));
    console.log("PASS offline Android "+width+"px: GN origin=online, home marker, map, detail, no leaks, owner safeguards");
   }finally{await context.close()}
  }
  // Separate authenticated session: old owner's data must be removed first.
  {
   const {context,page,url,errors}=await pageFor(browser,server,360,true);
   try{
    // Account-switch fixture deliberately blocks service workers; do not await ready.
    await seed(page,url,{expectWorker:false});
    await page.evaluate(()=>localStorage.setItem("jy-test-uid","22222222-2222-4222-8222-222222222222"));
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageur Second");
    await page.waitForFunction(async()=>{
     const row=await window.JYETAIS_OFFLINE.readLast();
     return row?.ownerId==="22222222-2222-4222-8222-222222222222";
    });
    assert.equal(await page.locator("body").textContent().then(t=>t.includes("Voyageuse Fictive")),false);
    await page.waitForFunction(async()=>{const req=indexedDB.open("jyetais-offline");
     const db=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result));
     if(!db.objectStoreNames.contains("journeys")){db.close();return false}
     const row=await new Promise(resolve=>{const g=db.transaction("journeys").objectStore("journeys").get("current");g.onsuccess=()=>resolve(g.result)});
     db.close();return row?.ownerId==="22222222-2222-4222-8222-222222222222";
    },null,{timeout:10000});
    // The raw IDB transaction and the local owner marker can settle on
    // different ticks during a verified account transition. They must converge.
    await page.waitForFunction(async()=>{
     const expected="22222222-2222-4222-8222-222222222222";
     if(window.JYETAIS_OFFLINE.owner()!==expected)return false;
     const saved=await window.JYETAIS_OFFLINE.readFor(expected);
     return saved?.ownerId===expected;
    },null,{timeout:15000});
    await page.locator("#openAccount").click();
    await page.locator("#logout").click();
    await page.waitForFunction(async()=>!((await indexedDB.databases())
     .some(db=>db.name==="jyetais-offline")),{timeout:20000});
    await page.waitForFunction(()=>localStorage.getItem("jyetais.offline.owner")===null,
      null,{timeout:20000});
    assert.deepEqual(errors,[]);
    console.log("PASS account switch wipes previous owner before display; logout deletes entire DB");
   }finally{await context.close()}
  }
  // An expired copy is purged on startup before any offline content is shown.
  {
   const {context,page,url,errors}=await pageFor(browser,server,360);
   try{
    await seed(page,url);
    // Wait for the already-claimed worker instead of recreating the mock session.

    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
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
    await context.setOffline(true);
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator("#offline").waitFor({state:"visible",timeout:30000});
    assert.equal(await page.locator("#offlineBanner").isVisible(),false);
    await page.waitForFunction(async()=>!((await indexedDB.databases())
     .some(db=>db.name==="jyetais-offline")),{timeout:30000});
    await page.waitForFunction(()=>localStorage.getItem("jyetais.offline.owner")===null,
      null,{timeout:20000});
    assert.deepEqual(errors,[]);
    console.log("PASS expired 30-day copy removed on offline startup; neutral fallback");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
