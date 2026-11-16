"use strict";
// Real application in Chromium; only invented journeys and synthetic owner.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const dir=path.resolve("test-artifacts/premium-cards");
const fake='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="#9bbdae"/><path d="M0 320Q190 100 360 270T800 220V450H0" fill="#6f9e86"/><circle cx="620" cy="100" r="58" fill="#ecdfb2"/></svg>';
function seededSupabase(){
 const user="22222222-2222-4222-8222-222222222222";
 const rows=window.__excursionFixture.rows;
 rows.push({id:"66666666-6666-4666-8666-666666666666",country_code:"GN",cities:["Labé"],
  entry_date:"2024-02-02",exit_date:"2024-02-10",duration_days:9,purpose:"famille",is_domestic:true,deleting:false});
 rows.push({id:"77777777-7777-4777-8777-777777777777",country_code:"SN",cities:["Dakar"],
  entry_date:"2025-09-02",exit_date:"2025-09-10",duration_days:9,purpose:"affaires",is_domestic:false,deleting:false});
 rows[0].cover_media_id="88888888-8888-4888-8888-888888888888";
 rows[0].companions="Aïssatou";
 rows[0].airline="Compagnie fictive";
 const photo={id:rows[0].cover_media_id,trip_id:rows[0].id,user_id:user,
  storage_path:user+"/trip/photo-fictive.webp",is_favorite:true,created_at:"2026-11-01T12:00:00Z"};
 const create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),from=client.from.bind(client);
  client.from=table=>{
   if(table!=="media")return from(table);
   const state={where:[]};
   const q={select(){return q},eq(field,value){state.where.push([field,value]);return q},
    order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:null,error:null})},
    then(done,failed){
     const same=state.where.find(x=>x[0]==="trip_id")?.[1]===photo.trip_id&&
      state.where.find(x=>x[0]==="user_id")?.[1]===photo.user_id;
     return Promise.resolve({data:same?[photo]:[],error:null}).then(done,failed);
    }};
   return q;
  };
  client.storage.from=()=>({createSignedUrl:async()=>({
   data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/photo-fictive.webp?token=SYNTHETIC_ONLY"},error:null
  })});
  return client;
 };
}
async function main(){
 await fs.mkdir(dir,{recursive:true});
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[],privateRequests=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="cdn.jsdelivr.net")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fictionalSupabase.toString()+")();("+seededSupabase.toString()+")();"});
    if(url.hostname==="fixture.invalid"){
     assert.match(url.pathname,/^\/storage\/v1\/object\/sign\/media\//);
     privateRequests.push(url.href);
     return route.fulfill({status:200,contentType:"image/svg+xml",body:fake});
    }
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#trips .journeyTrip").first().waitFor();
    assert.equal(await page.locator("#trips .journeyTrip").count(),4);
    assert.equal(await page.locator(".completedTripsList .journeyTrip").count(),3);
    assert.equal(await page.locator(".upcomingTripsSection .journeyTrip").count(),1);
    assert.match(await page.locator(".upcomingTripsSection").innerText(),/À venir/);
    assert.match(await page.locator("#tripListSummary").innerText(),/4 voyages · 4 pays/);
    assert.equal(await page.locator(".journeyShade").count(),0);
    await page.locator(".completedTripsList .journeyTrip").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector(".journeyPhotoCount")?.textContent==="1/1");
    assert.equal(await page.locator(".journeyPhotoCount").count(),1);
    assert.ok(privateRequests.every(url=>url.startsWith("https://fixture.invalid/storage/v1/object/sign/media/")));
    const geometry=await page.evaluate(()=>({
     scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
     cards:[...document.querySelectorAll(".journeyTrip")].map(card=>{
      const media=card.querySelector(".journeyMedia"),body=card.querySelector(".journeyContent"),m=media.getBoundingClientRect(),b=body.getBoundingClientRect();
      return {ratio:m.width/m.height,mediaBeforeBody:m.bottom<=b.top+1,button:!!body.querySelector(".tripOpen"),right:card.getBoundingClientRect().right};
     })
    }));
    assert.ok(geometry.scrollWidth<=width+1,"No Android overflow: "+JSON.stringify(geometry));
    assert.ok(geometry.cards.every(x=>Math.abs(x.ratio-16/9)<.02&&x.mediaBeforeBody&&x.button&&x.right<=width+1));
    if(width===360){
     await page.locator("#tripListToolbar").evaluate(bar=>{bar.style.position="static"});
     await page.locator(".completedTripsList").screenshot({path:path.join(dir,"liste-trois-cartes-360.png"),animations:"disabled"});
     await page.locator("#tripListToolbar").evaluate(bar=>bar.style.removeProperty("position"));
     await page.locator(".upcomingTripsSection").screenshot({path:path.join(dir,"carte-a-venir-360.png"),animations:"disabled"});
    }
    const labels=()=>page.locator(".completedTripsList .journeyCountry").allTextContents();
    assert.deepEqual(await labels(),["France","Sénégal","Guinée"]);
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="oldest"]').click();
    assert.deepEqual(await labels(),["Guinée","Sénégal","France"]);
    assert.equal(await page.evaluate(()=>localStorage.getItem("jyetais.trip.sort.v1")),"oldest");
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="country"]').click();
    assert.deepEqual(await labels(),["France","Guinée","Sénégal"]);
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    assert.deepEqual(await labels(),["France","Guinée","Sénégal"],"Country sort survives reload");
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="recent"]').click();
    assert.deepEqual(await labels(),["France","Sénégal","Guinée"]);
    await page.locator("#tripListFilter").click();
    assert.equal(await page.locator("#filterPanel").getAttribute("aria-hidden"),"false");
    await page.locator("#closeFilters").click();
    await page.evaluate(()=>{
     const bar=document.querySelector("#tripListToolbar");
     window.scrollTo(0,window.scrollY+bar.getBoundingClientRect().top+220);
    });
    await page.waitForTimeout(100);
    const sticky=await page.locator("#tripListToolbar").evaluate(el=>({top:el.getBoundingClientRect().top,position:getComputedStyle(el).position}));
    assert.equal(sticky.position,"sticky");
    assert.ok(sticky.top>=-1&&sticky.top<40,"Sticky toolbar should remain at top: "+JSON.stringify(sticky));
    if(width===360)await page.screenshot({path:path.join(dir,"barre-collee-defilement-360.png"),animations:"disabled"});
    const before=privateRequests.length;
    await page.evaluate(()=>{
     showOfflineCopy({ownerId:"22222222-2222-4222-8222-222222222222",
      profile:{display_name:"Voyageuse Fictive",country_of_residence:"GN",home_city:"Conakry"},
      trips:window.__excursionFixture.rows.map(t=>({...t})),activities:[],updatedAt:"2026-11-16T12:00:00Z"});
    });
    assert.equal(await page.locator(".journeyPhotoCount").count(),0,"No photo badge offline");
    assert.equal(await page.locator('img[data-is-private="true"]').count(),0);
    assert.equal(await page.locator('.journeyBackdrop[src*="/storage/v1/object/sign/"]').count(),0);
    assert.equal(privateRequests.length,before,"Offline list never requests private images");
    assert.ok(await page.locator(".journeyBackdrop").count()>=1,"Offline fallback uses public illustration");
    assert.deepEqual(errors,[],"No JS page errors");
    console.log("PASS premium cards Android "+width+"px — visuals, sorting, sticky, photo privacy, offline");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
