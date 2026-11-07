"use strict";
// Mobile account captures using the actual J'y étais account markup and UI controller.
// Local mock Supabase only; ALL IDs, numbers and customer data are fictional.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const raw=fs.readFileSync("travel/index.html","utf8");
const skeleton=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,"");
const css=fs.readFileSync("travel/loyalty.css","utf8");
const files=["loyalty-programs.js","loyalty-ui.js"];
const data=[{id:"fixture-0001",program_code:"AF",member_number:"AB12-4821",tier:"Gold",miles_expiry:null}];
async function main(){
 fs.mkdirSync("test-artifacts/loyalty-android",{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   try{
    await page.setContent(skeleton,{waitUntil:"domcontentloaded"});
    await page.addStyleTag({content:css});
    for(const file of files)await page.addScriptTag({path:path.resolve("travel",file)});
    await page.evaluate(initRows=>{
     window.confirm=()=>{throw Error("No native confirmation allowed")};
     const account=document.querySelector("#accountOverlay");account.classList.add("accountOpen");
     account.setAttribute("aria-hidden","false");
     document.querySelector("#app").classList.remove("hidden");
     document.querySelector("#myAccount").classList.remove("hidden");
     window.__loyaltyRows=initRows;
     const clone=row=>({...row});
     const queryRows=()=>window.__loyaltyRows.map(clone);
     const fake={
      from(table){
       if(table!=="loyalty_memberships")throw Error("Access to unrelated table");
       return {
        select(){
         return {eq(field,value){
          if(field!=="user_id"||value!=="fixture-owner")throw Error("Missing owner filter");
          return {order:async()=>({data:queryRows(),error:null})};
         }};
        },
        insert(record){
         if("user_id" in record||"password" in record)throw Error("Unexpected private insert");
         if(window.__loyaltyRows.some(r=>r.program_code===record.program_code))return Promise.resolve({error:{code:"23505"}});
         window.__loyaltyRows.push({id:"fixture-0002",...record});
         return Promise.resolve({error:null});
        },
        update(patch){
         return {eq(field,id){
          if(field!=="id")throw Error("Missing row id");
          return {eq:async(ownerColumn,ownerId)=>{
           if(ownerColumn!=="user_id"||ownerId!=="fixture-owner")throw Error("Missing owner filter");
           const row=window.__loyaltyRows.find(r=>r.id===id);if(row)Object.assign(row,patch);
           return {error:null};
          }};
         }};
        },
        delete(){
         return {eq(field,id){
          if(field!=="id")throw Error("Missing row id");
          return {eq:async(ownerColumn,ownerId)=>{
           if(ownerColumn!=="user_id"||ownerId!=="fixture-owner")throw Error("Missing owner filter");
           window.__loyaltyRows=window.__loyaltyRows.filter(r=>r.id!==id);
           return {error:null};
          }};
         }};
        }
       };
      }
     };
     window.__loyalty=window.BEAM_LOYALTY_UI.init({
      supabase:fake,user:()=>({id:"fixture-owner"}),isActive:()=>true,canWrite:()=>true,onChange:()=>{}
     });
    },data);
    await page.evaluate(()=>window.__loyalty.reload());
    assert.equal(await page.locator(".loyaltyRow").count(),1);
    assert.equal(await page.locator(".loyaltyIconButton").count(),3,"Three compact actions");
    assert.equal(await page.locator(".loyaltyMoreMenu").isVisible(),false,"No open menu by default");
    assert.ok((await page.locator(".loyaltyNumber").innerText()).includes("•••• 4821"));
    assert.ok(!(await page.locator("#loyaltyOwned").innerText()).includes("AB12-4821"),
     "No unmasked number appears before explicit reveal");
    await page.locator(".loyaltyActions button").first().click();
    assert.ok((await page.locator(".loyaltyNumber").innerText()).includes("AB12-4821"));
    await page.locator(".loyaltyActions button").first().click();
    assert.ok((await page.locator(".loyaltyNumber").innerText()).includes("•••• 4821"));
    const anchors=await page.locator("#loyaltyAvailable a").evaluateAll(nodes=>nodes.map(a=>({url:a.href,rel:a.rel,target:a.target})));
    assert.equal(anchors.length,7);
    assert.ok(anchors.every(a=>a.url.startsWith("https://")&&a.rel.includes("noopener")&&a.target==="_blank"));
    await page.locator("#loyaltyAdd").click();
    await page.locator("#loyaltyProgram").selectOption("EK");
    await page.locator("#loyaltyNumber").fill("EK-739221");
    await page.locator("#loyaltySubmit").click();
    await page.waitForFunction(()=>document.querySelectorAll(".loyaltyRow").length===2);
    const last=page.locator(".loyaltyRow").last();
    assert.ok((await last.innerText()).includes("•••• 9221"));
    await last.locator(".loyaltyMoreToggle").click();
    await last.getByRole("button",{name:"Modifier"}).click();
    await page.locator("#loyaltyTier").fill("Silver");
    await page.locator("#loyaltyNumber").fill("EK-3339");
    await page.locator("#loyaltySubmit").click();
    await page.waitForFunction(()=>[...document.querySelectorAll(".loyaltyRow")].some(n=>n.textContent.includes("3339")));
    await last.locator(".loyaltyMoreToggle").click();
    await last.getByRole("button",{name:"Supprimer"}).click();
    assert.equal(await page.locator("#loyaltyDeleteConfirm").isVisible(),true);
    assert.equal(await page.locator(".loyaltyRow").count(),2,"No deletion before explicit confirmation");
    await page.locator("#loyaltyCancelDelete").click();
    assert.equal(await page.locator(".loyaltyRow").count(),2);
    await last.locator(".loyaltyMoreToggle").click();
    await last.getByRole("button",{name:"Supprimer"}).click();
    await page.locator("#loyaltyConfirmDelete").click();
    await page.waitForFunction(()=>document.querySelectorAll(".loyaltyRow").length===1);
    const audit=await page.evaluate(()=>{
     const panel=document.querySelector("#loyaltyPanel");
     const rect=panel.getBoundingClientRect();
     return {windowWidth:innerWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth,
      panelOverflow:panel.scrollWidth-panel.clientWidth,panelLeft:rect.left,panelRight:rect.right,
      logos:[...panel.querySelectorAll("img,svg")].filter(x=>!x.classList.contains("uiIcon")).length,
      uiIcons:panel.querySelectorAll("svg.uiIcon").length,
      passwordFields:panel.querySelectorAll('input[type="password"]').length};
    });
    assert.ok(audit.documentOverflow<=1&&audit.panelOverflow<=1,"Overflow at "+width+": "+JSON.stringify(audit));
    assert.equal(audit.logos,0,"No airline logo or image: only the app's own line icons");assert.ok(audit.uiIcons>=2,"eye and copy are drawn as line icons");assert.equal(audit.passwordFields,0);
    // In the real app the account drawer is a fixed scrolling overlay. For an
    // isolated full-height screenshot, unfix the drawer so Chromium does not
    // stitch unrelated underlying page sections into the long image.
    await page.addStyleTag({content:[
     '#accountOverlay{position:static!important;inset:auto!important;display:block!important;overflow:visible!important;background:transparent!important}',
     '#accountOverlay #myAccount{position:static!important;inset:auto!important;width:100%!important;max-width:100%!important;min-height:0!important;box-shadow:none!important;overflow:visible!important}',
     '#myAccount > :not(#loyaltyPanel){display:none!important}',
     '#loyaltyPanel{max-height:none!important;overflow:visible!important}',
     'html,body{overflow:visible!important}'
    ].join('')});
    await page.locator("#loyaltyPanel").screenshot({
     path:path.join("test-artifacts/loyalty-android","programmes-"+width+".png"),animations:"disabled"
    });
    console.log("PASS loyalty Android "+width+"px — masked number, reveal, CRUD, inline delete, official links, no overflow");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
