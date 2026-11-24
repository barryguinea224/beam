"use strict";
// J'y étais — mesures de LABORATOIRE de l'accueil (pas de données terrain) :
// LCP et CLS, compte fictif avec photos de synthèse, téléphone modeste simulé
// (processeur ralenti 4×, 200 Ko/s, 150 ms de latence). 3 passages par version.
// Usage : node tests/travel-home-perf.cjs [ref:<git-ref>]  (compare avec cette version)
const {chromium}=require("playwright");
const {execFileSync}=require("node:child_process");
const fs=require("node:fs");
const path=require("node:path");
const {serve}=require("./travel-day-excursions-mobile.cjs");
const FIX=require("./helpers/home-photo-fixture.cjs");
async function run(ref,throttle){
 const server=serve();await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const b=await chromium.launch({args:["--no-sandbox"]});const res=[];
 try{
  for(let i=0;i<3;i++){
   const ctx=await b.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   const page=await ctx.newPage();
   if(throttle){const cdp=await ctx.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:200*1024,uploadThroughput:100*1024});
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});}
   await page.addInitScript(()=>{window.__cls=0;window.__lcp=0;window.__lcpEl="";
    new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:"layout-shift",buffered:true});
    new PerformanceObserver(l=>{const e=l.getEntries().at(-1);window.__lcp=e.startTime;window.__lcpEl=(e.element?.id||e.element?.className||e.element?.tagName||"")+""}).observe({type:"largest-contentful-paint",buffered:true})});
   await page.route("**/*",route=>{const url=new URL(route.request().url());
    if(url.hostname==="fixture.invalid"){const body=FIX.photoRoute(url);return route.fulfill({status:200,contentType:"image/svg+xml",body})}
    if(url.hostname!=="127.0.0.1")return route.abort();
    if(url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",body:FIX.vendor(FIX.scenarios().photos)});
    // Les deux versions passent par le même chemin (réponse interceptée), pour une comparaison juste.
    if(url.pathname.startsWith("/travel/")&&url.pathname!=="/travel/config.js"){const file=url.pathname==="/travel/"?"index.html":url.pathname.slice(8);
     try{const body=ref?execFileSync("git",["show",ref+":travel/"+file]):fs.readFileSync(path.join(__dirname,"../travel",file));const ext=file.split(".").pop();
      return route.fulfill({status:200,contentType:{html:"text/html",css:"text/css",js:"application/javascript",svg:"image/svg+xml",json:"application/json",woff2:"font/woff2"}[ext]||"application/octet-stream",body})}
     catch{return route.fulfill({status:404})}}
    return route.continue()});
   await page.goto(`http://127.0.0.1:${server.address().port}/travel/`,{waitUntil:"load"});
   await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Mariama Diallo");
   await page.waitForTimeout(4000);
   res.push(await page.evaluate(()=>({lcp:Math.round(__lcp),cls:Math.round(__cls*1000)/1000,lcpElement:__lcpEl})));
   await ctx.close();
  }
 }finally{await b.close();server.close()}
 return res;
}
(async()=>{
 const ref=(process.argv.find(a=>a.startsWith("ref:"))||"").slice(4);
 for(const throttle of [false,true]){
  const label=throttle?"téléphone modeste simulé":"sans ralentissement";
  if(ref)console.log(label,"avant",JSON.stringify(await run(ref,throttle)));
  console.log(label,"après",JSON.stringify(await run(null,throttle)));
 }
})().catch(e=>{console.error(e);process.exit(1)});
