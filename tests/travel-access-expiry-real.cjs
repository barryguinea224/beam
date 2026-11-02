"use strict";
// Actual travel/index.html in Chromium, synthetic Auth/Storage only, no remote account.
const assert=require("node:assert/strict"),http=require("node:http");
const fs=require("node:fs/promises"),path=require("node:path");
const {chromium}=require("playwright");
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const root=path.resolve(__dirname,"../travel");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",
 ".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".png":"image/png",".webp":"image/webp"};
function server(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
  const p=new URL(req.url,"http://localhost").pathname;
  if(!p.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const f=path.resolve(root,p.slice(8)||"index.html");
  if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{res.writeHead(200,{"content-type":mime[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});res.end(await fs.readFile(f))}
  catch{res.writeHead(404);res.end()}
 });
}
function fakeSupabase(){
 const uid="22222222-2222-4222-8222-222222222222",email="expiry-fixture@example.invalid";
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,
  phone:null,postal_address:null,access_until:window.__fixtureUntil};
 const trip={id:"11111111-1111-4111-8111-111111111111",country_code:"FR",cities:["Paris"],
  entry_date:"2026-05-01",exit_date:"2026-05-05",duration_days:5,purpose:"tourisme",
  is_domestic:false,note:"",cover_media_id:null,deleting:false,user_id:uid};
 const media={id:"33333333-3333-4333-8333-333333333333",storage_path:uid+"/"+trip.id+"/33333333-3333-4333-8333-333333333333.webp"};
 window.__expiryCalls={deleted:false,signed:0};
 const loggedIn=()=>sessionStorage.getItem("bth-expiry-test-signed-out")!=="1";
 window.supabase={createClient(){return{
  auth:{
   async getSession(){return {data:{session:!loggedIn()?null:{access_token:"fixture-session",user:{id:uid,email}}}}},
   async getUser(){return {data:{user:!loggedIn()?null:{id:uid,email}},error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
   async signOut(){sessionStorage.setItem("bth-expiry-test-signed-out","1");return{error:null}}
  },
  from(table){
   const query={select(){return query},eq(){return query},limit(){return query},
    async single(){return {data:table==="profiles"?{...profile}:null,
      error:table==="profiles"?null:{message:"not implemented"}}},
    async maybeSingle(){return{data:null,error:null}},
    async order(){return {data:table==="trips"?[trip]:table==="media"?[media]:[],error:null}}
   };return query;
  },
  storage:{from(){return{
   async createSignedUrl(){window.__expiryCalls.signed++;return{data:{signedUrl:"https://signed.invalid/pic.webp"},error:null}},
   async download(){return{data:null,error:{message:"fixture unavailable"}}}
  }}},
  functions:{async invoke(name,{body}){if(name==="travel-delete"&&body?.action==="delete_account"){
    window.__expiryCalls.deleted=true;return{data:{ok:true,account_deleted:true},error:null}}
    return{data:null,error:{message:"fixture"}}}}
 }}};
}
const today=new Date().toISOString().slice(0,10);
function shift(days){const d=new Date(today+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
async function main(){
 const host=server();await new Promise(ok=>host.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [360,1024]){
   for(const entry of [
    {label:"active",until:shift(70),warning:false,readonly:false},
    {label:"warn30",until:shift(30),warning:true,readonly:false},
    {label:"warn31",until:shift(31),warning:false,readonly:false},
    {label:"expired",until:shift(-1),warning:true,readonly:true},
    {label:"null",until:null,warning:true,readonly:true}
   ]){
    const context=await browser.newContext({viewport:{width,height:800},
      isMobile:width===360,hasTouch:width===360,serviceWorkers:"block"});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(String(e)));
    await page.addInitScript(until=>{window.__fixtureUntil=until},entry.until);
    await page.route("**/*",route=>{
     const u=new URL(route.request().url());
     if(u.hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fakeSupabase.toString()+")();"});
     if(u.hostname==="127.0.0.1")return route.continue();
     return route.abort();
    });
    try{
     await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load"});
     await page.locator("#trips .tripOpen").first().waitFor({state:"visible",timeout:16000});
     assert.equal(await page.locator("#accessBanner").isVisible(),entry.warning,entry.label+" banner width "+width);
     if(entry.warning){
      assert.equal(await page.locator('#accessBanner a[href="https://wa.me/224622095630"]').isVisible(),true);
      const text=await page.locator("#accessBanner").innerText();
      assert.match(text,entry.readonly? /reste consultable/:/Votre accès se termine le/);
     }
     assert.equal(await page.locator("#add").isVisible(),!entry.readonly);
     assert.equal(await page.locator("#printJournal").isVisible(),true);
     assert.equal(await page.locator("#pdf").isVisible(),true);
     assert.equal(await page.locator("#openAccount").isVisible(),true);
     await page.locator("#trips .tripOpen").first().click();
     await page.locator("#tripDetailModal").waitFor({state:"visible"});
     assert.equal(await page.locator("#detailEdit").isVisible(),!entry.readonly);
     assert.equal(await page.locator("#detailActivityForm").isVisible(),!entry.readonly);
     await page.locator("#detailPhotos img").first().waitFor({state:"attached"});
     await page.locator("#detailClose").click();
     // PDF factuel must still be launched even after expiry (it requires no writes).
     if(entry.label==="expired"){
      const popupPromise=page.waitForEvent("popup",{timeout:10000});
      await page.locator("#pdf").click();
      const popup=await popupPromise;
      await popup.close();
     }
     await page.locator("#openAccount").click();
     await page.locator("#accountOverlay").waitFor({state:"visible"});
     const summary=await page.locator("#accountReadSummary").innerText();
     assert.match(summary,entry.until?/Accès jusqu'au/:/Accès : à activer/);
     assert.equal(await page.locator("#editAccount").isVisible(),!entry.readonly);
     if(entry.label==="expired"){
      await page.locator("#accountSensitive summary").click();
      await page.locator("#deleteAccountOpen").click();
      await page.locator("#deleteAccountConfirm").fill("SUPPRIMER");
      await page.locator("#deleteAccountSubmit").click();
      await page.locator("#auth").waitFor({state:"visible"});
      assert.equal(await page.evaluate(()=>window.__expiryCalls.deleted),true);
     } else {
      await page.locator("#logout").click();
      await page.locator("#auth").waitFor({state:"visible"});
     }
     assert.deepEqual(errors,[],entry.label+" browser errors at "+width);
     console.log("PASS real access banner, account, photos, PDF & deletion "+entry.label+" at "+width+"px");
    } finally{await context.close()}
   }
  }
 } finally{await browser.close();await new Promise(ok=>host.close(ok))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
