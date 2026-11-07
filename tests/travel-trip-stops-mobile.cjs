"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8");
const noScript=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
 .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,"");
const css=fs.readFileSync("travel/trip-stops.css","utf8");
async function main(){
 const dir="test-artifacts/trip-stops",browser=await chromium.launch({
  headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]
 });
 fs.mkdirSync(dir,{recursive:true});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:870},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   try{
    await page.setContent(noScript,{waitUntil:"domcontentloaded"});
    await page.addStyleTag({content:css});
    await page.addScriptTag({path:path.resolve("travel/countries.js")});
    await page.addScriptTag({path:path.resolve("travel/trip-stops.js")});
    await page.evaluate(()=>{
     window.confirm=()=>{throw Error("Native confirmation forbidden")};
     document.getElementById("app").classList.remove("hidden");
     document.getElementById("tripDetailModal").classList.add("open");
     const trip={country_code:"FR",entry_date:"2026-11-05",exit_date:"2026-11-15",stops:[
      {id:"fiction-de",country_code:"DE",cities:["Berlin"],entry_date:"2026-11-10",exit_date:"2026-11-14",position:1}
     ]};
     window.__edit=0;window.__remove=0;
     window.BEAM_TRIP_STOPS.renderList(document.getElementById("detailStops"),trip,true,
      ()=>window.__edit++,()=>window.__remove++);
     const form=document.getElementById("tripStopForm");
     form.classList.remove("hidden");
     document.getElementById("tripStopCountry").add(new Option("Allemagne","DE"));
     document.getElementById("tripStopCountry").value="DE";
     document.getElementById("tripStopCities").value="Berlin";
     document.getElementById("tripStopEntry").value="2026-11-10";
     document.getElementById("tripStopExit").value="2026-11-14";
    });
    assert.match(await page.locator("#detailStops").innerText(),/Allemagne/);
    assert.match(await page.locator("#detailStops").innerText(),/Berlin/);
    await page.locator(".tripStopActions").getByRole("button",{name:"Modifier"}).click();
    assert.equal(await page.evaluate(()=>window.__edit),1);
    await page.locator(".tripStopActions").getByRole("button",{name:"Supprimer"}).click();
    assert.equal(await page.evaluate(()=>window.__remove),1);
    const audit=await page.evaluate(()=>{
     const panel=document.querySelector("#detailStopsSection"),form=document.querySelector("#tripStopForm");
     const rect=panel.getBoundingClientRect();
     return {innerWidth,docOverflow:document.documentElement.scrollWidth-innerWidth,
      panelOverflow:panel.scrollWidth-panel.clientWidth,formOverflow:form.scrollWidth-form.clientWidth,
      panelLeft:rect.left,panelRight:rect.right};
    });
    assert.ok(audit.panelOverflow<=2&&audit.formOverflow<=2,"Stage form overflow at "+width+": "+JSON.stringify(audit));
    await page.locator("#detailStopsSection").screenshot({
     path:path.join(dir,"etapes-android-"+width+".png"),animations:"disabled"
    });
    console.log("PASS trip stops Android "+width+"px: stage info, edit/delete actions, inline form and no overflow");
   }finally{await page.close();}
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
