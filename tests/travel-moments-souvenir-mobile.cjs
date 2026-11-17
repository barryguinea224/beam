"use strict";
// Actual /travel/ PWA, on fictional data only. No live Supabase access.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const DIR=path.resolve("test-artifacts/travel-moments-souvenir");
function seedMoments(){
 const uid="22222222-2222-4222-8222-222222222222";
 const data=window.__excursionFixture,trip=data.rows[0];
 trip.entry_date="2026-08-05";trip.exit_date="2026-08-15";trip.duration_days=11;
 trip.note=("Souvenir fictif d'un magnifique voyage au mois d'août. " ).repeat(23);
 trip.airline="Compagnie fictive";
 data.stops.push(
  {id:"33333333-3333-4333-8333-333333333331",trip_id:trip.id,user_id:uid,
   country_code:"DE",cities:["Berlin"],entry_date:"2026-08-06",exit_date:"2026-08-07",position:1},
  {id:"33333333-3333-4333-8333-333333333332",trip_id:trip.id,user_id:uid,
   country_code:"BE",cities:["Bruxelles"],entry_date:"2026-08-08",exit_date:"2026-08-09",position:2}
 );
 const activities=[
  {id:"aaaa1111-aaaa-4111-8111-aaaaaaaaaaaa",trip_id:trip.id,user_id:uid,
   title:"Visite de Paris",place:"Paris",happened_on:"2026-08-09",duration_days:3},
  {id:"aaaa2222-aaaa-4222-8222-aaaaaaaaaaaa",trip_id:trip.id,user_id:uid,
   title:"Moment sans date",place:"",happened_on:null,duration_days:1},
  {id:"aaaa3333-aaaa-4333-8333-aaaaaaaaaaaa",trip_id:trip.id,user_id:uid,
   title:"Première promenade",place:"Paris",happened_on:"2026-08-05",duration_days:1}
 ];
 const create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),prevFrom=client.from.bind(client);
  client.from=table=>{
   if(table!=="activities")return prevFrom(table);
   const filters=[],q={
    select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},
    then(onGood,onBad){const target=filters.find(([k])=>k==="trip_id")?.[1];
     const owner=filters.find(([k])=>k==="user_id")?.[1];
     return Promise.resolve({data:owner===uid&&(!target||target===trip.id)?activities:[],error:null})
      .then(onGood,onBad);}
   };
   return q;
  };
  return client;
 };
}
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390,420]){
   const context=await browser.newContext({viewport:{width,height:820},
    isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",err=>errors.push(err.message));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fictionalSupabase.toString()+")();("+seedMoments.toString()+")();"});
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#trips .journeyTrip").filter({hasText:"France"}).locator(".tripOpen").click();
    await page.locator("#tripDetailModal.open").waitFor();
    await page.waitForFunction(()=>document.querySelectorAll("#detailActivities .detailActivity").length===3 &&
     document.querySelectorAll("#detailStops .tripStopRow").length===2);
    const cards=page.locator("#detailActivities .detailActivity");
    assert.match(await cards.nth(0).innerText(),/Première promenade/);
    assert.match(await cards.nth(1).innerText(),/Visite de Paris/);
    assert.match(await cards.nth(2).innerText(),/Moment sans date/);
    assert.equal((await cards.nth(0).locator(".detailActivityDay").innerText()).trim(),"5");
    assert.equal((await cards.nth(0).locator(".detailActivityMonth").innerText()).trim(),"août");
    assert.match(await cards.nth(1).locator(".detailActivityMeta").innerText(),/Paris · 3 jours/);
    assert.equal((await cards.nth(0).locator(".detailActivityMeta").innerText()).trim(),"Paris",
     "One-day moment shows only its location");
    assert.equal(await cards.nth(2).locator(".detailActivityMeta").count(),0,
     "Undated, unlocated moment must not have a secondary line");
    assert.doesNotMatch(await cards.nth(0).innerText(),/1 jour/,
     "Single-day duration is omitted from moment cards");
    assert.equal(await cards.nth(2).locator("svg[aria-hidden=true]").count(),1);
    assert.equal(await cards.locator("img.detailActivityThumb").count(),0);
    assert.equal(await cards.locator(".detailRemoveActivity").count(),0);
    assert.equal(await page.locator("#detailNoteTitle").innerText(),"Mon souvenir");
    assert.equal(await page.locator("#detailNoteDate").innerText(),
     "Écrit pour le voyage du 5 au 15 août 2026");
    await page.waitForFunction(()=>!document.getElementById("detailNoteToggle").hidden);
    assert.equal(await page.locator("#detailNoteToggle").innerText(),"Lire la suite");
    assert.equal(await page.locator("#detailNote").getAttribute("class").then(x=>x.includes("is-clamped")),true);
    const metrics=await page.evaluate(()=>{
     const modal=document.querySelector("#tripDetailModal"),sheet=document.querySelector("#detailSheet");
     const names=[
      ".detailHeading > #detailCountryTitle",
      "#detailStopsSection > h3","#detailVisaGuide","#detailLoyaltyHint",
      "#detailActivitiesSection > h3",
      "#detailActivities .detailActivity",
      "#detailNoteSection > h3","#detailNoteSection .detailSouvenirCard",
      "#detailBottomActions > #detailModeToggle"
     ];
     const bounds=[];
     for(const selector of names)for(const el of modal.querySelectorAll(selector)){
      if(getComputedStyle(el).display==="none"||el.hidden||!el.getClientRects().length)continue;
      const r=el.getBoundingClientRect(),sr=sheet.getBoundingClientRect();
      bounds.push({selector,left:r.left-sr.left,right:sr.right-r.right});
     }
     const headings=[...modal.querySelectorAll("#detailStopsSection h3,#detailActivitiesSection h3,#detailNoteSection h3")].map(el=>{
      const c=getComputedStyle(el);return {size:c.fontSize,weight:c.fontWeight,family:c.fontFamily};
     });
     const card=modal.querySelector(".detailActivity").getBoundingClientRect();
     const date=modal.querySelector(".detailActivityDate").getBoundingClientRect();
     const note=modal.querySelector("#detailNote"),n=getComputedStyle(note);
     const noteLines=note.clientHeight/parseFloat(n.lineHeight);
     return {bounds,headings,dateWidth:date.width,cardWidth:card.width,
      noteLines,docWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    assert.ok(metrics.docWidth<=width+1,"Page overflows "+JSON.stringify(metrics));
    for(const box of metrics.bounds)
     assert.ok(box.left>=15.9&&box.right>=15.9,
       "Detail content must be >=16px inset at "+width+": "+JSON.stringify(box));
    for(const h of metrics.headings){
     assert.equal(h.size,width<=390?"19px":"21px");assert.equal(h.weight,"600");
     assert.match(h.family,/Poppins/);
    }
    assert.ok(Math.abs(metrics.dateWidth-52)<1);
    const stageGeometry=await page.evaluate(()=>{
     const rows=[...document.querySelectorAll("#detailStops .tripStopRow")];
     return rows.map(row=>{
      const dot=row.querySelector(".tripStopDot"),card=row.querySelector(".tripStopCard"),
       flag=row.querySelector(".tripStopFlag"),marker=row.querySelector(".tripStopMarker");
      if(!dot||!card||!flag||!marker)throw Error("Stage needs separate dot, card, flag");
      const d=dot.getBoundingClientRect(),c=card.getBoundingClientRect(),
       f=flag.getBoundingClientRect(),css=getComputedStyle(marker,"::after");
      const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
      return {clearance:c.left-d.right,inside:f.left-c.left,
       dotCardOverlap:overlap(d,c),dotFlagOverlap:overlap(d,f),
       lineContent:css.content,cardRight:c.right,viewport:innerWidth};
     });
    });
    assert.equal(stageGeometry.length,2);
    for(const stage of stageGeometry){
     assert.ok(stage.clearance>=11.9,"Stage dot/card must be separated by >=12px: "+JSON.stringify(stage));
     assert.ok(stage.inside>=11.9,"Stage flag needs >=12px inset: "+JSON.stringify(stage));
     assert.equal(stage.dotCardOverlap,false,"Stage dot overlaps card");
     assert.equal(stage.dotFlagOverlap,false,"Stage dot overlaps flag");
     assert.ok(stage.cardRight<=width+1,"Stage card overflows viewport");
    }
    assert.notEqual(stageGeometry[0].lineContent,"none","Multiple stages must have a connecting line");
    assert.equal(stageGeometry[1].lineContent,"none","Last stage has no trailing line");
    await page.evaluate(()=>{
     const fixture=window.__excursionFixture,trip=fixture.rows[0];
     window.BEAM_TRIP_STOPS.renderList(document.getElementById("detailStops"),
      {...trip,stops:fixture.stops.slice(0,1)},false);
    });
    assert.equal(await page.locator("#detailStops .tripStopRow").count(),1);
    assert.equal(await page.locator("#detailStops .tripStopMarker").first()
     .evaluate(el=>getComputedStyle(el,"::after").content),"none",
     "A single stage must never draw a connecting line");
    await page.evaluate(()=>{
     const fixture=window.__excursionFixture,trip=fixture.rows[0];
     window.BEAM_TRIP_STOPS.renderList(document.getElementById("detailStops"),
      {...trip,stops:fixture.stops},false);
    });
    assert.ok(metrics.noteLines<=6.05,"Souvenir should be clamped to six lines");
    // A real private photo is shown only if explicitly linked and signed;
    // the same link is rejected offline or from another storage origin.
    const thumbs=await page.evaluate(()=>{
     const d=window.BEAM_TRIP_DETAIL,act=[{id:"linked",title:"Photo liée",happened_on:"2026-08-05"}],
      url="https://fixture.invalid/storage/v1/object/sign/media/test.webp?token=TEST";
     const opts={signedPhotoByActivity:{linked:url},supabaseUrl:"https://fixture.invalid"};
     return {linked:d.activities(act,false,opts),
      offline:d.activities(act,false,{...opts,offline:true}),
      untrusted:d.activities(act,false,{...opts,signedPhotoByActivity:{
       linked:"https://other.invalid/storage/v1/object/sign/media/test.webp?token=TEST"}}),
      single:d.activities(act,false)};
    });
    assert.match(thumbs.linked,/class="detailActivityThumb" loading="lazy"/);
    assert.doesNotMatch(thumbs.offline,/detailActivityThumb/);
    assert.doesNotMatch(thumbs.untrusted,/detailActivityThumb/);
    assert.doesNotMatch(thumbs.single,/detailActivityDate::after/);
    if(width===360){
     // Capture the two sections of the REAL app using only synthetic fixtures.
     await page.evaluate(()=>{
      const a=document.getElementById("detailStopsSection");
      const b=document.getElementById("detailActivitiesSection");
      const marker=document.createElement("span");marker.id="captureMomentsReturn";
      b.before(marker);
      const wrapper=document.createElement("div");
      wrapper.id="captureEtapesMoments";wrapper.style.background="#fff";
      a.before(wrapper);wrapper.append(a,b);
     });
     await page.locator("#captureEtapesMoments").screenshot({
      path:path.join(DIR,"etapes-moments-360.png"),animations:"disabled"});
     await page.evaluate(()=>{
      const wrapper=document.getElementById("captureEtapesMoments");
      const marker=document.getElementById("captureMomentsReturn");
      wrapper.before(wrapper.children[0]);
      marker.replaceWith(wrapper.children[0]);
      wrapper.remove();
     });
    }
    await page.locator("#detailNoteToggle").click();
    assert.equal(await page.locator("#detailNoteToggle").innerText(),"Réduire");
    assert.equal(await page.locator("#detailNote").evaluate(e=>e.classList.contains("is-clamped")),false);
    await page.locator("#detailNoteToggle").click();
    assert.equal(await page.locator("#detailNoteToggle").innerText(),"Lire la suite");
    await page.locator("#detailModeToggle").click();
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),3);
    await page.locator("#detailModeToggle").click();
    assert.equal(await page.locator("#detailActivities .detailRemoveActivity").count(),0);
    assert.deepEqual(errors,[],"No unexpected client-side JavaScript errors");
    console.log("PASS moments/souvenir responsive, private conditional thumbnail, 16px inset: "+width+"px");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
