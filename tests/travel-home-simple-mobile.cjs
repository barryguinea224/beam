"use strict";
// Capture the real private app with a synthetic authenticated account (never production data).
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const dir=path.resolve("test-artifacts/home-simple");
async function main(){
 await fs.mkdir(dir,{recursive:true});
 const baseline=process.argv[2]?await fs.readFile(process.argv[2],"utf8"):null;
 const server=serve();
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   for(const phase of (width===360&&baseline?["avant","apres"]:["apres"])){
    const ctx=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
    const page=await ctx.newPage(),errors=[],externalFonts=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.route("**/*",route=>{
     const url=new URL(route.request().url());
     if(/fonts\.(?:googleapis|gstatic)\.com/.test(url.hostname) ||
       (/\.(?:woff2?|ttf|otf)$/i.test(url.pathname)&&url.hostname!=="127.0.0.1")){
      externalFonts.push(url.href);return route.abort();
     }
     if(url.hostname==="cdn.jsdelivr.net")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"});
     if(url.hostname==="127.0.0.1"){
      if(phase==="avant"&&url.pathname==="/travel/")
       return route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:baseline.replace(\u0027<script src="./photo-utils.js"></script>\u0027,\u0027<script src="./fr-accords.js"></script><script src="./photo-utils.js"></script>\u0027)});
      return route.continue();
     }
     return route.abort();
    });
    try{
     await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load",timeout:30000});
     await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
     await page.evaluate(()=>document.fonts.ready);
     if(phase==="apres"){
      const checks=await page.evaluate(()=>{
       const query=id=>document.querySelector(id);
       const selectors=["#travelHero","#homeStats","#travelMapPanel","#homeActions #add","#secondaryActions","#travelTripsPanel"];
       const nodes=selectors.map(sel=>query(sel));
       const order=nodes.every((node,i)=>node&&(!i||(nodes[i-1].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)));
       const titles=[...document.querySelectorAll("#dashboardTitle,#travelMapTitle,#travelTripsPanel h2,#trips .journeyCountry")]
        .map(el=>({text:el.textContent,family:getComputedStyle(el).fontFamily}));
       const home=query("#homeActions"),map=query("#travelMapPanel"),hero=query("#travelHero"),list=query("#travelTripsPanel");
       return {order,titles,scroll:document.documentElement.scrollWidth,viewport:innerWidth,
        mapBeforeActions:map.getBoundingClientRect().top<home.getBoundingClientRect().top,
        hasSingleAction:home.querySelectorAll(".btn").length===1,
        secondaryCount:query("#secondaryActions").children.length,
        summary:query("#homeStats").textContent,
        contactOutside:query("#includePdfContacts").getClientRects().length>0,
        tripPanelBg:getComputedStyle(list).backgroundColor,
        mapInfo:getComputedStyle(query("#mapInfo")).display,
        headerText:hero.innerText,
        upcomingLegend:getComputedStyle(query("#plannedLegend")).display
       };
      });
      assert.ok(checks.order&&checks.mapBeforeActions,"Expected profile → stats → map → primary → secondary → trips");
      assert.equal(checks.hasSingleAction,true);
      assert.equal(checks.secondaryCount,2);
      assert.ok(checks.summary.includes("voyage")&&checks.summary.includes("pays")&&checks.summary.includes("jour"));
      assert.ok(!checks.headerText.includes("Mon histoire à travers le monde"));
      assert.ok(!checks.headerText.includes("Guide des visas"));
      assert.equal(checks.mapInfo,"none");
      assert.equal(checks.contactOutside,false,"Opt-in must not be visible on home");
      assert.ok(checks.titles.length>=4);
      checks.titles.forEach(obj=>assert.match(obj.family,/Poppins/,"Title must be Poppins: "+JSON.stringify(obj)));
      assert.ok(checks.scroll<=width+1,"Home overflow "+width+": "+JSON.stringify(checks));
      await page.locator("#pdf").click();
      assert.equal(await page.locator("#pdfDialog").isVisible(),true);
      assert.equal(await page.locator("#includePdfContacts").isChecked(),false);
      assert.equal(await page.locator("#includePdfContacts").isVisible(),true);
      assert.equal(await page.locator("#pdfExclusionNote").isVisible(),true,"Future journey warning only inside dialog");
      assert.equal(await page.locator("#generatePdf").isVisible(),true);
      if(width===360)await page.locator("#pdfDialog").screenshot({path:path.join(dir,"apres-fenetre-pdf-360.png"),animations:"disabled"});
      await page.locator("#pdfDialogClose").click();
      assert.equal(await page.locator("#pdfDialog").isVisible(),false);
      assert.equal(await page.locator("#includePdfContacts").isChecked(),false);
     }
     if(width===360){
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(dir,phase+"-haut-360.png"),animations:"disabled"});
      await page.locator("#travelTripsPanel").scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(dir,phase+"-voyages-360.png"),animations:"disabled"});
     }
     assert.deepEqual(externalFonts,[],"No third-party font traffic");
     assert.deepEqual(errors,[],"Browser JS errors");
     console.log("PASS "+phase+" home Android "+width+" px");
    }finally{await ctx.close()}
   }
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
