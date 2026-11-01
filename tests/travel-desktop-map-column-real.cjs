"use strict";
// Real /travel/ dashboard, with a local synthetic Supabase account only.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const out=path.resolve("test-artifacts/travel-desktop-map-column");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css",".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png",
 ".json":"application/json",".webmanifest":"application/manifest+json"};
function server(){
 return http.createServer(async(req,res)=>{
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
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,
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
async function run(){
 const host=server();await new Promise(resolve=>host.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const width of [900,950,1024,1280]){
   // Desktop viewport even at 950px, like Chrome Android "Site pour ordinateur".
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block"});
   const page=await context.newPage();
   page.on("pageerror",error=>{console.error("Browser page error:",error.message)});
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
    await page.waitForFunction(()=>
     document.querySelectorAll("#trips .journeyTrip").length===6 &&
     document.querySelectorAll("#map svg path.visited").length>=6,
     null,{timeout:20000});
    assert.ok(await page.locator("#travelTripsPanel h2").textContent().then(t=>t.includes("Mes voyages")));
    const data=await page.evaluate(()=>{
     const rect=s=>document.querySelector(s).getBoundingClientRect();
     const col=rect("#travelMapPanel"),m=rect("#map"),svg=rect("#map svg"),
      list=rect("#travelPanels"),tripPanel=rect("#travelTripsPanel"),
      h=document.querySelector("#travelTripsPanel h2"),title=h.getBoundingClientRect();
     return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      col:({left:col.left,top:col.top,right:col.right,bottom:col.bottom}),
      map:({left:m.left,top:m.top,right:m.right,bottom:m.bottom}),
      svg:({left:svg.left,top:svg.top,right:svg.right,bottom:svg.bottom}),
      list:({left:list.left,top:list.top,right:list.right,bottom:list.bottom}),
      panel:({left:tripPanel.left,right:tripPanel.right}),
      title:({left:title.left,top:title.top,right:title.right,bottom:title.bottom}),
      countries:[...document.querySelectorAll("#map svg path.visited")].map(x=>x.dataset.country),
      style:{map:getComputedStyle(document.querySelector("#map")).overflow,
       panel:getComputedStyle(document.querySelector("#travelMapPanel")).overflow,
       svg:getComputedStyle(document.querySelector("#map svg")).maxWidth,
       listColumns:getComputedStyle(document.querySelector("#travelPanels")).gridTemplateColumns}
     };
    });
    const eps=1.5;
    assert.ok(data.map.left>=data.col.left-eps&&data.map.right<=data.col.right+eps,
     "Map must be within LEFT column at "+width+": "+JSON.stringify(data));
    assert.ok(data.svg.left>=data.map.left-eps&&data.svg.right<=data.map.right+eps,
     "SVG must be within rounded map frame at "+width+": "+JSON.stringify(data));
    assert.ok(data.map.right<=data.list.left+eps,
     "Map must not intersect trip-list column at "+width+": "+JSON.stringify(data));
    assert.ok(data.map.right<=data.panel.left+eps,
     "Map must not overlap trip cards at "+width+": "+JSON.stringify(data));
    assert.ok(data.scrollWidth<=width+1,
     "Dashboard must not horizontally overflow at "+width+": "+JSON.stringify(data));
    assert.equal(data.style.map,"hidden");
    assert.equal(data.style.panel,"hidden");
    assert.ok(data.countries.includes("GN")&&data.countries.includes("US")&&
      data.countries.includes("JP")&&data.countries.includes("BR"),
      "Fixture must exercise multiple continents");
    await page.locator("#travelTripsPanel h2").scrollIntoViewIfNeeded();
    const titleHit=await page.locator("#travelTripsPanel h2").evaluate(h=>{
     const b=h.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
     const target=document.elementFromPoint(x,y);
     return {x,y,visible:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,
      topmost:target===h||h.contains(target),hit:target?.outerHTML?.slice(0,140)};
    });
    assert.ok(titleHit.visible&&titleHit.topmost,
     "Mes voyages must be unobscured at "+width+": "+JSON.stringify({data,titleHit}));
    if(width===950){
     await page.screenshot({path:path.join(out,"carnet-real-950.png"),fullPage:true,animations:"disabled"});
     fs.writeFileSync(path.join(out,"layout-950.json"),JSON.stringify({data,titleHit},null,2));
    }
    console.log("PASS real desktop map containment and visible trips heading at "+width+"px");
   }finally{await context.close()}
  }
 }finally{
  await browser.close();
  await new Promise(resolve=>host.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});