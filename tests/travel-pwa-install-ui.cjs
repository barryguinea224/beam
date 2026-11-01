"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8");
const helper=path.resolve("travel/pwa.js");
const controls=[...html.matchAll(/<div class="beamInstall" data-beam-install-area>[\s\S]*?<\/div>/g)].map(m=>m[0]);
assert.equal(controls.length,2,"real login and dashboard must both offer install support");
for(const c of controls){
 assert.match(c,/data-beam-install-action hidden/,"native action initially hidden");
 assert.match(c,/<details class="beamInstallHelp" data-beam-install-help>/,"native details available without JS");
 assert.match(c,/data-beam-install-steps/);
 assert.match(c,/data-beam-install-status/);
 assert.ok(!/mailto:|https?:\/\/|localStorage|photo\.webp/.test(c),"UI must contain no personal data or external install URL");
}
function pageHtml(){
 return "<!doctype html><html lang=fr><head><meta charset=utf-8><style>"+
 ".beamInstall[hidden],.beamInstallButton[hidden]{display:none!important}"+
 "</style></head><body><section id=auth>"+controls[0]+"</section>"+
 "<main id=app>"+controls[1]+"</main></body></html>";
}
async function setup(browser,userAgent,standalone=false){
 const context=await browser.newContext({viewport:{width:360,height:740},userAgent});
 const page=await context.newPage();
 await page.setContent(pageHtml());
 if(standalone)await page.evaluate(()=>{
  Object.defineProperty(navigator,"standalone",{configurable:true,value:true});
 });
 await page.addScriptTag({path:helper});
 return {context,page};
}
const chrome="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const samsung="Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36";
const iphone="Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile Safari/604.1";
const pc="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  // Default: only a truthful manual guide, no fake/native promise.
  {
   const {page,context}=await setup(browser,chrome);
   try{
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0);
    assert.equal(await page.locator('[data-beam-install-help]:visible').count(),2);
    await page.locator("#app summary").click();
    assert.match(await page.locator("#app [data-beam-install-steps]").textContent(),/Chrome sur Android/);
    assert.match(await page.locator("#app [data-beam-install-steps]").textContent(),/WhatsApp/);
    // Browser offers installation only after its own eligibility check.
    const caught=await page.evaluate(()=>{
     const e=new Event("beforeinstallprompt",{cancelable:true});
     e.prompt=()=>Promise.resolve({outcome:"accepted"});
     window.__nativePrompts=0;
     const original=e.prompt;
     e.prompt=()=>{window.__nativePrompts++;return original()};
     window.dispatchEvent(e);
     return e.defaultPrevented;
    });
    assert.equal(caught,true,"prevent native promotion only if a usable prompt event exists");
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),2);
    assert.equal(await page.locator("#app [data-beam-install-action]").textContent(),"Installer BTH");
    assert.equal(await page.locator("#app [data-beam-install-action]").isDisabled(),false);
    await page.locator("#app [data-beam-install-action]").click();
    await page.waitForFunction(()=>window.__nativePrompts===1);
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0,
      "one-shot prompt must not remain active after accepting");
    assert.match(await page.locator("#app [data-beam-install-status]").textContent(),/Demande d’installation acceptée/);
    assert.equal(await page.locator('[data-beam-install-help]:visible').count(),2,
      "accepted does not prove installed; manual help remains available until appinstalled");
    await page.evaluate(()=>window.dispatchEvent(new Event("appinstalled")));
    assert.equal(await page.locator('[data-beam-install-area]:visible').count(),0,
      "hide controls once browser reports successful installation");
   }finally{await context.close()}
  }
  // Chrome rejection: no false "installed" status, manual help opens.
  {
   const {page,context}=await setup(browser,chrome);
   try{
    await page.evaluate(()=>{
     const e=new Event("beforeinstallprompt",{cancelable:true});
     e.prompt=()=>Promise.resolve({outcome:"dismissed"});
     window.dispatchEvent(e);
    });
    await page.locator("#auth [data-beam-install-action]").click();
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0);
    assert.equal(await page.locator("#auth [data-beam-install-help]").evaluate(el=>el.open),true);
    assert.match(await page.locator("#auth [data-beam-install-status]").textContent(),/Installation non confirmée/);
   }finally{await context.close()}
  }
  // Samsung Internet: explicit local menu steps, no unavailable native action.
  {
   const {page,context}=await setup(browser,samsung);
   try{
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0);
    await page.locator("#app summary").click();
    const text=await page.locator("#app [data-beam-install-steps]").textContent();
    assert.match(text,/Samsung Internet/);
    assert.match(text,/Ajouter la page à/);
    assert.match(text,/Écran d’accueil/);
   }finally{await context.close()}
  }
  // iPhone: Safari's share menu. No promise of beforeinstallprompt.
  {
   const {page,context}=await setup(browser,iphone);
   try{
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0);
    await page.locator("#app summary").click();
    const text=await page.locator("#app [data-beam-install-steps]").textContent();
    assert.match(text,/Safari/);
    assert.match(text,/Partager/);
    assert.match(text,/Ouvrir comme app web/);
   }finally{await context.close()}
  }
  // Standalone: no reinstall offer even if a stale beforeinstallprompt arrives.
  {
   const {page,context}=await setup(browser,iphone,true);
   try{
    assert.equal(await page.locator('[data-beam-install-area]:visible').count(),0);
    const status=await page.evaluate(()=>{
     let calls=0;const e=new Event("beforeinstallprompt",{cancelable:true});
     e.prompt=()=>{calls++;return Promise.resolve({outcome:"accepted"})};
     window.dispatchEvent(e);
     return {calls,defaultPrevented:e.defaultPrevented};
    });
    assert.deepEqual(status,{calls:0,defaultPrevented:false});
    assert.equal(await page.locator('[data-beam-install-area]:visible').count(),0);
   }finally{await context.close()}
  }
  // A desktop browser without a native event still has the honest help option.
  {
   const {page,context}=await setup(browser,pc);
   try{
    assert.equal(await page.locator('[data-beam-install-action]:visible').count(),0);
    await page.locator("#app summary").click();
    assert.match(await page.locator("#app [data-beam-install-steps]").textContent(),/Chrome ou Edge/);
   }finally{await context.close()}
  }
  console.log("PASS real installation UI: Chrome native accept/reject, Samsung instructions, iPhone Safari, standalone and desktop fallback");
 }finally{await browser.close()}
}
main().catch(err=>{console.error(err);process.exitCode=1});