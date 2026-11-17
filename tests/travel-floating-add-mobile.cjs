"use strict";
// Real Android-sized J'y étais shell. All Supabase rows and identities are fictional.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const output=path.resolve("test-artifacts/floating-add-share");
async function main(){
 await fs.mkdir(output,{recursive:true});
 const server=serve();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,
     contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"});
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    assert.equal(await page.locator("#addFloating").isVisible(),false,"No shortcut at page top");
    assert.equal(await page.locator("#addFloating").getAttribute("aria-label"),"Ajouter un voyage");
    assert.equal(await page.locator("#addFloating").evaluate(el=>getComputedStyle(el).width),"56px");
    const viewport=await page.evaluate(()=>({
     scrollWidth:document.documentElement.scrollWidth,innerWidth,footer:!!document.querySelector(".jyAppFooter")
    }));
    assert.ok(viewport.scrollWidth<=width+1,"Home overflow at "+width+": "+JSON.stringify(viewport));
    assert.equal(viewport.footer,true);
    // Give the synthetic fixture enough scroll room without adding real client records.
    await page.evaluate(()=>{
     const spacer=document.createElement("div");spacer.style.height="900px";
     spacer.setAttribute("aria-hidden","true");document.body.append(spacer);
     const button=document.querySelector("#add");
     window.scrollTo(0,Math.ceil(button.getBoundingClientRect().bottom+scrollY+40));
    });
    await page.waitForFunction(()=>!document.querySelector("#addFloating").hidden);
    assert.equal(await page.locator("#addFloating").isVisible(),true,"Shortcut after main action");
    const position=await page.locator("#addFloating").evaluate(el=>{
     const r=el.getBoundingClientRect();
     return {width:r.width,height:r.height,right:innerWidth-r.right,bottom:innerHeight-r.bottom,
      scrollWidth:document.documentElement.scrollWidth};
    });
    assert.equal(position.width,56);
    assert.equal(position.height,56);
    assert.ok(position.bottom>=15&&position.right>=15,"Shortcut clears Android navigation inset");
    assert.ok(position.scrollWidth<=width+1,"Floating button causes horizontal overflow");
    if(width===360)await page.screenshot({
     path:path.join(output,"bouton-flottant-360.png"),animations:"disabled"
    });
    // Existing form, not a separate implementation.
    await page.locator("#addFloating").click();
    assert.equal(await page.locator("#modal").evaluate(el=>el.classList.contains("open")),true);
    assert.equal(await page.locator("#tripTitle").textContent(),"Ajouter un voyage");
    assert.equal(await page.locator("#addFloating").isVisible(),false,"Must disappear behind form");
    await page.locator("#close").click();
    await page.waitForFunction(()=>!document.querySelector("#addFloating").hidden);
    // Other sheets and dialogs block the fixed affordance.
    for(const [selector,open] of [
     ["#accountOverlay","accountOpen"],["#tripDetailModal","open"],
     ["#photoActionOverlay","open"],["#filterPanel","filterOpen"]]){
     await page.evaluate(({selector,open})=>document.querySelector(selector).classList.add(open),
      {selector,open});
     await page.waitForFunction(()=>document.querySelector("#addFloating").hidden);
     await page.evaluate(({selector,open})=>document.querySelector(selector).classList.remove(open),
      {selector,open});
     await page.waitForFunction(()=>!document.querySelector("#addFloating").hidden);
    }
    await page.evaluate(()=>document.querySelector("#pdfDialog").showModal());
    await page.waitForFunction(()=>document.querySelector("#addFloating").hidden);
    await page.evaluate(()=>document.querySelector("#pdfDialog").close());
    await page.waitForFunction(()=>!document.querySelector("#addFloating").hidden);
    // Expired accounts have no write action even though the big button is above view.
    await page.evaluate(()=>{profile.access_until="2000-01-01";renderAccessUi()});
    assert.equal(await page.locator("#addFloating").isVisible(),false,"Read-only never sees FAB");
    assert.equal(await page.locator("#add").isVisible(),false,"Matches normal action's access gate");
    await page.evaluate(()=>document.querySelector("#addFloating").click());
    assert.equal(await page.locator("#modal").evaluate(el=>el.classList.contains("open")),false);
    await page.evaluate(()=>{profile.access_until="2099-12-31";renderAccessUi();scrollTo(0,0)});
    await page.waitForFunction(()=>document.querySelector("#addFloating").hidden);
    assert.equal(await page.locator("#addFloating").isVisible(),false,"No shortcut back at top");
    assert.deepEqual(errors,[],"No JS errors for "+width+": "+errors.join("; "));
    console.log("PASS "+width+"px: scroll threshold, shared editor, all overlays, read-only, safe area, no overflow");
   }finally{await context.close()}
  }
  const css=await fs.readFile(path.resolve("travel/home-simple.css"),"utf8");
  assert.match(css,/@media\(display-mode:standalone\)\{\.jyAppFooter\{display:none!important\}\}/);
  console.log("PASS standalone footer hidden by display-mode media query");
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
