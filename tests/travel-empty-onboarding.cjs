"use strict";
const assert=require("node:assert/strict"),http=require("node:http"),fs=require("node:fs/promises"),path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222";
 const profile={display_name:null,country_of_residence:"GN",deleting:false,phone:null,postal_address:null};
 const trips=[];
 window.__fixture={profile,trips};
 window.supabase={createClient(){return {
  auth:{
   getSession:async()=>({data:{session:{user:{id:uid,email:"fictive@example.test"}}}}),
   getUser:async()=>({data:{user:{id:uid,email:"fictive@example.test"}},error:null}),
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
  },
  from(table){
   let update=null,insert=null;
   const q={
    select(){return q},eq(){return q},limit(){return q},
    update(row){update=row;return q},insert(row){insert=row;return q},
    order:async()=>({data:table==="trips"?trips:[],error:null}),
    single:async()=>{
     if(table==="profiles"){
      if(update)Object.assign(profile,update);
      return {data:{...profile},error:null};
     }
     if(table==="trips"&&insert){
      const trip={...insert,id:"11111111-1111-4111-8111-111111111111",
       duration_days:6,cover_media_id:null,deleting:false,user_id:uid};
      trips.push(trip);return {data:trip,error:null};
     }
     return {data:null,error:{message:"not implemented "+table}};
    }
   };return q;
  },
  storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:""},error:null})}}}
 }}};
}
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".png":"image/png"};
async function main(){
 const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://local").pathname;
  if(!pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const rel=pathname.slice(8)||"index.html",target=path.resolve(root,rel);
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{const body=await fs.readFile(target);res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream"});res.end(body)}
  catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  await page.route("**/*",route=>{
   const u=new URL(route.request().url);
   if(u.hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fakeSupabase.toString()+")();"});
   if(u.hostname==="127.0.0.1")return route.continue();
   return route.abort();
  });
  await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
  await page.locator("#welcomeCard").waitFor({state:"visible"});
  assert.equal(await page.locator("#travelMapPanel").isVisible(),false);
  assert.equal(await page.locator("#filterAnchor").isVisible(),false);
  assert.equal(await page.locator("#pdf").isVisible(),false);
  assert.equal(await page.locator("#printJournal").isVisible(),false);
  assert.equal(await page.locator("#includePdfContacts").isVisible(),false);
  assert.match(await page.locator("#trips").innerText(),/Aucun voyage pour le moment/);
  assert.equal(await page.locator("#addFirstTrip").isVisible(),true);
  const shots=path.resolve("test-artifacts/travel-onboarding-real");
  await fs.mkdir(shots,{recursive:true});
  await page.screenshot({path:path.join(shots,"empty-360.png"),fullPage:true});
  await page.locator("#welcomeName").click();
  assert.equal(await page.locator("#accountOverlay").evaluate(el=>el.classList.contains("accountEditing")),true);
  assert.equal(await page.locator("#travelerName").evaluate(el=>el===document.activeElement),true);
  await page.locator("#travelerName").fill("Mariama Doumbouya");
  await page.locator("#saveContactDetails").click();
  await page.waitForFunction(()=>window.__fixture.profile.display_name==="Mariama Doumbouya");
  await page.locator("#closeAccount").click();
  assert.equal(await page.locator("#welcomeName").evaluate(el=>el.classList.contains("done")),true);
  await page.locator("#addFirstTrip").click();
  assert.equal(await page.locator("#modal").evaluate(el=>el.classList.contains("open")),true);
  await page.locator("#tripCountrySelect").selectOption("SN");
  const cities=page.locator('#tripForm [name="cities"]');
  await cities.fill("New york");
  await cities.blur();
  assert.equal(await cities.inputValue(),"New York");
  await page.locator('#tripForm [name="entry_date"]').fill("2026-07-01");
  await page.locator('#tripForm [name="exit_date"]').fill("2026-07-06");
  await page.locator("#saveTrip").click();
  await page.waitForFunction(()=>window.__fixture.trips.length===1);
  await page.locator("#welcomeCard").waitFor({state:"hidden"});
  assert.equal(await page.locator("#travelMapPanel").isVisible(),true);
  assert.equal(await page.locator("#pdf").isVisible(),true);
  assert.equal(await page.locator("#printJournal").isVisible(),true);
  assert.equal(await page.locator("#toggleFilters").isVisible(),true);
  await page.screenshot({path:path.join(shots,"first-trip-360.png"),fullPage:true});
  await page.locator(".tripOpen").first().click();
  assert.equal(await page.locator("#activityDate option").first().innerText(),"Sans date");
  assert.match(await page.locator('label[for="activityDate"]').innerText(),/Choisir un jour du voyage/);
  console.log("PASS genuine Android 360px: empty welcome, name, first trip, PDF/map reappear, city suggestion and optional day");
  await page.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(err=>{console.error(err);process.exitCode=1});
