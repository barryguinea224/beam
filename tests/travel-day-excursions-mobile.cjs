"use strict";
// Real J'y étais page in Chromium, isolated fake Supabase data only.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const http=require("node:http");
const path=require("node:path");
const {chromium}=require("playwright");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const ROOT=path.resolve(__dirname,"../travel");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".json":"application/json",
 ".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp"};
function serve(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const target=path.resolve(ROOT,pathname.slice("/travel/".length)||"index.html");
  if(!target.startsWith(ROOT+path.sep)){res.writeHead(403);res.end();return}
  try{const data=await fs.readFile(target);res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream"});res.end(data)}
  catch{res.writeHead(404);res.end()}
 });
}
function fictionalSupabase(){
 const uid="22222222-2222-4222-8222-222222222222";
 const original={id:"11111111-1111-4111-8111-111111111111",country_code:"FR",cities:["Paris"],
  entry_date:"2026-11-08",exit_date:"2026-11-18",duration_days:11,
  purpose:"tourisme",is_domestic:false,deleting:false,note:"Souvenir fictif"};
 const upcoming={id:"55555555-5555-4555-8555-555555555555",country_code:"MA",cities:["Rabat"],
  entry_date:"2027-04-12",exit_date:"2027-04-16",duration_days:5,
  purpose:"tourisme",is_domestic:false,deleting:false,note:"Voyage prévu fictif"};
 const rows=[original,upcoming],stops=[];
 const store=window.__excursionFixture={rows,stops,tripInserts:[],stopInserts:[],activityInserts:[],force23P01:false};
 const profile={display_name:"Voyageuse Fictive",country_of_residence:"GN",
  access_until:"2099-12-31",deleting:false,avatar_id:null};
 function result(table,method,payload,q){
  if(table==="profiles")return {data:profile,error:null};
  if(table==="trips"){
   if(method==="insert"||method==="update"){
    if(store.force23P01){
     store.force23P01=false;
     return {data:null,error:{code:"23P01",message:"PG_RAW_ERROR trip_no_overlap confidential"}};
    }
    if(method==="insert"){
     const trip={...payload,id:"33333333-3333-4333-8333-333333333333",
      duration_days:Math.round((Date.parse(payload.exit_date)-Date.parse(payload.entry_date))/864e5)+1,
      deleting:false};
     store.tripInserts.push({...payload});rows.push(trip);
     return {data:trip,error:null};
    }
    const id=q.where.find(x=>x[0]==="id")?.[1];
    const row=rows.find(x=>x.id===id);
    if(row)Object.assign(row,payload);
    return {data:row||null,error:row?null:{message:"no fixture row"}};
   }
   return {data:rows.slice(),error:null};
  }
  if(table==="trip_stops"){
   if(method==="insert"){
    const entry={...payload,id:"44444444-4444-4444-8444-444444444444"};
    stops.push(entry);store.stopInserts.push({...payload});
    return {data:[{id:entry.id}],error:null};
   }
   return {data:stops.slice(),error:null};
  }
  if(table==="activities"){
   if(method==="insert"){store.activityInserts.push(payload);return {data:[{id:"fictional-activity"}],error:null}}
   return {data:[],error:null};
  }
  if(table==="loyalty_memberships"||table==="media"||table==="avatar_media")return {data:[],error:null};
  if(table==="travel_history_pdf")return {data:rows,error:null};
  return {data:[],error:null};
 }
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:{user:{id:uid,email:"fiction@example.invalid"}}}}},
   async getUser(){return {data:{user:{id:uid,email:"fiction@example.invalid"}}}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
  },
  storage:{from(){return{createSignedUrl:async()=>({data:null,error:{message:"no fake photo"}})}}},
  from(table){
   const q={where:[]};let method="select",payload=null;
   const api={
    select(fields){q.selected=fields;return api},
    eq(field,value){q.where.push([field,value]);return api},
    order(){return api},limit(){return api},
    insert(value){method="insert";payload=value;return api},
    update(value){method="update";payload=value;return api},
    delete(){method="delete";return api},
    single(){return Promise.resolve(result(table,method,payload,q))},
    maybeSingle(){return Promise.resolve({data:null,error:null})},
    then(ok,fail){return Promise.resolve(result(table,method,payload,q)).then(ok,fail)}
   };
   return api;
  }
 }}};
}
async function start(){
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir=path.resolve("test-artifacts/day-excursions");
 await fs.mkdir(dir,{recursive:true});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("dialog",d=>{throw Error("Unexpected native dialog: "+d.message())});
   await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="127.0.0.1"&&u.pathname==="/travel/vendor/supabase.umd.js")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fictionalSupabase.toString()+")();"});
    if(u.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    async function choose(date){
     await page.locator("#tripDatePicker .drp-year").selectOption(date.slice(0,4));
     await page.locator("#tripDatePicker .drp-month").selectOption(String(Number(date.slice(5,7))-1));
     await page.locator('#tripDatePicker button[data-date="'+date+'"]').click();
    }
    async function openDay(country,city,date){
     await page.locator("#add").click();
     assert.equal(await page.locator('[data-trip-mode="multi"]').getAttribute("aria-pressed"),"true");
     await page.locator('[data-trip-mode="day"]').click();
     assert.equal(await page.locator("#tripEntryLabel").textContent(),"Date");
     assert.equal(await page.locator("#tripExitField").isVisible(),false);
     await page.locator("#tripCountrySelect").selectOption(country);
     await page.locator('#tripForm input[name="cities"]').fill(city);
     await choose(date);
    }
    // Difference from the foreign parent becomes a private trip_stop.
    await openDay("DE","Berlin","2026-11-12");
    if(width===360)await page.locator("#modal").screenshot({
     path:path.join(dir,"formulaire-une-journee-360.png"),animations:"disabled"});
    await page.locator("#saveTrip").click();
    await page.locator("#tripOverlapOffer").waitFor({state:"visible"});
    assert.match(await page.locator("#tripOverlapText").innerText(),
     /Ce jour fait partie de votre voyage en France du 8 nov\. 2026 au 18 nov\. 2026\./);
    assert.equal(await page.locator("#tripOverlapStop").isVisible(),true);
    assert.equal(await page.locator("#tripOverlapActivity").isVisible(),false);
    assert.equal(await page.evaluate(()=>window.__excursionFixture.tripInserts.length),0);
    if(width===360){
     await page.locator("#tripOverlapOffer").screenshot({
      path:path.join(dir,"proposition-excursion-360.png"),animations:"disabled"});
     await page.locator("#tripOverlapEditDates").scrollIntoViewIfNeeded();
     await page.screenshot({
      path:path.join(dir,"proposition-excursion-viewport-360.png"),animations:"disabled"});
    }
    await page.locator("#tripOverlapStop").click();
    await page.locator("#tripDetailModal.open").waitFor();
    await page.waitForFunction(()=>window.__excursionFixture.stopInserts.length===1);
    const stop=await page.evaluate(()=>window.__excursionFixture.stopInserts[0]);
    assert.equal(stop.country_code,"DE");
    assert.equal(stop.entry_date,stop.exit_date);
    assert.equal(stop.entry_date,"2026-11-12");
    assert.match(await page.locator("#detailStops").innerText(),/Excursion · 1 jour/);
    assert.doesNotMatch(await page.locator("#detailStops").innerText(),/12 nov\. 2026 → 12 nov/);
    await page.locator("#detailClose").click();

    // An entirely contained multi-day foreign period becomes a full stop,
    // never a one-day approximation.
    await page.locator("#add").click();
    assert.equal(await page.locator('[data-trip-mode="multi"]').getAttribute("aria-pressed"),"true");
    await page.locator("#tripCountrySelect").selectOption("BE");
    await page.locator('#tripForm input[name="cities"]').fill("Bruxelles");
    await choose("2026-11-14");
    await choose("2026-11-16");
    assert.equal(await page.locator("#tripEntryDate").inputValue(),"2026-11-14");
    assert.equal(await page.locator("#tripExitDate").inputValue(),"2026-11-16");
    await page.locator("#saveTrip").click();
    await page.locator("#tripOverlapOffer").waitFor({state:"visible"});
    assert.equal(await page.locator("#tripOverlapStop").innerText(),"L'ajouter comme étape à ce voyage");
    assert.equal(await page.locator("#tripOverlapFeedback").innerText(),"",
     "contained period must not warn that it will be shortened to one day");
    await page.locator("#tripOverlapStop").click();
    await page.waitForFunction(()=>window.__excursionFixture.stopInserts.length===2);
    const multiStop=await page.evaluate(()=>window.__excursionFixture.stopInserts[1]);
    assert.equal(multiStop.country_code,"BE");
    assert.equal(multiStop.entry_date,"2026-11-14");
    assert.equal(multiStop.exit_date,"2026-11-16");
    await page.locator("#tripDetailModal.open").waitFor();
    assert.match(await page.locator("#detailStops").innerText(),/14\/11\/2026 → 16\/11\/2026/);
    await page.locator("#detailClose").click();

    // Same country: activity editor opens with the selected day (no auto-save).
    await openDay("FR","Lyon","2026-11-13");
    await page.locator("#saveTrip").click();
    assert.equal(await page.locator("#tripOverlapActivity").isVisible(),true);
    assert.equal(await page.locator("#tripOverlapStop").isVisible(),false);
    await page.locator("#tripOverlapActivity").click();
    await page.locator("#tripDetailModal.open").waitFor();
    assert.equal(await page.locator("#activityDate").inputValue(),"2026-11-13");
    assert.equal(await page.evaluate(()=>window.__excursionFixture.activityInserts.length),0);
    await page.locator("#detailClose").click();

    // A free date creates a real one-day trip with identical database dates.
    await openDay("SN","Dakar","2026-12-12");
    await page.locator("#saveTrip").click();
    await page.waitForFunction(()=>window.__excursionFixture.tripInserts.length===1);
    const saved=await page.evaluate(()=>window.__excursionFixture.tripInserts[0]);
    assert.equal(saved.entry_date,"2026-12-12");
    assert.equal(saved.exit_date,saved.entry_date);
    await page.locator("#modal.open").waitFor({state:"hidden"});
    const dayCard=page.locator("#trips .journeyTrip").filter({hasText:"Excursion · 1 jour"});
    await dayCard.waitFor({state:"visible"});
    assert.match(await dayCard.innerText(),/12 déc\. 2026/);
    if(width===360)await page.screenshot({
     path:path.join(dir,"carte-excursion-360.png"),fullPage:true,animations:"disabled"});

    await dayCard.locator(".tripOpen").click();
    assert.match(await page.locator("#detailIntro").innerText(),/Excursion · 1 jour/);
    assert.equal(await page.locator("#detailFacts dt").filter({hasText:"Date"}).count(),1);
    assert.equal(await page.locator("#detailFacts dt").filter({hasText:"Sortie"}).count(),0);
    await page.locator("#detailModeToggle").click();
     await page.locator("#detailEdit").click();
    assert.equal(await page.locator('[data-trip-mode="day"]').getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator("#tripExitField").isVisible(),false);
    await page.locator("#close").click();

    // SQL exclusion fallback is localized and never exposes Postgres error.
    await page.evaluate(()=>window.__excursionFixture.force23P01=true);
    await openDay("BE","Bruxelles","2027-01-14");
    await page.locator("#saveTrip").click();
    await page.locator("#tripMsg").waitFor({state:"visible"});
    assert.match(await page.locator("#tripMsg").innerText(),/voyage est déjà enregistré/);
    assert.doesNotMatch(await page.locator("#tripMsg").innerText(),/23P01|PG_RAW_ERROR|trip_no_overlap/);
    await page.locator("#close").click();

    const audit=await page.evaluate(()=>{
     const form=document.querySelector("#tripForm"),modal=document.querySelector("#modal");
     return {document:document.documentElement.scrollWidth-innerWidth,
      form:form.scrollWidth-form.clientWidth,modal:modal.scrollWidth-modal.clientWidth};
    });
    assert.ok(audit.document<=1&&audit.form<=2&&audit.modal<=2,
     "Android overflow "+width+": "+JSON.stringify(audit));
    assert.deepEqual(errors,[],"Browser errors on "+width+": "+errors);
    console.log("PASS one-day real app "+width+"px: trip/stop/activity/SQL conflict, preselected edit, responsive");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
module.exports={serve,fictionalSupabase};
if(require.main===module)start().catch(error=>{console.error(error);process.exitCode=1});
