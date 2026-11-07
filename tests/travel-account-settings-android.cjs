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
const {intercept:syntheticTravelConfig}=require("./helpers/synthetic-travel-config.cjs");
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",
 ".json":"application/json",".webmanifest":"application/manifest+json",
 ".png":"image/png",".webp":"image/webp"};
function serve(){
 return http.createServer(async(req,res)=>{
  if(syntheticTravelConfig(req,res))return;
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
 const profile={display_name:"Aminata Diallo",country_of_residence:"GN",deleting:false,access_until:"2099-12-31",
  phone:"+224612345678",postal_address:"Adresse fictive, Conakry"};
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
     if(table==="loyalty_memberships")return {data:[{id:"fixture-loyalty",program_code:"AF",member_number:"AB12-4821",tier:"Gold",miles_expiry:null}],error:null};
     if(table==="travel_history_pdf")return {data:[view],error:null};
     return {data:[],error:null};
    },
    maybeSingle(){return Promise.resolve({data:null,error:null})}
   };
   return api;
  }
 }}};
}

async function main(){
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const output=path.resolve("test-artifacts/jyetais-settings-android");
 await fs.mkdir(output,{recursive:true});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:820},isMobile:true,hasTouch:true,
    deviceScaleFactor:2,serviceWorkers:"block",userAgent:"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"});
   const page=await context.newPage();
   page.on("dialog",dialog=>{throw Error("Native browser dialog forbidden: "+dialog.message())});
   const errors=[];page.on("pageerror",err=>errors.push(err.message));
   await page.route("**/*",route=>{
    const hostname=new URL(route.request().url()).hostname;
    if(hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fakeSupabase.toString()+")();"});
    if(hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>!document.querySelector("#openAccount").classList.contains("hidden")&&
      document.querySelector("#dashboardTitle").textContent==="Aminata Diallo");
    const button=page.locator("#openAccount");
    assert.equal(await button.getAttribute("aria-label"),"Paramètres du compte");
    const box=await button.boundingBox();
    assert.ok(box.width>=44&&box.height>=44,"Settings icon touch target must be at least 44px");
    await page.screenshot({path:path.join(output,"accueil-"+width+".png"),animations:"disabled"});
    await button.click();
    assert.equal(await page.locator("#myAccountTitle").textContent(),"Paramètres");
    await page.locator(".loyaltyRow").waitFor({state:"visible",timeout:15000});
    for(const id of ["accountDisplayName","accountEmailValue","accountPhoneValue","accountAddressValue","residenceReadSummary","accountAccessValue"])
      assert.ok(await page.locator("#"+id).textContent(),"Missing account row: "+id);
    assert.match(await page.locator("#residenceReadSummary").textContent(),/Guinée/);
    assert.ok(await page.locator("#accountSensitive").isVisible(),"Non-empty sensitive action remains visible");
    assert.ok(await page.locator("#deleteAccountOpen").isVisible(),"Account deletion control not hidden");
    assert.equal(await page.locator("#accountLinks a").count(),2);
    assert.ok(await page.locator("#accountSession").evaluate(el=>{
      const sensitive=document.getElementById("accountSensitive");
      return !!(sensitive.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING);
    }),"Logout section must come after sensitive actions");
    const fit=await page.evaluate(()=>{
      const el=document.querySelector("#myAccount");
      return {page:document.documentElement.scrollWidth-innerWidth,account:el.scrollWidth-el.clientWidth,
       overlay:document.querySelector("#accountOverlay").scrollWidth-document.querySelector("#accountOverlay").clientWidth};
    });
    assert.ok(fit.page<=1&&fit.account<=1&&fit.overlay<=1,"Overflow "+width+": "+JSON.stringify(fit));
    const avatarButton=page.locator("#avatarMenuToggle");
    assert.ok((await avatarButton.boundingBox()).width>=44);
    await avatarButton.click();
    assert.ok(await page.locator("#avatarMenu").isVisible());
    assert.ok(await page.locator("#avatarChange").isVisible());
    assert.equal(await page.locator("#avatarChange").textContent(),"Changer la photo");
    assert.ok(!await page.locator("#avatarRemove").isVisible(),"No remove action without a photo");
    await page.screenshot({path:path.join(output,"menu-photo-"+width+".png"),animations:"disabled"});
    await page.locator("#loyaltyPanel .loyaltyMoreToggle").click();
    assert.ok(!await page.locator("#avatarMenu").isVisible(),"Photo menu closes when another target opens");
    assert.ok(await page.locator("#loyaltyPanel .loyaltyMoreMenu").isVisible());
    assert.ok(await page.getByRole("button",{name:"Modifier",exact:true}).isVisible());
    assert.ok(await page.getByRole("button",{name:"Supprimer",exact:true}).first().isVisible());
    const loyaltyButtons=await page.locator("#loyaltyPanel .loyaltyIconButton").count();
    assert.equal(loyaltyButtons,3);
    await page.screenshot({path:path.join(output,"menu-fidelite-"+width+".png"),animations:"disabled"});
    await page.locator("#closeAccount").click();
    await page.locator("#openAccount").click();
    assert.ok(!await page.locator("#avatarMenu").isVisible());
    await page.addStyleTag({content:[
      '#app .w > :not(#accountOverlay){display:none!important}',
      '#app .jyAppFooter{display:none!important}',
      '#accountOverlay{position:relative!important;inset:auto!important;display:block!important;overflow:visible!important;background:transparent!important}',
      '#accountOverlay #myAccount{position:relative!important;inset:auto!important;width:100%!important;max-width:720px!important;min-height:0!important;box-shadow:none!important;overflow:visible!important}',
      'html,body{overflow-x:hidden!important}'
    ].join("")});
    await page.screenshot({path:path.join(output,"parametres-complets-"+width+".png"),fullPage:true,animations:"disabled"});
    assert.deepEqual(errors,[],"Real app browser error: "+width);
    console.log("PASS real Android Chromium "+width+"px: home, full settings, photo menu, loyalty menu, nonempty sensitive area, masked member number");
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
