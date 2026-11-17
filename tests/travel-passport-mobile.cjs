"use strict";
// Android 320/360/390 with fictional-only authenticated data, private test image URLs.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const out=path.resolve("test-artifacts/passport-slideshow");
const photoSvg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080"><rect width="720" height="1080" fill="#204b39"/><circle cx="360" cy="490" r="190" fill="#bb954e"/></svg>';
const patch=String.raw`
(function(){
 const origin=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=origin(...args),oldFrom=client.from.bind(client),uid="22222222-2222-4222-8222-222222222222";
  const fixture=window.__excursionFixture;
  // The mocked fixture has only synthetic names, travel dates and countries.
  fixture.rows.push(
   {id:"aaaa0000-0000-4000-8000-000000000001",country_code:"GN",cities:["Kindia"],
    entry_date:"2026-01-01",exit_date:"2026-01-04",duration_days:4,purpose:"tourisme",is_domestic:true,deleting:false},
   {id:"aaaa0000-0000-4000-8000-000000000002",country_code:"JP",cities:["Tokyo"],
    entry_date:"2026-03-01",exit_date:"2026-03-05",duration_days:5,purpose:"tourisme",is_domestic:false,deleting:false},
   {id:"aaaa0000-0000-4000-8000-000000000003",country_code:"US",cities:["New York"],
    entry_date:"2026-04-01",exit_date:"2026-04-06",duration_days:6,purpose:"tourisme",is_domestic:false,deleting:false},
   {id:"aaaa0000-0000-4000-8000-000000000004",country_code:"SN",cities:["Dakar"],
    entry_date:"2026-06-01",exit_date:"2026-06-06",duration_days:6,purpose:"tourisme",is_domestic:false,deleting:false}
  );
  const mediaRows=Array.from({length:3},(_,i)=>({
   id:"test-photo-"+i,user_id:uid,trip_id:"11111111-1111-4111-8111-111111111111",
   storage_path:uid+"/trip-"+(i+1)+".webp",caption:"Photo fictive "+(i+1),
   created_at:"2026-11-08T10:00:0"+i+"Z",is_favorite:false
  }));
  window.__passportFixture={mediaRows,signedPaths:[]};
  client.from=table=>{
   if(table!=="media")return oldFrom(table);
   const where=[];
   const q={
    select(){return q},eq(k,v){where.push([k,v]);return q},order(){return q},range(){return q},
    then(ok,fail){return Promise.resolve({data:mediaRows.filter(r=>where.every(([k,v])=>r[k]===v)),error:null}).then(ok,fail)}
   };
   return q;
  };
  client.storage.from=()=>({createSignedUrl:async p=>{
   window.__passportFixture.signedPaths.push(p);
   return {data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/"+encodeURIComponent(p)+"?token=fake"},error:null};
  }});
  return client;
 };
})();`;
async function main(){
 await fs.mkdir(out,{recursive:true});
 const server=serve();await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const ctx=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await ctx.newPage(),errors=[],external=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="127.0.0.1"&&u.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",
     body:"("+fictionalSupabase.toString().replace('country_of_residence:"GN",','home_city:"Conakry",country_of_residence:"GN",')+")();"+patch});
    if(u.hostname==="fixture.invalid"&&u.pathname.startsWith("/storage/v1/object/sign/media/"))
     return route.fulfill({status:200,contentType:"image/svg+xml",headers:{"cache-control":"no-store"},body:photoSvg});
    if(u.hostname==="127.0.0.1")return route.continue();
    external.push(u.href);return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.waitForFunction(()=>document.querySelector("#continentCount")?.textContent==="4 continents");
    await page.evaluate(()=>document.fonts.ready);
    const hero=page.locator("#travelHero");
    const snap=await page.evaluate(()=>{
     const get=id=>document.getElementById(id);
     const hero=get("travelHero"),title=get("dashboardTitle"),code=get("passportResidenceCode"),badge=get("continentCount");
     const stats=["nt","nc","nd"].map(id=>Number(get(id).textContent));
     return {scroll:document.documentElement.scrollWidth,innerWidth,
      heroTop:hero.getBoundingClientRect().top,
      heroLeft:hero.getBoundingClientRect().left,heroRight:hero.getBoundingClientRect().right,
      heroBg:getComputedStyle(hero).backgroundColor,
      titleFont:getComputedStyle(title).fontFamily,
      stats,code:code.textContent,codeVisible:!code.hidden,
      location:get("travelerLocationText").textContent,continent:badge.textContent,
      tiles:[...get("secondaryActions").children].map(b=>b.innerText)};
    });
    assert.equal(snap.code,"GN");
    assert.equal(snap.codeVisible,true);
    assert.equal(snap.location,"Conakry, Guinée");
    assert.match(snap.titleFont,/Poppins/);
    assert.equal(snap.continent,"4 continents");
    assert.ok(Math.abs(snap.heroLeft)<=1,"Passport must touch viewport left "+width+": "+JSON.stringify(snap));
    assert.ok(Math.abs(snap.heroRight-snap.innerWidth)<=1,
      "Passport must touch viewport right "+width+": "+JSON.stringify(snap));
    assert.equal(snap.scroll,snap.innerWidth,"No horizontal overflow at "+width+"px");
    assert.equal(snap.tiles.length,2);
    assert.match(snap.tiles[0],/Mon carnet/);
    assert.match(snap.tiles[1],/PDF ambassade/);
    assert.doesNotMatch(snap.tiles.join(" "),/Officiel|Attestation|Certifié/i);
    assert.ok(snap.stats[0]>=1&&snap.stats[1]>=1,"Keep original visited stats");
    assert.equal(await page.locator("#pdf").isDisabled(),false);
    if(width===360){
     await page.locator("#travelHero").screenshot({path:path.join(out,"360-entete-passeport.png"),animations:"disabled"});
     await page.locator("#travelMapPanel").screenshot({path:path.join(out,"360-carte-continents.png"),animations:"disabled"});
     await page.locator("#homeActions").screenshot({path:path.join(out,"360-tuiles-actions.png"),animations:"disabled"});
    }
    // Selecting a country must filter ONLY map/routes, trip cards and list summary.
    // Header totals and continent badge stay global, in the installed-sized viewport.
    const startingList=await page.locator("#trips .journeyTrip").count();
    assert.ok(startingList>1,"Fixture must contain multiple destinations");
    await page.waitForFunction(()=>document.querySelectorAll("#map .flightArc").length>=1,
      null,{timeout:20000});
    await page.locator('#countryList .countryChip[data-country="SN"]').click();
    await page.waitForFunction(()=>
      document.querySelector('#countryList .countryChip[data-country="SN"]')?.getAttribute("aria-pressed")==="true"&&
      document.querySelectorAll("#map .flightArc").length===1,null,{timeout:20000});
    const selected=await page.evaluate(()=>({
      stats:["nt","nc","nd"].map(id=>Number(document.getElementById(id).textContent)),
      continent:document.getElementById("continentCount").textContent,
      list:document.getElementById("tripListSummary").textContent,
      countries:[...document.querySelectorAll("#trips .journeyTrip")].map(card=>card.textContent),
      routes:document.querySelectorAll("#map .flightArc").length,
      scroll:document.documentElement.scrollWidth,innerWidth:window.innerWidth,
      left:document.getElementById("travelHero").getBoundingClientRect().left,
      right:document.getElementById("travelHero").getBoundingClientRect().right
    }));
    assert.deepEqual(selected.stats,snap.stats,"Country filter must NOT change passport totals at "+width);
    assert.equal(selected.continent,snap.continent,"Continent total must stay global");
    assert.equal(selected.list,"1 voyage · 1 pays","Trip list summary must reflect Sénégal");
    assert.equal(selected.countries.length,1,"Only Sénégal is shown in the trip cards");
    assert.match(selected.countries[0],/Sénégal/);
    assert.equal(selected.routes,1,"Only the selected destination flight route should remain");
    assert.ok(Math.abs(selected.left)<=1&&Math.abs(selected.right-selected.innerWidth)<=1,
      "The passport must stay edge-to-edge with an active filter at "+width);
    assert.equal(selected.scroll,selected.innerWidth,"No overflow while a filter is active");
    if(width===360){
     await hero.screenshot({path:path.join(out,"360-entete-filtre-senegal.png"),animations:"disabled"});
     await page.screenshot({path:path.join(out,"360-page-filtre-senegal.png"),fullPage:true,animations:"disabled"});
    }
    await page.locator('#countryList .countryChip[data-country="SN"]').click();
    await page.waitForFunction(()=>document.querySelector('#countryList .countryChip[data-country="SN"]')?.getAttribute("aria-pressed")==="false");
    assert.deepEqual(await page.evaluate(()=>
      ["nt","nc","nd"].map(id=>Number(document.getElementById(id).textContent))),snap.stats,
      "Deselecting Sénégal must also keep global passport totals");
    assert.equal(await page.locator("#trips .journeyTrip").count(),startingList,
      "Clearing the country filter restores the complete trip list");
    await page.locator("#pdf").click();
    assert.equal(await page.locator("#pdfDialog").isVisible(),true,"PDF consent remains");
    await page.locator("#pdfDialogClose").click();
    await page.locator("#trips .journeyTrip").filter({hasText:"France"}).first().locator(".tripOpen").click();
    await page.locator("#tripDetailModal.open").waitFor();
    await page.waitForFunction(()=>document.querySelector("#detailSlideshowOpen")?.hidden===false);
    assert.equal(await page.locator("#detailSlideshowOpen").isEnabled(),true);
    const initially=await page.evaluate(()=>window.__passportFixture.signedPaths.length);
    assert.ok(initially<=3,"Initial photo signing budget, got "+initially);
    await page.locator("#detailSlideshowOpen").click();
    await page.locator("#detailSlideshow.open").waitFor();
    assert.equal(await page.locator("#slideCounter").innerText(),"1/3");
    await page.locator("#slideImageBox img").waitFor();
    assert.match(await page.locator("#slideCaption").innerText(),/Photo fictive/);
    if(width===360)await page.screenshot({path:path.join(out,"360-diaporama.png"),animations:"disabled"});
    await page.locator("#slideStage").click();
    assert.equal(await page.locator("#slideStatus").innerText(),"En pause");
    await page.locator("#slideStage").click();
    assert.equal(await page.locator("#slideStatus").innerText(),"Lecture");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(()=>document.querySelector("#slideCounter")?.textContent==="2/3");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#detailSlideshow").isVisible(),false);
    await page.locator("#detailClose").click();
    assert.deepEqual(errors,[],"Browser errors "+width+": "+JSON.stringify(errors));
    assert.deepEqual(external,[],"Unexpected external request "+width);
    console.log("PASS passport "+width+"px: private hero, visited continents, tiles, slideshow and keyboard");
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
