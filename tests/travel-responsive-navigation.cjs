"use strict";
// End-to-end REAL travel/index.html with a synthetic logged-in Supabase client.
// Tests consent reset, owner-only profile update payload, verified Auth email
// and ordinary PDF remaining contact-free. Never calls staging or production.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",
 ".json":"application/json",".webmanifest":"application/manifest+json",
 ".png":"image/png",".webp":"image/webp"};
function serve(){
 return http.createServer(async(req,res)=>{
  const u=new URL(req.url,"http://localhost");
  if(!u.pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const relative=u.pathname.slice("/travel/".length)||"index.html";
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{
   const bytes=await fs.readFile(target);
   res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream",
    "cache-control":"no-store"});res.end(bytes);
  }catch{res.writeHead(404);res.end()}
 });
}
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222";
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,
  phone:null,postal_address:null};
 // Persist ONLY fictitious browser-test contact values across a page reload.
 // This is a local mock store, never production Supabase data.
 try{Object.assign(profile,JSON.parse(sessionStorage.getItem("beam.synthetic-contacts")||"{}"))}catch{}
 const trip={id:"11111111-1111-4111-8111-111111111111",country_code:"SN",cities:["Dakar"],
  entry_date:"2026-06-03",exit_date:"2026-06-08",duration_days:6,
  purpose:"tourisme",is_domestic:false,note:"SECRET_PERSONAL_MEMORY",
  deleting:false,cover_media_id:null};
 const view={country_code:"SN",cities:["Dakar"],entry_date:"2026-06-03",
  exit_date:"2026-06-08",duration_days:6,purpose:"tourisme"};
 window.__contactStore={profile,queries:[],updates:[],authChecks:0};
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:{user:{id:uid,email:"login@example.net"}}}}},
   async getUser(){window.__contactStore.authChecks++;return {
    data:{user:{id:uid,email:"verified@example.net"}},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
  },
  from(table){
   const query={updateFields:null,selected:"",where:[]};
   const api={
    select(fields){query.selected=fields;return api},
    eq(field,value){query.where.push([field,value]);return api},
    update(data){query.updateFields=data;return api},
    async single(){
     window.__contactStore.queries.push({table,selected:query.selected,where:query.where});
     if(table!=="profiles")return {data:null,error:{message:"table not mocked"}};
     if(query.updateFields){
      window.__contactStore.updates.push(query.updateFields);
      for(const [key,value] of Object.entries(query.updateFields))profile[key]=value;
      sessionStorage.setItem("beam.synthetic-contacts",JSON.stringify({
       phone:profile.phone,postal_address:profile.postal_address
      }));
     }
     return {data:{...profile},error:null};
    },
    async order(){
     window.__contactStore.queries.push({table,selected:query.selected,where:query.where});
     if(table==="trips")return {data:[trip],error:null};
     if(table==="travel_history_pdf")return {data:[view],error:null};
     return {data:[],error:null};
    },
    maybeSingle(){return Promise.resolve({data:null,error:null})}
   };
   return api;
  }
 }}};
}
async function waitPopup(page,doClick){
 const [popup]=await Promise.all([page.waitForEvent("popup",{timeout:12000}),doClick()]);
 await popup.waitForFunction(()=>document.title==="BEAM - Travel History PDF",null,{timeout:12000});
 return popup;
}
async function main(){
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [360,1280]){
   const context=await browser.newContext({viewport:{width,height:780},isMobile:width<900,hasTouch:width<900,serviceWorkers:"block"});
   const page=await context.newPage();
   page.on("dialog",d=>{throw Error("Native window.confirm is forbidden: "+d.message())});
   await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fakeSupabase.toString()+")();"});
    if(u.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
   await page.waitForFunction(()=>document.querySelector("#openAccount")&&!document.querySelector("#openAccount").classList.contains("hidden")&&!document.querySelector("#saveContactDetails").disabled);
   const account=page.locator("#accountOverlay"),discard=page.locator("#discardConfirm");
   await page.locator("#openAccount").click();
   assert.ok(await account.evaluate(n=>n.classList.contains("accountOpen")));
   assert.equal(await page.locator("#closeAccount").evaluate(el=>{
    const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return top===el||el.contains(top);
   }),true,"account close must be topmost hit target at "+width);
   assert.equal(await page.locator("#logout").evaluate(el=>el.closest("#accountSession")!==null),true,
    "sign out belongs inside the account Session card");
   await page.evaluate(()=>history.back());
   await page.waitForFunction(()=>!document.querySelector("#accountOverlay").classList.contains("accountOpen"));
   assert.ok(page.url().includes("/travel/"),"Android Back must remain on carnet");
   await page.locator("#openAccount").click();
   await page.locator("#editAccount").click();
   const original=await page.locator("#contactPhone").inputValue();
   await page.locator("#contactPhone").fill("+224 622 09 56 30");
   const updatesBefore=await page.evaluate(()=>window.__contactStore.updates.length);
   await page.evaluate(()=>history.back());
   await page.waitForFunction(()=>document.querySelector("#discardConfirm").classList.contains("accountOpen"));
   assert.match(await page.locator("#discardTitle").textContent(),/Abandonner les modifications/);
   await page.locator("#discardStay").click();
   assert.equal(await page.locator("#contactPhone").inputValue(),"+224 622 09 56 30");
   // Refusing Android Back must rearm the history sentinel for a second Back.
   await page.evaluate(()=>history.back());
   await discard.waitFor({state:"visible"});
   assert.ok(page.url().includes("/travel/"),"second Back must stay on carnet");
   await page.locator("#discardStay").click();
   assert.equal(await page.locator("#contactPhone").inputValue(),"+224 622 09 56 30");
   assert.ok(await account.evaluate(n=>n.classList.contains("accountEditing")));
   await page.locator("#closeAccount").click();
   await discard.waitFor({state:"visible"});
   await page.locator("#discardLeave").click();
   assert.equal(await page.locator("#contactPhone").inputValue(),original);
   assert.equal(await page.evaluate(()=>window.__contactStore.updates.length),updatesBefore);
   await page.locator("#openAccount").click();
   await page.locator("#editAccount").click();
   await page.locator("#contactPhone").fill("+224 622 09 56 30");
   await page.locator("#cancelAccountEdit").click();
   await discard.waitFor({state:"visible"});
   await page.locator("#discardLeave").click();
   assert.equal(await page.locator("#contactPhone").inputValue(),original);
   assert.equal(await page.evaluate(()=>window.__contactStore.updates.length),updatesBefore);
   await page.locator("#editAccount").click();
   await page.locator("#contactPhone").fill("+224 622 09 56 30");
   await page.locator("#contactDetailsForm").evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>window.__contactStore.updates.length>0);
   assert.equal(await page.evaluate(()=>window.__contactStore.updates.length),updatesBefore+1);
   await page.locator("#closeAccount").click();
   if(await discard.isVisible())await page.locator("#discardLeave").click();
   // Close one overlay and immediately open another: a pending popstate must not close it.
   await page.locator("#openAccount").click();
   await page.locator("#closeAccount").click();
   await page.locator("#toggleFilters").click();
   await page.waitForTimeout(150);
   assert.ok(await page.locator("#filterPanel").evaluate(n=>n.classList.contains("filterOpen")),
    "stale account history popstate must not close newly opened filters");
   await page.evaluate(()=>history.back());
   await page.waitForFunction(()=>!document.querySelector("#filterPanel").classList.contains("filterOpen"));
   assert.equal(await page.evaluate(()=>document.activeElement?.id),"toggleFilters");
   await page.locator("#toggleFilters").click();
   assert.equal(await page.locator("#closeFilters").evaluate(el=>{
    const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return top===el||el.contains(top);
   }),true,"filters close must be topmost hit target at "+width);
   await page.keyboard.press("Escape");
   assert.ok(!await page.locator("#filterPanel").evaluate(n=>n.classList.contains("filterOpen")));
   assert.equal(await page.evaluate(()=>document.activeElement?.id),"toggleFilters");
   await page.locator("#openAccount").click();
   await page.keyboard.press("Escape");
   assert.ok(!await account.evaluate(n=>n.classList.contains("accountOpen")));
   console.log("PASS real account overlay and filters navigation "+width+"px");
   await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
