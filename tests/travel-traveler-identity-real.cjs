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
const out=path.resolve("test-artifacts/travel-traveler-identity");
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
 const profile={display_name:"Mariama Djouldé Doumbouya Camara Binta Barry",country_of_residence:"GN",deleting:false,access_until:"2099-12-31",
  phone:null,postal_address:null};
 const trips=[
  {country_code:"FR",cities:["Paris"],entry_date:"2026-05-01",exit_date:"2026-05-07",duration_days:7,is_domestic:false},
  {country_code:"SN",cities:["Dakar"],entry_date:"2026-06-01",exit_date:"2026-06-05",duration_days:5,is_domestic:false},
  {country_code:"GN",cities:["Kindia"],entry_date:"2026-07-01",exit_date:"2026-07-03",duration_days:3,is_domestic:true}
 ].map((trip,i)=>({id:"11111111-1111-4111-8111-"+String(i+1).padStart(12,"0"),
   purpose:"tourisme",note:"",deleting:false,cover_media_id:null,...trip}));
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

function rectangle(el){
 const r=el.getBoundingClientRect();
 return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
}
async function readStats(page){
 return page.evaluate(()=>{
  const text=id=>document.getElementById(id).textContent.trim();
  return {voyages:text("nt"),pays:text("nc"),jours:text("nd"),
   labels:["ntl","ncl","ndl"].map(text),
   compact:document.getElementById("homeStats").textContent.trim()};
 });
}
async function main(){
 const host=server();await new Promise(resolve=>host.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const width of [320,360,390,1280]){
   const context=await browser.newContext({viewport:{width,height:780},
    isMobile:width!==1280,hasTouch:width!==1280,serviceWorkers:"block"});
   const page=await context.newPage();
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")
     return route.fulfill({status:200,contentType:"application/javascript",
       body:"("+fakeSupabase.toString()+")();"});
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>
       document.querySelectorAll("#trips .journeyTrip").length===3 &&
       document.getElementById("nt").textContent.trim()==="2" &&
       document.querySelector("#map svg path.visited"),null,{timeout:20000});
    const stats=await readStats(page);
    assert.deepEqual([stats.voyages,stats.pays,stats.jours],["2","2","12"],
      "two foreign trips must produce EXACT current headline, ignoring domestic");
    assert.deepEqual(stats.labels,["voyages","pays","jours"]);
    assert.match(stats.compact,/2\s*voyages\s*2\s*pays\s*12\s*jours/s);
    const head=await page.evaluate(()=>{
      const name="Mariama Djouldé Doumbouya Camara Binta Barry";
      const el=document.querySelector("#dashboardTitle");
      const avatar=document.querySelector("#travelerAvatar");
      const identity=document.querySelector("#travelHero .travelerIdentity");
      const header=document.querySelector("#travelHero");
      const subtitle=document.querySelector(".travelerSubtitle");
      const map=document.querySelector("#travelMapPanel");
      const titleBox=el.getBoundingClientRect(),nameBox=el.parentElement.getBoundingClientRect(),
       mapBox=map.getBoundingClientRect();
      return {title:el.textContent,avatar:avatar.textContent,
        avatarBox:({width:avatar.getBoundingClientRect().width,
         height:avatar.getBoundingClientRect().height}),
        logoInHeader:!!header.querySelector(".travelerEy img"),
        subtitle:subtitle?.textContent||"",
        accountText:document.querySelector("#openAccount")?.textContent,
        accountHit:(()=>{
         const b=document.querySelector("#openAccount").getBoundingClientRect();
         const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
         return hit===document.querySelector("#openAccount")||
           document.querySelector("#openAccount").contains(hit)})(),
        titleFits: titleBox.left>=nameBox.left-1&&titleBox.right<=nameBox.right+1,
        titleNotClipped: getComputedStyle(el).textOverflow==="clip" &&
          getComputedStyle(el).overflowX==="visible" && getComputedStyle(el).whiteSpace==="normal",
        mapTop:mapBox.top,mapWidth:mapBox.width,scrollWidth:document.documentElement.scrollWidth,
        titleBox:({top:titleBox.top,bottom:titleBox.bottom,width:titleBox.width,height:titleBox.height}),
        identityHeight:identity.getBoundingClientRect().height};
    });
    assert.equal(head.title,"Mariama Djouldé Doumbouya Camara Binta Barry",
     "full real profile name must be visible, never replaced or ellipsized");
    assert.equal(head.avatar,"MB","initials from first and last name");
    assert.ok(head.avatarBox.width>=56&&head.avatarBox.width<=68,"round profile cover avatar");
    assert.ok(Math.abs(head.avatarBox.width-head.avatarBox.height)<1,"avatar must stay round");
    assert.equal(head.logoInHeader,false,"no decorative logo on profile header");
    assert.equal(head.subtitle,"","no explanatory subtitle on home");
    assert.ok(head.accountHit && await page.locator("#openAccount").getAttribute("aria-label")==="Paramètres du compte","account link must be accessible");
    assert.ok(head.titleFits&&head.titleNotClipped,"long name must wrap, not overflow or truncate "+JSON.stringify(head));
    assert.ok(head.scrollWidth<=width+1,"no horizontal overflow at "+width+"px "+JSON.stringify(head));
    if(width<=390){
      // The real profile layout (including its 60px avatar) must show the
      // requested 26-character name in no more than two full, uncut lines.
      const typography=await page.evaluate(()=>{
        const el=document.querySelector("#dashboardTitle");
        const block=el.parentElement;
        const identity=document.querySelector("#travelHero .travelerIdentity");
        const avatar=document.querySelector("#travelerAvatar");
        const previous=el.textContent;
        const previousClasses=[...el.classList];
        el.textContent="Elhadj Alpha Mamadou Barry";
        el.classList.remove("longTitle","extraLongTitle");
        const css=getComputedStyle(el);
        const rect=el.getBoundingClientRect();
        const blockRect=block.getBoundingClientRect();
        const avatarRect=avatar.getBoundingClientRect();
        const identityRect=identity.getBoundingClientRect();
        const fontSize=parseFloat(css.fontSize);
        const lineHeight=parseFloat(css.lineHeight);
        const lines=rect.height/lineHeight;
        const result={
          fontFamily:css.fontFamily,fontWeight:css.fontWeight,fontSize,lineHeight,
          lines,title:el.textContent,rect:{left:rect.left,right:rect.right,height:rect.height},
          block:{left:blockRect.left,right:blockRect.right},
          avatar:{left:avatarRect.left,right:avatarRect.right,center:(avatarRect.top+avatarRect.bottom)/2},
          identity:{left:identityRect.left,right:identityRect.right,center:(identityRect.top+identityRect.bottom)/2},
          scrollWidth:document.documentElement.scrollWidth
        };
        el.textContent=previous;
        el.className=previousClasses.join(" ");
        return result;
      });
      const expectedSize=20; // carnet direction: fixed type scale (12/14/16/20/28)
      assert.match(typography.fontFamily,/Poppins/,"locally hosted Poppins must style the traveler title");
      assert.equal(typography.fontWeight,"600","passport name uses Poppins semibold (carnet direction, max weight 600)");
      assert.ok(Math.abs(typography.fontSize-expectedSize)<0.12,
         "title must use the 20px scale step: "+JSON.stringify(typography));
      assert.ok(Math.abs(typography.lineHeight/typography.fontSize-1.25)<0.02,
        "title line height must be 1.25: "+JSON.stringify(typography));
      assert.ok(typography.lines>=0.98&&typography.lines<=2.03,
        "sample traveler name must fit within two visible lines at "+width+"px: "+JSON.stringify(typography));
      assert.ok(typography.rect.left>=typography.block.left-1 &&
        typography.rect.right<=typography.block.right+1,
        "title must remain within the avatar-aligned text column: "+JSON.stringify(typography));
      assert.ok(typography.avatar.right<typography.rect.left &&
        Math.abs(typography.avatar.center-typography.identity.center)<=1,
        "passport avatar must remain centered at left: "+JSON.stringify(typography));
      assert.ok(typography.scrollWidth<=width+1,
        "sample name must not produce horizontal overflow at "+width+"px");
      console.log("PASS local Poppins traveler name at "+width+"px",JSON.stringify(typography));
    }
    if(width===360)assert.ok(head.mapTop<780,
     "map must begin within first screen at 360px: "+JSON.stringify(head));
    // National changes only the map/list, never the passport totals.
    await page.locator("#tripListFilter").click();
    await page.locator("#filterScope").selectOption("domestic");
    const national=await readStats(page);
    assert.deepEqual([national.voyages,national.pays,national.jours],["2","2","12"],
      "National must leave the traveler passport totals unchanged");
    assert.deepEqual(national.labels,["voyages","pays","jours"]);
    assert.match(national.compact,/2\s*voyages\s*2\s*pays\s*12\s*jours/s);
    assert.match(await page.locator("#tripListSummary").innerText(),/1 voyage · 1 pays/,
      "The trip-list summary must reflect the selected National scope");
    assert.equal(await page.locator("#trips .journeyTrip").count(),1,
      "The filtered list shows only the domestic journey");
    await page.locator("#filterScope").selectOption("");
    const reset=await readStats(page);
    assert.deepEqual([reset.voyages,reset.pays,reset.jours],["2","2","12"],
      "the foreign-only default counters must be restored after removing National");
    assert.deepEqual(reset.labels,["voyages","pays","jours"]);
    console.log("PASS traveler identity real dashboard at "+width+"px",
     JSON.stringify({before:stats,after:national,reset,mapTop:head.mapTop}));
    await page.locator("#closeFilters").click();
    if(width===1280){
      const desktop=await page.evaluate(()=>({top:document.querySelector("#travelHero").getBoundingClientRect().top,
        grid:getComputedStyle(document.querySelector("#app .w")).gridTemplateAreas}));
      assert.ok(desktop.top<115,
        "desktop traveler identity should begin near top of left column: "+JSON.stringify(desktop));
    }
    await page.screenshot({path:path.join(out,"identity-real-"+width+".png"),fullPage:true,animations:"disabled"});
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>host.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
