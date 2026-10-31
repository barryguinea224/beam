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
 const server=serve();
 await new Promise((ok,fail)=>server.listen(0,"127.0.0.1",e=>e?fail(e):ok()));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const context=await browser.newContext({viewport:{width:360,height:780},
   isMobile:true,hasTouch:true,serviceWorkers:"block"});
  const page=await context.newPage(),errors=[],external=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.route("**/*",route=>{
   const u=new URL(route.request().url());
   if(u.hostname==="cdn.jsdelivr.net")
    return route.fulfill({status:200,contentType:"application/javascript",
     body:"("+fakeSupabase.toString()+")();"});
   if(u.hostname==="127.0.0.1")return route.continue();
   external.push(u.toString());
   return route.abort();
  });
  const url="http://127.0.0.1:"+server.address().port+"/travel/";
  await page.goto(url,{waitUntil:"load",timeout:20000});
  await page.waitForFunction(()=>!document.querySelector("#saveContactDetails")?.disabled,
   null,{timeout:12000});
  assert.equal(await page.locator("#accountEmail").inputValue(),"login@example.net");
  assert.equal(await page.locator("#accountEmail").getAttribute("readonly"),"");
  assert.equal(await page.locator("#includePdfContacts").isChecked(),false);
  // Real 360px layout: serif heading, visible divider and no horizontal scroll.
  const design=await page.evaluate(()=>{
   const heading=document.querySelector(".account-contacts-title");
   const contacts=document.querySelector("#contactDetailsForm");
   const before=document.querySelector("#travelerNameForm");
   const style=getComputedStyle(contacts);
   return {
    title:heading?.textContent,
    family:getComputedStyle(heading).fontFamily,
    borderStyle:style.borderTopStyle,
    borderWidth:parseFloat(style.borderTopWidth),
    paddingTop:parseFloat(style.paddingTop),
    gap:contacts.getBoundingClientRect().top-before.getBoundingClientRect().bottom,
    scrollWidth:document.documentElement.scrollWidth,innerWidth
   };
  });
  assert.match(design.title,/Mes coordonnées/);
  assert.match(design.family,/Georgia|serif/i,"account title should match existing serif heading");
  assert.equal(design.borderStyle,"solid");
  assert.ok(design.borderWidth>=1&&design.paddingTop>=20&&design.gap>=0,
   "a real divider and generous spacing must separate the account forms");
  assert.ok(design.scrollWidth<=design.innerWidth+1,
   "no horizontal overflow on a 360px account screen");
  assert.equal(await page.locator("#contactPhone").getAttribute("pattern"),null,
   "the browser must not reject formatted numbers before the normalizer");
  const accepted=[
   "+224 622 09 56 30","622095630","00224622095630",
   "(+224) 622.09-56-30"
  ];
  for(const [index,value] of accepted.entries()){
   await page.locator("#contactPhone").fill(value);
   await page.locator("#contactPhone").blur();
   assert.equal(await page.locator("#contactPhone").inputValue(),"+224 622 09 56 30",
    "blur must group a valid phone before saving: "+value);
   await page.locator("#contactPostalAddress").fill("Ratoma, Conakry");
   await page.locator("#contactDetailsForm").evaluate(form=>form.requestSubmit());
   await page.waitForFunction(expected=>
    window.__contactStore.updates.length===expected&&
    document.querySelector("#contactDetailsStatus")?.textContent?.includes("enregistrées"),
    index+1,{timeout:10000});
   assert.equal(await page.locator("#contactPhone").inputValue(),"+224 622 09 56 30",
    "saved value shown to the user must be grouped for "+value);
  }
  const updated=await page.evaluate(()=>window.__contactStore.updates);
  assert.deepEqual(updated,accepted.map(()=>({
   phone:"+224622095630",postal_address:"Ratoma, Conakry"
  })),"every accepted spelling must be saved in the same canonical format");

  // Server returns compact number at load; reloading must show grouped value.
  await page.reload({waitUntil:"load"});
  await page.waitForFunction(()=>!document.querySelector("#saveContactDetails")?.disabled,
   null,{timeout:12000});
  assert.equal(await page.locator("#contactPhone").inputValue(),"+224 622 09 56 30",
   "profile reload must display the compact stored phone grouped");
  const updatesAfterReload=await page.evaluate(()=>window.__contactStore.updates.length);
  const rejected=["+1","abc","+2246220956301234567","6220956301"];
  for(const value of rejected){
   await page.locator("#contactPhone").fill(value);
   // Use the real browser form submit (including HTML validity checks).
   await page.locator("#contactDetailsForm").evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>document.querySelector("#contactDetailsStatus")
    ?.textContent?.includes("Téléphone invalide"),null,{timeout:10000});
   const trace=await page.evaluate(()=>window.__contactStore.updates.length);
   assert.equal(trace,updatesAfterReload,"invalid phone must never reach Supabase: "+value);
   assert.match(await page.locator("#contactDetailsStatus").textContent(),/indicatif|6 à 15|224/,
    "error must guide the user with an international example");
  }
  await page.locator("#contactPhone").fill("+224 622 09 56 30");
  await page.locator("#contactPhone").blur();
  // Screenshot contains synthetic data only, not a real account.
  const shotDir=path.resolve("test-artifacts/travel-contact-finish");
  await fs.mkdir(shotDir,{recursive:true});
  await page.locator("#myAccount").screenshot({path:path.join(shotDir,"account-contacts-360.png")});

  // Unchecked PDF must neither reread extra columns nor call getUser().
  const off=await waitPopup(page,()=>page.locator("#pdf").click());
  let text=await off.locator("body").textContent();
  assert.match(text,/Voyages internationaux déclarés/);
  for(const value of ["verified@example.net","+224622095630","Ratoma, Conakry",
   "Coordonnées déclarées","SECRET_PERSONAL_MEMORY"])
   assert.ok(!text.includes(value),"unchecked PDF disclosed "+value);
  assert.equal(await page.locator("#includePdfContacts").isChecked(),false);
  await off.close();

  await page.locator("#includePdfContacts").check();
  const optin=await waitPopup(page,()=>page.locator("#pdf").click());
  text=await optin.locator("body").textContent();
  assert.match(text,/Coordonnées déclarées/);
  assert.match(text,/verified@example.net/);
  assert.match(text,/\+224 622 09 56 30/);
  assert.ok(!text.includes("+224622095630"),"HTML PDF must show grouped phone only");
  assert.match(text,/Ratoma, Conakry/);
  assert.ok(!text.includes("login@example.net"),"must use verified Auth getUser, not stale session email");
  assert.ok(!text.includes("SECRET_PERSONAL_MEMORY"));
  assert.equal(await page.locator("#includePdfContacts").isChecked(),false,
   "consent must immediately reset following generation");
  await optin.close();

  const trace=await page.evaluate(()=>window.__contactStore);
  assert.equal(trace.authChecks,1,"getUser must run only when opted in");
  const queries=trace.queries.filter(x=>x.table==="profiles");
  assert.ok(queries.some(x=>x.selected==="display_name,deleting"));
  assert.ok(queries.some(x=>x.selected==="display_name,deleting,phone,postal_address"));
  assert.ok(queries.some(x=>x.selected==="phone,postal_address,deleting"));
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  console.log("PASS real app mobile: profile contacts, verified Auth email, unchecked/one-shot opt-in, isolated factual PDF");
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(err=>{console.error(err);process.exitCode=1});
