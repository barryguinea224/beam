"use strict";
// The real travel/index.html must work for a signed-in account even if the
// optional printable-journal.js does not execute. No production requests.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".json":"application/json",
 ".webmanifest":"application/manifest+json",".svg":"image/svg+xml",
 ".webp":"image/webp",".png":"image/png"};
function serve(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
  const url=new URL(req.url,"http://localhost");
  if(!url.pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const relative=url.pathname.slice("/travel/".length)||"index.html";
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{
   const bytes=await fs.readFile(file);
   res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream",
    "cache-control":"no-store","x-content-type-options":"nosniff"});res.end(bytes);
  }catch{res.writeHead(404);res.end()}
 });
}
// Fake account: only synthetic profiles and trips, never Supabase or saved user data.
function mockedSupabase(){
 let displayName="Youssouf";
 const fakeTrip={id:"11111111-1111-4111-8111-111111111111",
  country_code:"SN",cities:["Dakar"],entry_date:"2026-01-05",
  exit_date:"2026-01-05",duration_days:1,purpose:"tourisme",
  is_domestic:false,note:"Souvenir de test",cover_media_id:null};
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:{user:{id:"22222222-2222-4222-8222-222222222222"}}}}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
   async signInWithOtp(){return {error:null}},
   async verifyOtp(){return {error:null}}
  },
  from(table){
   let updating=null;
   const q={
    select(){return q},
    eq(){return q},
    order(){return Promise.resolve({data:table==="trips"?[fakeTrip]:[],error:null})},
    update(data){updating=data;return q},
    single(){
     if(table!=="profiles")return Promise.resolve({data:null,error:{message:"no fake data"}});
     if(updating?.display_name)displayName=updating.display_name;
     return Promise.resolve({data:updating?{display_name:displayName}:
       {display_name:displayName,country_of_residence:"GN",deleting:false,access_until:"2099-12-31"},error:null});
    },
    maybeSingle(){return Promise.resolve({data:null,error:null})}
   };
   return q;
  }
 }}};
}
async function main(){
 const server=serve();
 await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",err=>err?reject(err):resolve()));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const context=await browser.newContext({viewport:{width:360,height:780},
   isMobile:true,hasTouch:true,serviceWorkers:"block"});
  const page=await context.newPage();
  const pageErrors=[],consoleErrors=[],external=[];
  page.on("pageerror",err=>pageErrors.push(String(err)));
  page.on("console",msg=>{if(msg.type()==="error")consoleErrors.push(msg.text())});
  await page.route("**/*",route=>{
   const url=new URL(route.request().url());
   if(url.pathname==="/travel/printable-journal.js"&&url.hostname==="127.0.0.1")
    return route.fulfill({status:200,contentType:"application/javascript",
     body:"/* optional journal module deliberately unavailable */"});
   if(url.hostname==="cdn.jsdelivr.net")
    return route.fulfill({status:200,contentType:"application/javascript",
     body:"("+mockedSupabase.toString()+")();"});
   if(url.hostname==="127.0.0.1")return route.continue();
   external.push(route.request().url());
   return route.fulfill({status:200,contentType:"text/plain",body:""});
  });
  const url="http://127.0.0.1:"+server.address().port+"/travel/";
  const response=await page.goto(url,{waitUntil:"load",timeout:25000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Youssouf",
   null,{timeout:10000});
  const initial=await page.evaluate(()=>({
   journal:typeof window.BEAM_PERSONAL_JOURNAL,
   title:document.querySelector("#dashboardTitle")?.textContent,
   appVisible:!document.querySelector("#app")?.classList.contains("hidden"),
   heroVisible:!document.querySelector("#travelHero")?.classList.contains("hidden"),
   trips:document.querySelector("#trips")?.textContent,
   filters:document.querySelector("#filterPurpose")?.options?.length,
   journalDisabled:document.querySelector("#printJournal")?.disabled,
   journalMessage:document.querySelector("#printJournal")?.textContent,
   factualReady:typeof window.BEAM_TRAVEL_PDF,
   mapModule:typeof window.BEAM_VISUAL_CARDS
  }));
  assert.equal(initial.journal,"undefined","the optional module must actually be missing");
  assert.equal(initial.title,"Youssouf");
  assert.equal(await page.locator("#travelerAvatar").textContent(),"Y",
    "the initials-only avatar works without the optional printable journal");
  assert.equal(initial.appVisible,true,"signed-in dashboard must stay visible");
  assert.equal(initial.heroVisible,true,"dashboard hero must render");
  assert.match(initial.trips,/Sénégal|Dakar/,"travel cards must still render");
  assert.ok(initial.filters>=5,"filters must still be available");
  assert.equal(initial.journalDisabled,true,"only journal print button should be disabled");
  assert.match(initial.journalMessage,/Carnet imprimable indisponible/);
  assert.equal(initial.factualReady,"object");
  assert.equal(initial.mapModule,"object");
  await page.locator("#openAccount").click();
   await page.locator("#editAccount").click();
   for(const [name,expected] of [
   ["Aminata","Aminata"],
   ["Yacouba","Yacouba"],
   ["Elhadj","Elhadj"],
   ["Yaya","Yaya"]
  ]){
   if(name!=="Aminata")await page.locator("#editAccount").click();
   await page.locator("#travelerName").fill(name);
   await page.locator("#travelerNameForm").evaluate(form=>form.requestSubmit());
   await page.waitForFunction(expected=>
    document.querySelector("#dashboardTitle")?.textContent===expected,expected,{timeout:10000});
   assert.match(await page.locator("#contactDetailsStatus").textContent(),/Informations enregistrées/);
  }
  assert.deepEqual(pageErrors,[],"without album the real page must have no uncaught errors");
  assert.deepEqual(consoleErrors,[],"no console errors if optional module is unavailable");
  assert.deepEqual(external,[],"no production Supabase or other external calls");
  console.log("PASS real travel/index.html: signed-in dashboard + profile saves work without the optional printable journal");
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
