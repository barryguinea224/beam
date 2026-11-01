"use strict";
// Real /travel/ with an EMPTY carnet. All data, auth and installation are synthetic.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const root=path.resolve(__dirname,"../travel");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css",".svg":"image/svg+xml",".json":"application/json",
 ".webmanifest":"application/manifest+json",".webp":"image/webp",".png":"image/png"};
function serve(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const file=path.resolve(root,pathname.slice("/travel/".length)||"index.html");
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{
   const bytes=await fs.readFile(file);
   res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"});
   res.end(bytes);
  }catch{res.writeHead(404);res.end()}
 });
}
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222";
 const email="synthetic-account@example.invalid";
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,phone:null,postal_address:null};
 const loggedIn=()=>sessionStorage.getItem("bth-test-signed-out")!=="1";
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:loggedIn()?{user:{id:uid,email}}:null}}},
   async getUser(){return {data:{user:loggedIn()?{id:uid,email}:null},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
   async signOut(){sessionStorage.setItem("bth-test-signed-out","1");return {error:null}}
  },
  from(table){
   const q={
    select(){return q},eq(){return q},
    async single(){return {data:table==="profiles"?{...profile}:null,
      error:table==="profiles"?null:{message:"synthetic fixture unavailable"}}},
    async order(){return {data:table==="trips"?[]:[],error:null}},
    async maybeSingle(){return {data:null,error:null}}
   };return q;
  },
  storage:{from(){return {async createSignedUrl(){return {data:null,error:null}}}}}
 }}};
}
async function main(){
 const host=serve();await new Promise(resolve=>host.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [360,1024]){
   const context=await browser.newContext({viewport:{width,height:800},
    isMobile:width===360,hasTouch:width===360,serviceWorkers:"block"});
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(String(e)));
   await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="cdn.jsdelivr.net")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fakeSupabase.toString()+")();"});
    if(u.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load"});
    await page.locator("#welcomeCard").waitFor({state:"visible",timeout:15000});
    for(const s of ["#travelHero",".travelerTopBar","#openAccount",
      "#travelHero [data-beam-install-area]","#travelHero [data-beam-install-help]","#addFirstTrip"]){
     assert.equal(await page.locator(s).isVisible(),true,s+" visible in empty carnet at "+width);
    }
    assert.match(await page.locator(".travelerTopBar").innerText(),/Mon carnet de voyage/i);
    assert.match(await page.locator("#openAccount").innerText(),/Mon compte/);
    for(const s of ["#travelHero .actions","#travelHero .statsWrap",
      "#travelMapPanel","#filterAnchor","#pdf","#printJournal"]){
     assert.equal(await page.locator(s).isVisible(),false,s+" must remain hidden at "+width);
    }
    const positions=await page.evaluate(()=>{
     const rect=s=>document.querySelector(s).getBoundingClientRect();
     return {top:rect(".travelerTopBar").bottom,install:rect("#travelHero [data-beam-install-area]").bottom,
      welcome:rect("#welcomeCard").top,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    assert.ok(positions.top<positions.welcome&&positions.install<=positions.welcome+1,
     "topbar and installation must precede welcome at "+width+": "+JSON.stringify(positions));
    assert.equal(positions.overflow,false,"no horizontal overflow at "+width);
    // Native install only when the browser offers it; help remains otherwise.
    assert.equal(await page.locator("#travelHero [data-beam-install-action]").isVisible(),false);
    await page.evaluate(()=>{
     const event=new Event("beforeinstallprompt",{cancelable:true});
     event.prompt=()=>Promise.resolve();
     event.userChoice=Promise.resolve({outcome:"accepted"});
     window.dispatchEvent(event);
    });
    await page.locator("#travelHero [data-beam-install-action]").waitFor({state:"visible"});
    assert.equal(await page.locator("#travelHero [data-beam-install-action]").textContent(),"Installer BTH");
    await page.locator("#travelHero [data-beam-install-action]").click();
    assert.match(await page.locator("#travelHero [data-beam-install-status]").textContent(),/Demande d’installation acceptée/);
    // The empty account must support edit AND logout without creating any trip.
    await page.locator("#openAccount").click();
    await page.locator("#accountOverlay.accountOpen").waitFor({state:"visible"});
    await page.locator("#editAccount").click();
    assert.equal(await page.locator("#travelerName").isVisible(),true);
    assert.equal(await page.locator("#travelerName").isEnabled(),true);
    await page.locator("#cancelAccountEdit").click();
    await page.locator("#logout").click();
    await page.locator("#auth").waitFor({state:"visible",timeout:15000});
    assert.equal(await page.locator("#app").isVisible(),false);
    assert.deepEqual(errors,[],"unexpected browser page errors at "+width);
    console.log("PASS real empty carnet account, name editor, logout and install at "+width+"px");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>host.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
