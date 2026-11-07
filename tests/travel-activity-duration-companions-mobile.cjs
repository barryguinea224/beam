"use strict";
// Fixture-only Chromium, rendering actual J'y étais form DOM and public CSS.
// No credentials, no account sessions, no external URLs, no personal records.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const raw=fs.readFileSync("travel/index.html","utf8");
const offline=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,"");
const css=fs.readFileSync("travel/activity-duration.css","utf8");
const output="test-artifacts/activity-companions";
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:880},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   try{
    await page.setContent(offline,{waitUntil:"domcontentloaded"});
    await page.addStyleTag({content:css});
    await page.addScriptTag({path:path.resolve("travel/activity-durations.js")});
    await page.evaluate(()=>{
     const add=document.getElementById("modal");add.classList.add("open");
     const input=document.getElementById("tripCompanions");
     input.value="Maman, Aïssatou"; // fictional first-name specimen
     const detail=document.getElementById("tripDetailModal");detail.classList.add("open");
     document.getElementById("activityDate").add(new Option("24 décembre","2026-12-24"));
     document.getElementById("activityDate").add(new Option("30 décembre","2026-12-30"));
     window.BEAM_ACTIVITY_DURATIONS.resetControls({entry_date:"2026-12-20",exit_date:"2026-12-31"});
    });
    await page.locator("#activityDate").selectOption("2026-12-24");
    await page.locator('#activityDurationChoices [data-duration="3"]').click();
    assert.match(await page.locator("#activityDurationPreview").innerText(),/24 → 26 déc. · 3 jours/);
    assert.equal(await page.locator("#activityDurationOther").inputValue(),"3");
    await page.locator("#activityDate").selectOption("2026-12-30");
    assert.match(await page.locator("#activityDurationPreview").innerText(),/fin du voyage/);
    await page.locator('#activityDurationChoices [data-duration="1"]').click();
    assert.match(await page.locator("#activityDurationPreview").innerText(),/30 déc./);
    await page.locator("#activityDurationOther").fill("31");
    assert.equal(await page.locator("#activityDurationOther").evaluate(x=>x.checkValidity()),false);
    await page.locator("#activityDurationOther").fill("3");
    await page.locator("#activityDate").selectOption("2026-12-24");
    const measurements=await page.evaluate(()=>{
     const ids=["#activityDurationChoices","#activityDurationOther","#tripCompanions","#detailActivityForm"];
     return ids.map(id=>{
      const e=document.querySelector(id),rect=e.getBoundingClientRect();
      return {id,width:rect.width,overflow:e.scrollWidth-e.clientWidth,left:rect.left,right:rect.right};
     });
    });
    for(const m of measurements)assert.ok(m.overflow<=2&&m.width>0&&m.width<=width+2,
      "Activity or companion field overflow at "+width+": "+JSON.stringify(m));
    await page.locator("#detailActivityForm").screenshot({path:output+"/activite-"+width+".png",animations:"disabled"});
    await page.locator("#tripDetailModal").evaluate(modal=>modal.classList.remove("open"));
    assert.equal(await page.locator("#tripCompanions").isVisible(),true,"Private companions field should be visible on the actual trip form");
    assert.equal(await page.locator("#tripCompanions").inputValue(),"Maman, Aïssatou");
    await page.locator("#tripCompanions").scrollIntoViewIfNeeded();
    const companionSection=page.locator("#tripCompanions").locator("..");
    assert.equal(await companionSection.isVisible(),true);
    await companionSection.screenshot({path:output+"/compagnons-"+width+".png",animations:"disabled"});
    await page.locator("#tripForm").screenshot({path:output+"/voyage-"+width+".png",animations:"disabled"});
    console.log("PASS J'y étais activities + companions mobile "+width+"px: duration choices, date guard, visible companion field, no field overflow");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
