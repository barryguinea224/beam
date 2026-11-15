"use strict";
// PDF preview presentation and unchanged byte-exact fallback; no real client data.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const output=path.resolve("test-artifacts/floating-add-share");
const rows=[{country_code:"FR",cities:["Paris"],entry_date:"2026-10-10",
 exit_date:"2026-10-20",duration_days:11,purpose:"tourisme",note:"PRIVATE_FIXTURE",
 stops:[{country_code:"BE",cities:["Bruxelles"],entry_date:"2026-10-12",
  exit_date:"2026-10-13",position:1}]}];
const displayName="Voyageur Exemple",date="2026-10-31T12:00:00Z";
async function main(){
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const ctx=await browser.newContext({viewport:{width,height:800},
    isMobile:true,hasTouch:true,acceptDownloads:true});
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   try{
    await page.setContent('<!doctype html><html lang="fr"><head></head><body></body></html>');
    for(const file of ["countries.js","fr-accords.js","trip-stops.js","factual-pdf.js","factual-pdf-file.js"])
     await page.addScriptTag({path:path.resolve("travel",file)});
    await page.evaluate(({rows,displayName,date})=>{
     BEAM_TRAVEL_PDF.render(document,rows,{displayName,generatedAt:new Date(date)});
    },{rows,displayName,date});
    const audit=await page.evaluate(()=>{
     const buttons=[...document.querySelectorAll(".toolbar button")];
     const share=buttons[0],print=buttons[1];
     const bg=getComputedStyle(share).backgroundColor;
     const printBg=getComputedStyle(print).backgroundColor;
     const a=share.getBoundingClientRect(),b=print.getBoundingClientRect();
     return {first:share.className,second:print.className,label:share.textContent,
      color:bg,printBg,shareTop:a.top,printTop:b.top,
      scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
      enabled:!share.disabled,PDFText:document.querySelector("main header h1").textContent};
    });
    assert.equal(audit.first,"share-button");
    assert.equal(audit.second,"print-button");
    assert.equal(audit.label,"Envoyer (WhatsApp, e-mail…)");
    assert.equal(audit.color,"rgb(23, 77, 58)","Share is mobile primary");
    assert.equal(audit.printBg,"rgb(255, 255, 255)","Print is mobile secondary");
    assert.ok(audit.shareTop<audit.printTop,"Share visually above print");
    assert.equal(audit.enabled,true);
    assert.ok(audit.scrollWidth<=width+1,"PDF preview body overflow at "+width+": "+JSON.stringify(audit));
    const mobile=await page.evaluate(()=>{
     const row=document.querySelector("tbody tr:not(.trip-stop)");
     const items=[...document.querySelectorAll(".mobileTripFacts .mobileDate")];
     const summary=document.querySelector(".mobileTripFacts");
     const stage=document.querySelector("tbody tr.trip-stop");
     return {columns:row.querySelectorAll("td").length,
      display:getComputedStyle(row).display,summaryDisplay:getComputedStyle(summary).display,
      summary:summary.textContent,aria:summary.getAttribute("aria-label"),
      stages:!!stage&&getComputedStyle(stage).display==="block",
      wrapped:items.map(el=>el.getClientRects().length>1),
      visible:items.every(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.right<=innerWidth+1}),
      bodyWidth:document.body.scrollWidth,tableWidth:document.querySelector("table").scrollWidth,
      tableClient:document.querySelector("table").clientWidth};
    });
    assert.equal(mobile.columns,6,"Print must retain exactly six table columns");
    assert.equal(mobile.display,"grid","Screen trip must be a two-line card");
    assert.equal(mobile.summaryDisplay,"flex");
    assert.match(mobile.summary,/10\/10\/2026.*20\/10\/2026.*11 jours.*Tourisme/);
    assert.match(mobile.aria,/Entrée.*Sortie.*Durée.*Motif/);
    assert.deepEqual(mobile.wrapped,[false,false],"Each date stays unbroken");
    assert.equal(mobile.visible,true,"Both dates stay inside viewport");
    assert.equal(mobile.stages,true,"Nested stages remain visible beneath trip");
    assert.ok(mobile.tableWidth<=mobile.tableClient+1,"No hidden 530px table scroll at "+width);
    assert.ok(mobile.bodyWidth<=width+1,"No document horizontal overflow");
    if(width===360)await page.screenshot({
     path:path.join(output,"apercu-pdf-360.png"),animations:"disabled",fullPage:true
    });
    await page.emulateMedia({media:"print"});
    const print=await page.evaluate(()=>{
     const table=document.querySelector("table"),row=table.querySelector("tbody tr");
     return {table:getComputedStyle(table).display,
      row:getComputedStyle(row).display,
      headings:table.querySelectorAll("thead th").length,
      columns:row.querySelectorAll("td").length,
      mobile:getComputedStyle(document.querySelector(".mobileTripFacts")).display,
      normal:getComputedStyle(document.querySelector(".desktopEntry")).display};
    });
    assert.equal(print.table,"table","Print remains a table");
    assert.equal(print.row,"table-row","Print rows remain standard");
    assert.equal(print.headings,6,"Print headings unchanged");
    assert.equal(print.columns,6,"Print six cells unchanged");
    assert.equal(print.mobile,"none","Mobile-only summary absent from print");
    assert.notEqual(print.normal,"none","Original date remains visible in print");
    await page.emulateMedia({media:"screen"});
    await page.evaluate(()=>{
     window.__shared=[];
     Object.defineProperty(navigator,"canShare",{configurable:true,
      value:({files})=>files?.length===1&&files[0].type==="application/pdf"});
     Object.defineProperty(navigator,"share",{configurable:true,value:payload=>{
      window.__shared.push({file:payload.files[0].name,hasUrl:"url" in payload});
      return Promise.resolve();
     }});
    });
    await page.locator(".share-button").click();
    const calls=await page.evaluate(()=>window.__shared);
    assert.equal(calls.length,1,"Native share remains active on click");
    assert.equal(calls[0].hasUrl,false,"Never share a URL");
    // Completely absent Web Share API: download the same generated PDF bytes.
    await page.evaluate(()=>{
     Object.defineProperty(navigator,"share",{configurable:true,value:undefined});
     Object.defineProperty(navigator,"canShare",{configurable:true,value:undefined});
    });
    const [download]=await Promise.all([
     page.waitForEvent("download",{timeout:10000}),
     page.locator(".share-button").click()
    ]);
    assert.equal(download.suggestedFilename(),"Historique-de-voyages-Voyageur-Exemple.pdf");
    const actual=await fs.readFile(await download.path());
    const expected=Buffer.from(await page.evaluate(({rows,displayName,date})=>
     Array.from(BEAM_FACTUAL_PDF_FILE.make({
      displayName,generatedAt:new Date(date),includeContacts:false,contacts:null
     },rows)),{rows,displayName,date}));
    assert.deepEqual(actual,expected,"Fallback bytes match unmodified PDF generator exactly");
    assert.equal(actual.subarray(0,8).toString("latin1"),"%PDF-1.4");
    assert.deepEqual(errors,[]);
    console.log("PASS PDF "+width+"px: send first, primary styling, native share and byte-exact fallback");
   }finally{await ctx.close()}
  }
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
