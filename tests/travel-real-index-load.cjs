"use strict";
// Real browser smoke test: Chromium navigates to travel/index.html and executes
// its ACTUAL <script src> tags, unlike tests that add scripts in a safe order.
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const mime={
 ".html":"text/html; charset=utf-8",
 ".js":"application/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",
 ".json":"application/json",
 ".webmanifest":"application/manifest+json",
 ".svg":"image/svg+xml",
 ".png":"image/png",
 ".webp":"image/webp"
};
function server(){
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(!url.pathname.startsWith("/travel/")){
   res.writeHead(404);res.end();return;
  }
  const rel=url.pathname.slice("/travel/".length)||"index.html";
  const filename=path.resolve(root,rel);
  if(!filename.startsWith(root+path.sep)){
   res.writeHead(403);res.end();return;
  }
  try{
   const bytes=await fs.readFile(filename);
   res.writeHead(200,{"content-type":mime[path.extname(filename)]||"application/octet-stream",
    "cache-control":"no-store","x-content-type-options":"nosniff"});
   res.end(bytes);
  }catch{
   if(url.pathname.endsWith("/favicon.ico"))res.writeHead(204);
   else res.writeHead(404,{"content-type":"text/plain"});
   res.end();
  }
 });
}
async function main(){
 const httpServer=server();
 await new Promise((resolve,reject)=>httpServer.listen(0,"127.0.0.1",error=>error?reject(error):resolve()));
 const url="http://127.0.0.1:"+httpServer.address().port+"/travel/";
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const context=await browser.newContext({
   viewport:{width:360,height:780},isMobile:true,hasTouch:true,
   // Prevent a stale service worker from hiding an index.html regression.
   serviceWorkers:"block"
  });
  const page=await context.newPage();
  const errors=[],consoleErrors=[],remote=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text())});
  await page.route("**/*",route=>{
   const destination=new URL(route.request().url());
   if(destination.hostname==="127.0.0.1")return route.continue();
   remote.push(destination.origin);
   // No Supabase credentials, sessions, production API calls or CDN requests.
   // The Supabase CDN is deliberately absent; the page should fail closed.
   return route.fulfill({status:200,contentType:"application/javascript",body:""});
  });
  const response=await page.goto(url,{waitUntil:"load",timeout:20000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.readyState==="complete");
  const actual=await page.evaluate(()=>({
   title:document.title,
   scripts:[...document.querySelectorAll('script[src]')].map(s=>new URL(s.src).pathname.split("/").pop()),
   globals:{
    personal:typeof window.BEAM_PERSONAL_JOURNAL,
    filters:typeof window.BEAM_DASHBOARD_FILTERS,
    factual:typeof window.BEAM_TRAVEL_PDF,
    visual:typeof window.BEAM_VISUAL_CARDS
   },
   journalRender:typeof window.BEAM_PERSONAL_JOURNAL?.render,
   clickHandler:typeof document.querySelector("#printJournal")?.onclick,
   fallback:document.querySelector("#loginMsg")?.textContent,
   appHidden:document.querySelector("#app")?.classList.contains("hidden"),
   authHidden:document.querySelector("#auth")?.classList.contains("hidden")
  }));
  assert.match(actual.title,/BEAM Travel History/);
  assert.deepEqual(actual.globals,{personal:"object",filters:"object",factual:"object",visual:"object"});
  assert.equal(actual.journalRender,"function","journal must initialize when the REAL HTML loads");
  assert.equal(actual.clickHandler,"function","click handler must exist even without Supabase");
  assert.ok(actual.scripts.indexOf("dashboard-filters.js")<actual.scripts.indexOf("printable-journal.js"));
  assert.ok(actual.scripts.indexOf("visual-cards.js")<actual.scripts.indexOf("printable-journal.js"));
  assert.equal(actual.appHidden,true);
  assert.equal(actual.authHidden,false);
  assert.match(actual.fallback,/Configuration Supabase requise/,"no client must fail closed");
  assert.deepEqual(errors,[],"uncaught page errors are forbidden");
  assert.deepEqual(consoleErrors,[],"console errors while loading the real page are forbidden");
  assert.ok(remote.every(origin=>origin.startsWith("https://cdn.jsdelivr.net")),
   "unexpected external request: "+remote.join(", "));
  console.log("PASS real travel/index.html Chrome 360px: 4 globals, journal click, no errors or remote private access");
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>httpServer.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
