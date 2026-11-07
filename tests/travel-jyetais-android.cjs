"use strict";
// Browser: Android-sized Chromium captures with only synthetic data, no account/API.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const out=path.resolve("test-artifacts/jyetais-android");
fs.mkdirSync(out,{recursive:true});
const app=fs.readFileSync(path.join(root,"index.html"),"utf8");
const html=app.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
 .replace("<head>",'<head><base href="https://preview-jyetais.invalid/travel/">');
const logo=fs.readFileSync(path.join(root,"assets/brand/jyetais-logo.svg"),"utf8");
const world=fs.readFileSync(path.join(root,"assets/world-map.svg"),"utf8");
const centroids=JSON.parse(fs.readFileSync(path.join(root,"assets/world-centroids.json"),"utf8"));
async function routes(page){
 await page.route("**/*",async route=>{
  const url=route.request().url();
  if(url.endsWith("/travel/assets/brand/jyetais-logo.svg"))
    return route.fulfill({status:200,contentType:"image/svg+xml",body:logo});
  const match=url.match(/\/travel\/assets\/flags\/([a-z]{2})\.svg$/);
  if(match){
   const file=path.join(root,"assets/flags",match[1]+".svg");
   if(fs.existsSync(file))return route.fulfill({status:200,contentType:"image/svg+xml",body:fs.readFileSync(file)});
  }
  return route.abort();
 });
}
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2,
    userAgent:"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"});
   try{
    await routes(page);
    await page.setContent(html,{waitUntil:"domcontentloaded"});
    await page.evaluate(()=>{
     document.querySelector("#offline").style.display="none";
     document.querySelector("#auth").classList.remove("hidden");
     document.querySelector("#app").classList.add("hidden");
    });
    await page.locator(".jyAuthLogo").evaluate(img=>img.decode());
    const login=await page.evaluate(()=>({
     logo:document.querySelector(".jyAuthLogo").naturalWidth,
     scroll:document.documentElement.scrollWidth,
     label:document.querySelector(".jyAuthSignature").textContent.trim()
    }));
    assert.ok(login.logo>0&&login.scroll<=width+2,"Android login "+width+": "+JSON.stringify(login));
    assert.equal(login.label,"J'y étais by BEAM");
    await page.screenshot({path:path.join(out,"connexion-"+width+".png")});
    await page.evaluate(svg=>{
     document.querySelector("#auth").classList.add("hidden");
     document.querySelector("#app").classList.remove("hidden");
     document.querySelector("#accountStatusChecking")?.classList.add("hidden");
     document.querySelector("#dashboardTitle").textContent="Voyageur fictif";
     const map=document.querySelector("#map");
     if(map)map.innerHTML=svg;
    },world);
    await page.locator(".jyHeaderLogo").evaluate(img=>img.decode());
    const home=await page.evaluate(()=>({
     logo:document.querySelector(".jyHeaderLogo").naturalWidth,
     scroll:document.documentElement.scrollWidth,
     appVisible:!document.querySelector("#app").classList.contains("hidden"),
     footer:document.querySelector(".jyAppFooter")?.textContent.trim()
    }));
    assert.ok(home.logo>0&&home.appVisible&&home.scroll<=width+2,
     "Android home "+width+": "+JSON.stringify(home));
    assert.equal(home.footer,"J'y étais by BEAM");
    await page.screenshot({path:path.join(out,"accueil-"+width+".png")});
   }finally{await page.close();}
   const book=await browser.newPage({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   try{
    await routes(book);
    await book.setContent('<!doctype html><html lang="fr"><head><base href="https://preview-jyetais.invalid/travel/"></head><body></body></html>');
    for(const module of ["countries.js","dashboard-filters.js","flight-connections.js","printable-journal.js","family-booklet.js"])
     await book.addScriptTag({path:path.join(root,module)});
    const model={
     name:"Voyageur fictif",generatedAt:"2026-11-07T09:00:00Z",filters:{},mapSvgText:world,
     countryOfResidence:"GN",worldCentroids:centroids,
     trips:[{trip:{id:"fake-trip",country_code:"SN",cities:["Dakar"],entry_date:"2026-02-01",
       exit_date:"2026-02-06",duration_days:6,purpose:"tourisme",is_domestic:false,
       note:"Voyage de démonstration entièrement fictif."},activities:[],photos:[],missingPhotos:0}]
    };
    await book.evaluate(data=>window.BEAM_FAMILY_BOOKLET.render(document,{
     ...data,generatedAt:new Date(data.generatedAt)
    }),model);
    assert.ok(await book.getByText("J'y étais by BEAM").count()>=1,"booklet closing signature");
    assert.ok((await book.title()).startsWith("J'y étais"),"booklet document title");
    const cover=book.locator(".cover");
    assert.ok(await cover.count()===1&&await cover.isVisible(),"A5 cover visible");
    await book.locator(".sheet").first().screenshot({path:path.join(out,"livret-A5-"+width+".png")});
   }finally{await book.close();}
   console.log("PASS Android Chromium "+width+"px: login, home, booklet (synthetic data)");
  }
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
