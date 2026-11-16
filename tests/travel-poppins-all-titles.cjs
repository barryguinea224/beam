"use strict";
// Typography source audit and real 360px Chromium screenshots. All users and trips are fictional.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const root=path.resolve(__dirname,"..","travel");
const output=path.resolve("test-artifacts/title-comparison");
const baseline=path.join(output,"baseline-v46");
const files=["index.html",...fs.readdirSync(root).filter(n=>n.endsWith(".css"))];
for(const file of files){
 const source=fs.readFileSync(path.join(root,file),"utf8");
 assert.doesNotMatch(source,/\bGeorgia\b/i,"Legacy Georgia in travel/"+file);
 assert.doesNotMatch(source,/(?<!sans-)\bserif\b/i,"Serif fallback in travel/"+file);
}
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
assert.match(sw,/jyetais-v56-detail-share/);
assert.doesNotMatch(sw,/\bGeorgia\b/i);
for(const file of ["index.html","account-settings.css","visual-cards.css","photo-sheet.css","legal.css"])
 assert.match(fs.readFileSync(path.join(root,file),"utf8"),/Poppins,system-ui,sans-serif/,"Source-family contract "+file);
assert.doesNotMatch(fs.readFileSync(path.join(root,"home-simple.css"),"utf8"),/font-family:[^;{}]+!important/,"No title-family !important override");
function contentType(n){return n.endsWith(".html")?"text/html; charset=utf-8":
 n.endsWith(".js")?"application/javascript; charset=utf-8":"text/css; charset=utf-8"}
async function run(){
 await fsp.mkdir(output,{recursive:true});
 const beforeAssets={};
 const hasBaseline=fs.existsSync(path.join(baseline,"index.html"));
 if(hasBaseline){
  for(const file of ["index.html","home-simple.css","account-settings.css","visual-cards.css","visual-cards.js","photo-sheet.css","legal.css"]){
   const p=path.join(baseline,file);
   beforeAssets[file]=await fsp.readFile(p);
  }
 }
 const host=serve();await new Promise(ok=>host.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const phase of (hasBaseline?["avant","apres"]:["apres"])){
   const ctx=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await ctx.newPage(),errors=[],externalFonts=[];
   page.on("pageerror",e=>errors.push(String(e)));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)||(/\.(woff2?|ttf|otf)$/i.test(url.pathname)&&url.hostname!=="127.0.0.1")){
     externalFonts.push(url.href);return route.abort();
    }
    if(url.hostname==="cdn.jsdelivr.net")
     return route.fulfill({status:200,contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"});
    if(url.hostname!=="127.0.0.1")return route.abort();
    const name=url.pathname==="/travel/"?"index.html":url.pathname.slice("/travel/".length);
    if(phase==="avant"&&Object.hasOwn(beforeAssets,name))
     return route.fulfill({status:200,contentType:contentType(name),body:name==="index.html"
      ? beforeAssets[name].toString().replace('<script src="./photo-utils.js"></script>','<script src="./fr-accords.js"></script><script src="./photo-utils.js"></script>')
      : beforeAssets[name]});
    return route.continue();
   });
   try{
    await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load",timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive"&&document.querySelectorAll("#trips .tripOpen").length>=2,null,{timeout:20000}).catch(async error=>{
      const state=await page.evaluate(()=>({
       title:document.querySelector("#dashboardTitle")?.textContent,
       cards:document.querySelectorAll("#trips .tripOpen").length,
       appHidden:document.querySelector("#app")?.classList.contains("hidden"),
       accountText:document.querySelector("#appMsg")?.textContent,
       authText:document.querySelector("#loginMsg")?.textContent
      }));
      throw Error("Typography fixture failed in phase "+phase+": "+JSON.stringify(state)+
       " JavaScript errors="+JSON.stringify(errors)+" "+String(error));
     });
    await page.evaluate(()=>document.fonts.ready);
    const snapshot=async(name)=>page.screenshot({path:path.join(output,phase+"-"+name+"-360.png"),animations:"disabled"});
    const family=selector=>page.locator(selector).evaluate(node=>getComputedStyle(node).fontFamily);
    await page.evaluate(()=>scrollTo(0,0));
    await snapshot("haut");
    await page.locator("#travelTripsPanel").scrollIntoViewIfNeeded();
    await snapshot("voyages");
    await page.locator("#pdf").click();
    await page.locator("#pdfDialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#includePdfContacts").isChecked(),false);
    await snapshot("fenetre-pdf");
    await page.locator("#pdfDialogClose").click();
    await page.locator("#add").click();
    await page.locator("#modal.open").waitFor({state:"visible"});
    const addFont=await family("#tripTitle");
    await snapshot("ajouter-voyage");
    await page.locator("#close").click();
    await page.locator("#modal.open").waitFor({state:"hidden"});
    await page.locator("#trips .tripOpen").first().click();
    await page.locator("#tripDetailModal.open").waitFor({state:"visible"});
    const detailFont=await family("#detailTitle");
    await snapshot("fiche-voyage");
    await page.locator("#detailClose").click();
    await page.locator("#openAccount").click();
    await page.locator("#accountOverlay.accountOpen").waitFor({state:"visible"});
    const accountFont=await family("#accountDisplayName");
    await snapshot("parametres");
    await page.locator("#closeAccount").click();
    if(phase==="apres"){
     for(const [title,font] of [["Ajouter un voyage",addFont],["Fiche du voyage",detailFont],["Nom Paramètres",accountFont]])
      assert.match(font,/Poppins/,"Expected computed Poppins in "+title+": "+font);
     assert.equal(await page.evaluate(()=>document.fonts.check('600 20px Poppins')),true,"Poppins local font must load");
     const scroll=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
     assert.ok(scroll<=1,"No 360px overflow: "+scroll);
    }else{
     assert.match(addFont,/Georgia/,"Baseline should show the reported Georgia regression");
     assert.match(detailFont,/Georgia/,"Baseline detail title should show Georgia");
     // In v46 the account name already computed Poppins via a scoped override;
     // v47 removes that dependency at the CSS source.
    }
    assert.deepEqual(errors,[],"Browser errors in "+phase);
    assert.deepEqual(externalFonts,[],"No external font requests in "+phase);
    console.log("PASS "+phase+" 360px titles",JSON.stringify({addFont,detailFont,accountFont}));
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>host.close(ok))}
}
run().catch(e=>{console.error(e);process.exitCode=1});