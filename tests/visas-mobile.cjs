"use strict";
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {chromium}=require("playwright");
const {buildSite}=require("../scripts/build-visas.cjs");
const repositoryRoot=path.resolve(__dirname,"..");
let root=repositoryRoot;
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
function serve(){
 return http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/visas/")){res.writeHead(404);return res.end();}
  const filename=pathname.endsWith("/")?pathname+"index.html":pathname;
  const dest=path.resolve(root,"."+filename);
  if(!dest.startsWith(path.join(root,"visas")+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(dest,(err,data)=>{
   if(err){res.writeHead(404);return res.end();}
   res.writeHead(200,{"content-type":mime[path.extname(dest)]||"application/octet-stream","cache-control":"no-store"});
   res.end(data);
  });
 });
}
function lum(c){
 const m=c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
 assert.ok(m,"computed color must be RGB: "+c);
 const colors=m.slice(1,4).map(n=>Number(n)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return colors[0]*.2126+colors[1]*.7152+colors[2]*.0722;
}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function main(){
 // A real validated France fiche takes priority when provided by BEAM.
 // Otherwise use an isolated explicit EXEMPLE test fixture; NEVER copy
 // that unverified content into the published visas/data directory.
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"beam-visas-browser-"));
 root=scratch;
 fs.mkdirSync(path.join(root,"visas/data"),{recursive:true});
 fs.copyFileSync(path.join(repositoryRoot,"visas/style.css"),path.join(root,"visas/style.css"));
 const source=path.join(repositoryRoot,"visas/data/france.json");
 const actualFrance=fs.existsSync(source);
 const fixture=actualFrance?source:path.join(repositoryRoot,"tests/fixtures/visas/exemple.json");
 const data=JSON.parse(fs.readFileSync(fixture,"utf8"));
 if(actualFrance){
  assert.equal(data.statut,"publie","the BEAM France source must be published");
  assert.equal(data.types_visa.reduce((sum,type)=>sum+type.documents.length,0),16,
   "the actual BEAM France fiche must preserve its 16 documents");
 }
 fs.copyFileSync(fixture,path.join(root,"visas/data/france.json"));
 buildSite({root,mode:actualFrance?"production":"preview"});
 const server=serve();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const out=path.join(repositoryRoot,"test-artifacts/visas-mobile");
 fs.mkdirSync(out,{recursive:true});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   const page=await context.newPage();
   const outsiders=[];
   page.on("request",request=>{
    const url=new URL(request.url());
    if(url.hostname!=="127.0.0.1")outsiders.push(request.url());
   });
   try{
    for(const section of ["","france/"]){
     const url="http://127.0.0.1:"+server.address().port+"/visas/"+section;
     const response=await page.goto(url,{waitUntil:"networkidle"});
     assert.equal(response.status(),200);
     assert.equal(await page.locator("script").count(),0,"HTML must not require JS");
     assert.equal(await page.locator('link[rel="stylesheet"]').count(),1);
     if(!actualFrance) assert.ok(await page.locator(".notice-demo").isVisible());
     else assert.equal(await page.locator(".notice-demo").count(),0,
      "the verified France page must not contain example warnings");
     assert.ok(await page.locator(".notice-law").isVisible());
     const metrics=await page.evaluate(()=>{
      const h=document.querySelector("h1"),header=document.querySelector(".masthead"),cta=document.querySelector(".button.primary");
      const box=x=>x?({width:x.getBoundingClientRect().width,left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right,height:x.getBoundingClientRect().height}):null;
      const color=x=>getComputedStyle(x).color;
      const bg=x=>getComputedStyle(x).backgroundColor;
      return{
       viewport:innerWidth,scroll:document.documentElement.scrollWidth,
       h1:box(h),bodyColor:color(document.body),bodyBg:bg(document.body),
       brandColor:color(header.querySelector(".wordmark")),headerBg:bg(header),
       cta:box(cta),ctaColor:cta?color(cta):null,ctaBg:cta?bg(cta):null,
       offsiteLinks:[...document.querySelectorAll("a[href]")].filter(a=>/^https?:/.test(a.getAttribute("href"))).map(a=>a.href)
      };
     });
     assert.ok(metrics.h1.left>=0&&metrics.h1.right<=width+1,"heading clips "+width+"px");
     assert.ok(metrics.scroll<=width+1,"horizontal overflow "+width+"px "+JSON.stringify(metrics));
     assert.ok(contrast(metrics.bodyColor,metrics.bodyBg)>=4.5,"body contrast");
     assert.ok(contrast(metrics.brandColor,metrics.headerBg)>=4.5,"brand contrast");
     if(section){
      assert.ok(metrics.cta&&metrics.cta.height>=44,"CTA target must be >=44px");
      assert.ok(metrics.cta.right<=width+1&&metrics.cta.left>=-1,"CTA must fit screen");
      assert.ok(contrast(metrics.ctaColor,metrics.ctaBg)>=4.5,"CTA text contrast");
      if(!actualFrance) assert.ok(await page.locator(".notice-stale").isVisible(),
       "the old test example must show the 90-day warning");
      else assert.equal(await page.locator(".doc").count(),16,
       "published France must display all sixteen BEAM documents without changes");
      assert.ok((await page.locator(".button.primary").getAttribute("href")).includes("France"));
      assert.equal(await page.locator('a[href="/travel/"]').count(),1);
     }else{
      assert.ok(await page.locator('a[href="/visas/france/"]').count()>=1);
     }
     assert.deepEqual(outsiders,[],"no third-party requests for static page");
     const filename=section?"france":"accueil";
     await page.screenshot({path:path.join(out,filename+"-"+width+".png"),fullPage:true,animations:"disabled"});
     console.log("PASS visa guide "+filename+" "+width+"px: no JS, no overflow, contrast >=4.5, no remote resource");
    }
   }finally{await context.close();}
  }
 }finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(scratch,{recursive:true,force:true});
 }
}
main().catch(err=>{console.error(err);process.exitCode=1});
