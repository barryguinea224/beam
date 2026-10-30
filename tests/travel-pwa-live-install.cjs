"use strict";
// Public preview only; never log Auth cookies, tokens or personal travel data.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const origin="https://deploy-preview-3--inquisitive-boba-e06b58.netlify.app";
const path="/travel/";
async function fetchStatus(url) {
  try {
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),13000);
    const r=await fetch(url,{redirect:"follow",signal:ctrl.signal,cache:"no-store"});
    clearTimeout(timer);
    const buf=Buffer.from(await r.arrayBuffer());
    return {url:new URL(url).pathname,status:r.status,final:new URL(r.url).pathname,mime:r.headers.get("content-type")||"",bytes:buf.length,buffer:buf};
  }catch(e){return {url:new URL(url).pathname,status:"NETWORK_ERROR",message:String(e).slice(0,100)}}
}
async function main() {
  const script=fs.readFileSync("travel/sw.js","utf8");
  const scripts=[];
  const self={
    location:{origin},registration:{scope:origin+path},
    addEventListener:(type,callback)=>scripts.push(type),
    clients:{claim:async()=>{}},skipWaiting:async()=>{}
  };
  const context=vm.createContext({self,URL,caches:{},fetch,Response});
  vm.runInContext(script,context);
  const publicPaths=Array.from(vm.runInContext("PUBLIC_SHELL.map(p => new URL(p,self.registration.scope).pathname)",context));
  const urls=[path,path+"index.html",path+"sw.js",...publicPaths];
  const unique=[...new Set(urls)];
  const statuses=await Promise.all(unique.map(p=>fetchStatus(origin+p)));
  for(const x of statuses){
    const code=String(x.status).padEnd(3);
    console.log("ASSET",code,String(x.bytes||0).padStart(7),x.mime||"",x.url,x.message||"");
  }
  const broken=statuses.filter(x=>x.status!==200);
  if(broken.length)console.error("BROKEN_LIVE_ASSETS",broken.map(x=>({url:x.url,status:x.status})));
  const manifest=statuses.find(x=>x.url===path+"manifest.webmanifest");
  if(manifest?.status===200){
    const m=JSON.parse(manifest.buffer.toString("utf-8"));
    console.log("MANIFEST",JSON.stringify({name:m.name,id:m.id,start_url:m.start_url,scope:m.scope,display:m.display,icons:m.icons}));
  }
  for(const p of ["icon-192.png","icon-512.png","icon-maskable-512.png"]){
    const x=statuses.find(x=>x.url===path+"icons/"+p);
    if(x?.status!==200)continue;
    const png=x.buffer;
    const isPng=png.subarray(0,8).toString("hex")==="89504e470d0a1a0a";
    console.log("PNG",p,{isPng,width:isPng?png.readUInt32BE(16):null,height:isPng?png.readUInt32BE(20):null,bytes:png.length});
  }
  const browser=await chromium.launch({headless:true});
  try {
    const ctx=await browser.newContext({serviceWorkers:"allow"});
    const page=await ctx.newPage();
    const client=await ctx.newCDPSession(page);
    await client.send("Page.enable");
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message.slice(0,200)));
    const nav=await page.goto(origin+path+"index.html",{waitUntil:"domcontentloaded",timeout:25000});
    console.log("BROWSER_NAV",{status:nav?.status(),url:page.url()});
    await page.waitForTimeout(8000);
    const swInfo=await page.evaluate(async()=>{
      const reg=await navigator.serviceWorker?.getRegistration("/travel/");
      return {isSecureContext,hasSW:!!navigator.serviceWorker,registration:!!reg,
        active:reg?.active?.state||null,installing:reg?.installing?.state||null,
        waiting:reg?.waiting?.state||null,controller:!!navigator.serviceWorker?.controller,
        manifestURL:document.querySelector('link[rel="manifest"]')?.href||null};
    });
    console.log("BROWSER_SERVICE_WORKER",JSON.stringify(swInfo));
    try {
      const app=await client.send("Page.getAppManifest");
      console.log("CHROME_MANIFEST",JSON.stringify({url:app.url,errors:app.errors,parsed:!!app.data}));
    }catch(e){console.log("CHROME_MANIFEST_UNAVAILABLE",String(e).slice(0,200))}
    try {
      const install=await client.send("Page.getInstallabilityErrors");
      console.log("CHROME_INSTALLABILITY",JSON.stringify(install));
    }catch(e){console.log("CHROME_INSTALLABILITY_UNAVAILABLE",String(e).slice(0,200))}
    console.log("BROWSER_PAGE_ERRORS",JSON.stringify(errors.slice(0,8)));
    await ctx.close();
  }finally {await browser.close()}
  if(broken.length)process.exitCode=1;
}
main().catch(e=>{console.error("DIAGNOSTIC_FAILED",e.message);process.exitCode=1});
