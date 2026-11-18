"use strict";
// Real /travel/ in Chromium. No production data, auth token or network storage.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const DIR=path.resolve("test-artifacts/trip-premium");
const UID="22222222-2222-4222-8222-222222222222";
const IDS=["77777777-7777-4777-8777-777777777771",
 "77777777-7777-4777-8777-777777777772",
 "77777777-7777-4777-8777-777777777773",
 "77777777-7777-4777-8777-777777777774"];
function seeded(){
 const uid="22222222-2222-4222-8222-222222222222";
 const rows=window.__excursionFixture.rows,stops=window.__excursionFixture.stops;
 const ids=["77777777-7777-4777-8777-777777777771","77777777-7777-4777-8777-777777777772",
 "77777777-7777-4777-8777-777777777773","77777777-7777-4777-8777-777777777774"];
 rows[0].cover_media_id=ids[0];rows[0].airline="Compagnie fictive";rows[0].hotel="Hôtel fictif";
 rows[0].companions="NEVER_DRAW_COMPANION";rows[0].note="NEVER_DRAW_PRIVATE_NOTE";
 rows[0].phone="NEVER_DRAW_PHONE";rows[0].email="NEVER_DRAW_EMAIL";
 rows[0].miles="NEVER_DRAW_MILES";rows[0].nationality="NEVER_DRAW_NATIONALITY";
 const tripId=rows[0].id;
 stops.push({id:"88888888-8888-4888-8888-888888888881",trip_id:tripId,user_id:uid,
  country_code:"DE",cities:["Berlin"],entry_date:"2026-11-12",exit_date:"2026-11-13",position:1});
 const photos=ids.map((id,i)=>({id,storage_path:"fictional/trip/photo-"+i+".webp",
  caption:"Légende fictive "+i,trip_id:tripId,user_id:uid,
  activity_id:i<2?"99999999-9999-4999-8999-99999999999"+(i+1):null,
  width:i===1?1700:800,height:i===1?900:1200}));
 const activities=[
 {id:"99999999-9999-4999-8999-999999999991",trip_id:tripId,user_id:uid,
  title:"Promenade fictive",place:"Centre-ville",happened_on:"2026-11-12",duration_days:1},
 {id:"99999999-9999-4999-8999-999999999992",trip_id:tripId,user_id:uid,
  title:"Visite fictive",place:"Musée imaginaire",happened_on:"2026-11-13",duration_days:1}
 ];
 window.__premiumFixture={rows,photos,activities,signs:[],requests:[]};
 const create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),original=client.from.bind(client);
  client.from=table=>{
   if(table==="profiles"){
    const q={select(){return q},eq(){return q},single(){return Promise.resolve({
     data:{display_name:"Voyageuse Fictive",country_of_residence:"GN",home_city:"Conakry",
      access_until:location.search.includes("readonly")?"2020-01-01":"2099-12-31",deleting:false,avatar_id:null},
     error:null})}};
    return q;
   }
   if(table!=="media"&&table!=="activities")return original(table);
   const filters=[];
   const q={select(){return q},eq(key,value){filters.push([key,value]);return q},
    order(){return Promise.resolve({data:fetchRows(),error:null})},
    then(ok,fail){return Promise.resolve({data:fetchRows(),error:null}).then(ok,fail)}
   };
   function fetchRows(){
    window.__premiumFixture.requests.push({table,filters});
    if(filters.some(([k,v])=>k==="user_id"&&v!==uid))return [];
    const collection=table==="media"?photos:activities;
    const match=filters.find(([k])=>k==="trip_id")?.[1];
    return collection.filter(p=>!match||p.trip_id===match).map(row=>({...row}));
   }
   return q;
  };
  client.storage.from=()=>({createSignedUrl:async url=>{
   window.__premiumFixture.signs.push(url);
   return {data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/"+
    encodeURIComponent(url.split("/").at(-1))+"?token=SYNTHETIC_TEST"},error:null};
  }});
  return client;
 };
}
const colorSvg=(i)=>{
 const fills=["#b0c8b5","#a0aeba","#b8c6a5","#c2bca8"];
 return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">'+
 '<rect width="800" height="500" fill="'+fills[i%fills.length]+'"/>'+
 '<path d="M0 360 Q200 110 450 290 T800 230 L800 500 H0" fill="#49785a"/>'+
 '<circle cx="630" cy="115" r="58" fill="#f8e9c6"/></svg>';
};
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:820},isMobile:true,
    hasTouch:true,acceptDownloads:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[],storageRequests=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",
     body:"("+fictionalSupabase.toString()+")();("+seeded.toString()+")();"});
    if(url.hostname==="fixture.invalid"){
     storageRequests.push(url.href);
     return route.fulfill({status:200,contentType:"image/svg+xml",
      headers:{"access-control-allow-origin":"*"},body:colorSvg(storageRequests.length-1)});
    }
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   const base="http://127.0.0.1:"+server.address().port+"/travel/";
   try{
    await page.goto(base,{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#trips .tripOpen").first().waitFor();
    const journey=page.locator("#trips .journeyTrip").filter({hasText:"France"});
    await journey.scrollIntoViewIfNeeded();
    // The homepage may independently sign its cover on intersection. Wait for
    // that unrelated request before measuring the detail's two-photo budget.
    await page.waitForFunction(()=>window.__premiumFixture.signs.length>=1);
    const before=await page.evaluate(()=>window.__premiumFixture.signs.length);
    await journey.locator(".tripOpen").click();
    await page.locator("#tripDetailModal.open").waitFor();
    await page.waitForFunction(()=>document.querySelectorAll("#detailPhotos .detailPhoto").length===4);
    const initial=await page.evaluate(()=>window.__premiumFixture.signs.length);
    assert.ok(initial-before<=2,"At most two private signatures when opening: "+(initial-before));
    assert.equal((await page.locator("#detailStats").innerText()).replace(/\s+/g," ").trim(),
      "11 jours · 2 villes · 4 photos");
    assert.equal(await page.locator("#detailCountryTitle").innerText(),"France");
    assert.equal(await page.locator("#detailSlideshowOpen").innerText(),"Revivre");
    assert.equal(await page.locator("#detailSlideshowOpen").isVisible(),true,"2+ photos: Revivre visible");
    assert.equal(await page.locator("#detailSlideshowOpen").isEnabled(),true,"2+ photos: Revivre enabled");
    await page.locator("#detailSlideshowOpen").click();
    await page.locator("#detailSlideshow.open").waitFor();
    assert.equal(await page.locator("#slideCounter").innerText(),"1/4","2+ photos: existing slideshow");
    await page.locator("#detailSlideshowClose").click();
    const actions=await page.locator("#detailSlideshowOpen,#detailShare").evaluateAll(
      nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
    if(width===360)assert.ok(actions.every(a=>a.bottom<=740&&a.top>=0),
      "Revivre et Partager dans le premier écran 360×740");
    assert.equal(await page.locator("#detailFeatured .albumMoment").count(),2);
    const layout=await page.evaluate(()=>{
      const ids=["detailStats","detailFeaturedSection","detailItinerarySection","detailFacts",
        "detailTimelineDisclosure","detailPelliculeSection"];
      return ids.map(id=>({id,index:[...document.querySelector("#detailSheet").children].indexOf(document.getElementById(id))}));
    });
    assert.ok(layout.every((e,i)=>e.index>=0&&(!i||e.index>layout[i-1].index)),
      "Album section order: chiffres, moments, itinéraire, infos pratiques, jour par jour, pellicule: "+JSON.stringify(layout));
    const practical=await page.locator("#detailFacts .detailStay,#detailFacts .detailCompanions").evaluateAll(nodes=>
      nodes.map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
    assert.equal(practical.length,3,"Compagnie, hôtel, voyagé avec");
    for(const card of practical)assert.ok(card.left>=15.9&&card.right<=width-15.9,
      "Practical cards need >=16px lateral inset at "+width+": "+JSON.stringify(card));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
      "Practical cards must not create horizontal overflow");
    const contrast=await page.locator("#detailLifecycle").evaluate(el=>{
      const c=getComputedStyle(el),rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
      const luminance=s=>rgb(s).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4})
       .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const a=luminance(c.color),b=luminance(c.backgroundColor);
      return {label:el.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
    assert.equal(contrast.label,"En cours","Badge must show the ongoing state");
    assert.ok(contrast.ratio>=4.5,"Ongoing badge text contrast must be >=4.5:1: "+JSON.stringify(contrast));
    assert.equal(await page.locator("#detailPellicule .albumTile").count(),4);
    assert.equal(await page.locator("#detailPellicule .albumTile-portrait").count()>0,true);
    assert.equal(await page.locator("#detailPellicule .albumTile-landscape").count()>0,true);
    assert.match(await page.locator("#detailIntro").innerText(),/2026/);
    assert.match(await page.locator("#detailStops").innerText(),/Allemagne/);
    assert.match(await page.locator("#detailActivities").textContent(),/Promenade fictive/);
    assert.match(await page.locator("#detailNote").innerText(),/NEVER_DRAW_PRIVATE_NOTE/);
    for(const id of ["detailStopsSection","detailNoteSection"])
     assert.equal(await page.locator("#"+id).isVisible(),true);
    assert.equal(await page.locator("#detailActivitiesSection").isVisible(),false,"Timeline repliée en lecture");
    await page.locator("#detailTimelineDisclosure summary").click();
    assert.equal(await page.locator("#detailActivitiesSection").isVisible(),true,"Chronologie accessible");
    await page.locator("#detailTimelineDisclosure summary").click();
    assert.equal(await page.locator("#detailFacts .detailStay").count(),2);
    assert.equal(await page.locator("#detailFacts .detailCompanions").count(),1);
    // Reading mode is default; in-progress trips still offer "Ajouter un moment".
    assert.equal((await page.locator("#detailModeToggle").innerText()).trim(),"Modifier ce voyage");
    for(const id of ["detailEdit","addTripStop","detailActivityToggle"])
     assert.equal(await page.locator("#"+id).isVisible(),false,"Reading-mode action must be hidden: "+id);
    assert.equal(await page.locator(".tripStopActions button").count(),0);
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),0);
    assert.equal(await page.locator("#detailAddMoment").isVisible(),true,"Ongoing trip add moment in reading mode");
    if(width===360||width===390){
     await page.locator("#detailSheet").evaluate(el=>el.scrollTop=0);
     await page.screenshot({path:path.join(DIR,"fiche-galerie-"+width+".png"),animations:"disabled"});
     await page.locator("#detailStopsSection").screenshot({
      path:path.join(DIR,"fiche-etapes-"+width+".png"),animations:"disabled"});
     await page.locator("#detailFeaturedSection").screenshot({
      path:path.join(DIR,"fiche-moments-"+width+".png"),animations:"disabled"});
     if(width===390){
      await page.locator("#detailPellicule").scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>{
       const r=document.querySelector("#detailPellicule").getBoundingClientRect();
       return r.top<innerHeight&&r.bottom>0;
      });
      await page.locator("#detailPelliculeSection").screenshot({
       path:path.join(DIR,"mosaique-portrait-paysage-390.png"),animations:"disabled"});
     }
    }
    await page.locator("#detailModeToggle").click();
    assert.equal((await page.locator("#detailModeToggle").innerText()).trim(),"Terminé");
    if(width===390)await page.screenshot({path:path.join(DIR,"mode-modification-390.png"),animations:"disabled"});
    for(const id of ["detailEdit","addTripStop","detailActivityToggle","detailAddMoment"])
     assert.equal(await page.locator("#"+id).isVisible(),true,"Edit mode should reveal "+id);
    assert.equal(await page.locator(".tripStopActions button").count(),2);
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),2);
    await page.locator(".tripStopActions").getByRole("button",{name:"Modifier"}).click();
    assert.equal(await page.locator("#tripStopForm").isVisible(),true);
    await page.locator("#tripStopCancel").click();
    await page.locator(".tripStopActions").getByRole("button",{name:"Supprimer"}).click();
    assert.equal(await page.locator("#tripStopDeleteConfirm").isVisible(),true);
    await page.locator("#tripStopDeleteNo").click();
    await page.evaluate(()=>{window.__prompted=false;window.confirm=()=>{window.__prompted=true;return false}});
    await page.locator("#detailActivities .detailRemoveActivity").first().click();
    assert.equal(await page.evaluate(()=>window.__prompted),true,"Retirer triggers confirmation");
    await page.locator("#detailActivityToggle").click();
    assert.equal(await page.locator("#detailTimelineDisclosure").evaluate(el=>el.open),true,
     "Edit mode: Ajouter un moment must expand the day-by-day disclosure");
    assert.equal(await page.locator("#detailActivityForm").isVisible(),true);
    await page.locator("#detailModeToggle").click();
    assert.equal((await page.locator("#detailModeToggle").innerText()).trim(),"Modifier ce voyage");
    assert.equal(await page.locator("#detailActivityForm").isVisible(),false);
    for(const id of ["detailEdit","addTripStop","detailActivityToggle"])
     assert.equal(await page.locator("#"+id).isVisible(),false,"Done returns to reading: "+id);
    assert.equal(await page.locator(".tripStopActions button").count(),0);
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),0);
    assert.equal(await page.locator("#detailAddMoment").isVisible(),true);
    await page.locator("#detailPellicule .albumTilePhoto").nth(1).click();
    await page.locator("#detailLightbox.open").waitFor();
    assert.match(await page.locator("#detailLightboxCaption").innerText(),/Légende fictive 1/);
    await page.locator("#detailLightboxClose").click();
    assert.equal(await page.locator("#detailLightbox").isVisible(),false);
    await page.evaluate(()=>{
      window.__premiumShared=null;
      Object.defineProperty(navigator,"canShare",{configurable:true,
       value:x=>Array.isArray(x.files)&&x.files[0]?.type==="image/png"});
      Object.defineProperty(navigator,"share",{configurable:true,
       value:x=>{window.__premiumShared={type:x.files[0].type,size:x.files[0].size,
        isFile:x.files[0] instanceof File,active:navigator.userActivation.isActive};
        return Promise.resolve()}});
    });
    await page.locator("#detailShare").click();
    await page.locator("#detailShareDialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#detailShareSend").isVisible(),true);
    const preview=await page.locator("#detailSharePreview").evaluate(img=>({
     width:img.naturalWidth,height:img.naturalHeight,complete:img.complete
    }));
    assert.equal(preview.width,1080);
    assert.equal(preview.height,1350);
    await page.locator("#detailShareSend").click();
    const shared=await page.evaluate(()=>window.__premiumShared);
    assert.ok(shared?.isFile&&shared.type==="image/png"&&shared.size>1000,"Share must contain a real PNG File");
    assert.equal(shared.active,true,"navigator.share must be invoked within button's gesture");
    if(width===360){
     const downloadEvent=page.waitForEvent("download");
     await page.locator("#detailShareSave").click();
     const download=await downloadEvent;
     const target=path.join(DIR,"partager-voyage-1080x1350.png");
     await download.saveAs(target);
     const bytes=await fs.readFile(target);
     assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
     assert.equal(bytes.readUInt32BE(16),1080);
     assert.equal(bytes.readUInt32BE(20),1350);
     await page.screenshot({path:path.join(DIR,"apercu-partage-360.png"),animations:"disabled"});
    }
    await page.locator("#detailShareClose").click();
    await page.locator("#detailClose").click();
    if(width===390){
     await page.evaluate(()=>{
      window.__premiumFixture.albumBackup=window.__premiumFixture.photos.slice();
      window.__premiumFixture.photos.splice(0);
     });
     await journey.locator(".tripOpen").click();
     await page.locator("#detailNoPhotoAdd").waitFor({state:"visible"});
     const noPhotoActions=await page.locator("#detailNoPhotoAdd,#detailShare").evaluateAll(nodes=>
      nodes.map(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);
       return {id:el.id,left:r.left,right:r.right,top:r.top,height:r.height,
        background:c.backgroundColor,color:c.color,visible:r.width>0&&r.height>0}}));
     assert.equal(noPhotoActions.length,2);
     assert.ok(noPhotoActions.every(a=>a.visible&&a.height>=44),
      "0 photo: primary Add and secondary Share must both be visible and >=44px");
     assert.ok(Math.abs(noPhotoActions[0].top-noPhotoActions[1].top)<=1&&
      Math.abs(noPhotoActions[0].height-noPhotoActions[1].height)<=1&&
      noPhotoActions[0].right<noPhotoActions[1].left,
      "0 photo: Add and Share must align side by side with same height");
     assert.notEqual(noPhotoActions[0].background,noPhotoActions[1].background,
      "0 photo: Add primary filled, Share secondary outlined");
     // Online reading mode: moments without ANY linked photo must keep
     // the day-by-day summary visible after asynchronous activity loading.
     await page.locator("#detailTimelineDisclosure summary").waitFor({state:"visible"});
     assert.equal(await page.locator("#detailTimelineDisclosure").evaluate(el=>el.open),false,
      "Day-by-day remains collapsed by default with unphotographed moments");
     assert.equal(await page.locator("#detailActivities .detailActivity").count(),2,
      "Two existing moments are accessible despite zero linked photos");
     assert.equal(await page.locator("#detailSlideshowOpen").isVisible(),false,"0 photo: Revivre hidden");
     assert.equal(await page.locator("#detailSlideshowOpen").isEnabled(),true,"0 photo: never disabled");
     assert.equal(await page.locator("#detailFeaturedSection").isVisible(),false);
     await page.screenshot({path:path.join(DIR,"album-0-photo-390.png"),animations:"disabled"});
     await page.locator("#detailClose").click();
     await page.evaluate(()=>{
      window.__premiumFixture.photos.push(window.__premiumFixture.albumBackup[2]);
     });
     await journey.locator(".tripOpen").click();
     await page.waitForFunction(()=>document.querySelectorAll("#detailPellicule .albumTile").length===1);
     assert.match((await page.locator("#detailStats").innerText()).replace(/\s+/g," "),/1 photo(?!s)/,
      "1 photo must use singular");
     assert.equal(await page.locator("#detailSlideshowOpen").isVisible(),true,"1 photo: Revivre visible");
     assert.equal(await page.locator("#detailSlideshowOpen").isEnabled(),true,"1 photo: Revivre enabled");
     await page.locator("#detailSlideshowOpen").click();
     await page.locator("#detailLightbox.open").waitFor();
     assert.match(await page.locator("#detailLightboxCaption").innerText(),/Légende fictive 2/);
     assert.equal(await page.locator("#detailSlideshow").isVisible(),false,"1 photo: viewer, not slideshow");
     await page.locator("#detailLightboxClose").click();
     assert.equal(await page.locator("#detailFeaturedSection").isVisible(),false);
     await page.screenshot({path:path.join(DIR,"album-1-photo-390.png"),animations:"disabled"});
     await page.locator("#detailClose").click();
     await page.evaluate(()=>{
      window.__premiumFixture.photos.push(window.__premiumFixture.albumBackup[3]);
     });
     await journey.locator(".tripOpen").click();
     await page.waitForFunction(()=>document.querySelectorAll("#detailPellicule .albumTile").length===2);
     assert.match((await page.locator("#detailStats").innerText()).replace(/\s+/g," "),/2 photos/,
      "2 photos must use plural");
     assert.equal(await page.locator("#detailSlideshowOpen").isEnabled(),true,"2 photos: Revivre enabled");
     await page.locator("#detailSlideshowOpen").click();
     await page.locator("#detailSlideshow.open").waitFor();
     assert.equal(await page.locator("#slideCounter").innerText(),"1/2","2 photos: slideshow");
     await page.locator("#detailSlideshowClose").click();
     await page.locator("#detailClose").click();
     await page.evaluate(()=>{
      window.__premiumFixture.photos.splice(0,...window.__premiumFixture.photos);
      window.__premiumFixture.photos.push(...window.__premiumFixture.albumBackup);
      window.__premiumFixture.rows[0].title="Un voyage extraordinaire dont je me souviendrai longtemps";
      const trip=trips.find(t=>t.id===window.__premiumFixture.rows[0].id);
      if(trip)trip.title=window.__premiumFixture.rows[0].title;
     });
     await journey.locator(".tripOpen").click();
     await page.waitForFunction(()=>document.querySelector("#detailCountryTitle")?.textContent.includes("extraordinaire"));
     await page.screenshot({path:path.join(DIR,"album-titre-long-390.png"),animations:"disabled"});
     await page.locator("#detailClose").click();
     await page.evaluate(()=>{window.__premiumFixture.rows[0].title=null});
    }
    await page.evaluate(()=>showOfflineCopy({
     ownerId:"22222222-2222-4222-8222-222222222222",
     profile:{display_name:"Voyageuse Fictive",country_of_residence:"GN",home_city:"Conakry"},
     trips:window.__premiumFixture.rows,activities:window.__premiumFixture.activities,updatedAt:"2026-11-16T12:00:00Z"
    }));
    const offlineCount=storageRequests.length;
    await page.locator("#trips .journeyTrip").filter({hasText:"France"}).locator(".tripOpen").click();
    await page.locator("#tripDetailModal.open").waitFor();
    assert.equal(await page.locator("#detailModeToggle").isVisible(),false);
    assert.equal(await page.locator("#detailShare").isDisabled(),true);
    assert.match(await page.locator("#detailShareHelp").innerText(),/Photos disponibles avec une connexion/);
    assert.equal(await page.locator("#detailPhotos .detailHeroFallback").count(),1);
    assert.equal(await page.locator("#detailPhotos img[data-is-private]").count(),0);
    assert.equal(await page.locator("#detailEdit").isVisible(),false);
    assert.equal(await page.locator("#detailActivityToggle").isVisible(),false);
    assert.equal(await page.locator("#addTripStop").isVisible(),false);
    assert.equal(storageRequests.length,offlineCount,"Offline must never request private images");
    const geom=await page.evaluate(()=>({
     doc:document.documentElement.scrollWidth,viewport:innerWidth,
     sheet:document.querySelector("#detailSheet").getBoundingClientRect(),
     hero:document.querySelector(".detailHero").getBoundingClientRect()
    }));
    assert.ok(geom.doc<=width+1&&geom.sheet.left>=-1&&geom.sheet.right<=width+1);
    assert.ok(Math.abs(geom.hero.height-Math.min(820*.62,540))<4,"Hero should be ~62% of viewport height");
    await page.locator("#detailClose").click();
    await page.goto(base+"?readonly=1",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#trips .journeyTrip").filter({hasText:"France"}).locator(".tripOpen").click();
    await page.locator("#tripDetailModal.open").waitFor();
    for(const id of ["detailModeToggle","detailEdit","detailActivityToggle","detailAddMoment","addTripStop"])
     assert.equal(await page.locator("#"+id).isVisible(),false,"Read-only editing button "+id);
    await page.waitForFunction(()=>document.querySelectorAll("#detailActivities .detailActivity").length>0);
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),0);
    assert.deepEqual(errors,[],"No JavaScript errors");
    console.log("PASS album P0 Android "+width+" px: 62svh cover, featured, mosaic, viewer, share, offline");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
