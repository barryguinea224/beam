"use strict";
// Real /travel/ dashboard, with a local synthetic Supabase account only.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const out=path.resolve("test-artifacts/travel-overlay-stacking");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css",".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png",
 ".json":"application/json",".webmanifest":"application/manifest+json"};
function server(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/travel/")){res.writeHead(404);return res.end()}
  const target=path.resolve(root,pathname.slice("/travel/".length)||"index.html");
  if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{
   const content=await fsp.readFile(target);
   res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream","cache-control":"no-store"});
   res.end(content);
  }catch{res.writeHead(404);res.end()}
 });
}
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222";
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,access_until:"2099-12-31",
  phone:null,postal_address:null};
 const codes=[["US","New York"],["GN","Conakry"],["FR","Paris"],
  ["JP","Tokyo"],["SN","Dakar"],["BR","Rio de Janeiro"]];
 const trips=codes.map(([country_code,city],i)=>({
  id:"11111111-1111-4111-8111-"+String(i+1).padStart(12,"0"),
  country_code,cities:[city],entry_date:"2026-0"+(i+1)+"-02",
  exit_date:"2026-0"+(i+1)+"-12",duration_days:11,
  purpose:"tourisme",is_domestic:country_code==="GN",note:"",
  deleting:false,cover_media_id:null
 }));
 window.__syntheticDesktopTrips=trips;
 window.supabase={createClient(){return {
  auth:{
   async getSession(){return {data:{session:{user:{id:uid,email:"fixture@example.invalid"}}}}},
   async getUser(){return {data:{user:{id:uid,email:"fixture@example.invalid"}},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
  },
  from(table){
   const query={
    select(){return query},eq(){return query},order(){
     return Promise.resolve({data:table==="trips"?trips:[],error:null})
    },
    async single(){return {data:table==="profiles"?{...profile}:null,
     error:table==="profiles"?null:{message:"not mocked"}}},
    async maybeSingle(){return {data:null,error:null}}
   };
   return query;
  },
  storage:{from(){return {async createSignedUrl(){return {data:null,error:{message:"fixture"}}}}}}
 }}};
}
function box(r){return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}

function evidence(page,selector){
 return page.locator(selector).evaluate(el=>{
  const r=el.getBoundingClientRect(),margin=16;
  const left=Math.max(0,r.left),top=Math.max(0,r.top);
  const right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
  if(right-left<=2*margin||bottom-top<=2*margin)throw Error("Panel has insufficient visible space");
  const x1=left+margin,x2=right-margin,y1=top+margin,y2=bottom-margin;
  const points=[["centre",(left+right)/2,(top+bottom)/2],
   ["haut gauche",x1,y1],["haut droit",x2,y1],["bas gauche",x1,y2],["bas droit",x2,y2]];
  return points.map(([position,x,y])=>{
   const target=document.elementFromPoint(x,y);
   return {position,x,y,inside:!!target&&el.contains(target),
    hit:target?.tagName?.toLowerCase()+"#"+(target?.id||"")};
  });
 });
}
async function assertTopmost(page,selector,width,label){
 const points=await evidence(page,selector);
 assert.equal(points.length,5);
 for(const point of points)assert.ok(point.inside,
   label+" "+width+"px : blocked at "+JSON.stringify(point));
}
async function assertControl(page,selector,width){
 const state=await page.locator(selector).evaluate(el=>{
  const b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
  const hit=document.elementFromPoint(x,y);
  return {inside:hit===el||el.contains(hit),hit:hit?.tagName+"#"+hit?.id};
 });
 assert.ok(state.inside,"Form input overlapped at "+width+"px: "+selector+" "+JSON.stringify(state));
}
async function run(){
 const host=server();
 await new Promise(resolve=>host.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const width of [360,950,1280]){
   const context=await browser.newContext({viewport:{width,height:900},
    isMobile:width===360,hasTouch:width===360,serviceWorkers:"block"});
   const page=await context.newPage();
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="cdn.jsdelivr.net")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fakeSupabase.toString()+")();"});
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelectorAll("#trips .journeyTrip").length===6 &&
      document.querySelectorAll("#map svg path.visited").length>=6,null,{timeout:20000});
    const hierarchy=await page.evaluate(()=>{
     const z=id=>parseInt(getComputedStyle(document.querySelector(id)).zIndex,10);
     return {map:z("#travelMapPanel"),trips:z("#travelPanels"),filter:z("#filterAnchor"),
      account:z("#accountOverlay"),edit:z("#modal"),detail:z("#tripDetailModal"),
      discard:z("#discardConfirm"),modalsOutsideGrid:["#modal","#tripDetailModal"].every(
       id=>document.querySelector(id).parentElement===document.body)};
    });
    assert.ok(hierarchy.map<=hierarchy.trips&&hierarchy.trips<hierarchy.filter&&
      hierarchy.filter<hierarchy.account&&hierarchy.account<hierarchy.edit&&
      hierarchy.edit<hierarchy.detail&&hierarchy.detail<hierarchy.discard,
      "Layer priority regression at "+width+": "+JSON.stringify(hierarchy));
    assert.ok(hierarchy.modalsOutsideGrid,"Trip modals must remain direct body children");
    // Add: check every corner and center of the form and both previously blocked fields.
    await page.locator("#add").click();
    await page.locator("#modal.open").waitFor();
    await assertTopmost(page,"#tripForm",width,"Ajouter voyage");
    await assertControl(page,'#tripForm input[name="cities"]',width);
    await assertControl(page,'#tripForm input[name="exit_date"]',width);
    if(width===950)await page.screenshot({
     path:path.join(out,"ajouter-voyage-950.png"),fullPage:false,animations:"disabled"});
    await page.locator("#close").click();
    await page.locator("#modal:not(.open)").waitFor({state:"hidden"});
    // Consultation of an existing fictitious trip; then editing that same trip.
    await page.locator("#trips .tripOpen").first().click();
    await page.locator("#tripDetailModal.open").waitFor();
    await assertTopmost(page,"#detailSheet",width,"Fiche voyage");
    await page.locator("#detailEdit").click();
    await page.locator("#modal.open").waitFor();
    assert.match(await page.locator("#tripTitle").textContent(),/Modifier le voyage/);
    await assertTopmost(page,"#tripForm",width,"Modifier voyage");
    await assertControl(page,'#tripForm input[name="cities"]',width);
    await assertControl(page,'#tripForm input[name="exit_date"]',width);
    await page.locator("#close").click();
    await page.locator("#modal:not(.open)").waitFor({state:"hidden"});
    // Account drawer and contextual filter sheet must also cover page content.
    await page.locator("#openAccount").click();
    await page.locator("#accountOverlay.accountOpen").waitFor();
    await assertTopmost(page,"#myAccount",width,"Compte");
    await page.locator("#closeAccount").click();
    await page.locator("#accountOverlay:not(.accountOpen)").waitFor({state:"hidden"});
    await page.locator("#toggleFilters").click();
    await page.locator("#filterPanel.filterOpen").waitFor();
    await assertTopmost(page,"#filterPanel",width,"Filtres");
    await page.locator("#closeFilters").click();
    await page.locator("#filterPanel:not(.filterOpen)").waitFor({state:"hidden"});
    console.log("PASS real app overlay stacking + five hit tests x five panels at "+width+"px");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>host.close(resolve))}
}
run().catch(e=>{console.error(e);process.exitCode=1});
