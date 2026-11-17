"use strict";
// Real app / real calendar, intercepted localhost-only, synthetic Supabase.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
async function main(){
 const server=serve();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir=path.resolve("test-artifacts/date-range-picker");
 await fs.mkdir(dir,{recursive:true});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",err=>errors.push(err.message));
   page.on("dialog",dialog=>{throw Error("Unexpected dialog: "+dialog.message())});
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"});
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#add").click();
    async function choose(prefix,date){
     await page.locator(prefix+" .drp-year").selectOption(date.slice(0,4));
     await page.locator(prefix+" .drp-month").selectOption(String(Number(date.slice(5,7))-1));
     await page.locator(prefix+' button[data-date="'+date+'"]').click();
    }
    async function values(entry,exit){
     assert.equal(await page.locator("#tripEntryDate").inputValue(),entry);
     assert.equal(await page.locator("#tripExitDate").inputValue(),exit);
    }
    // First press is not a complete journey, even with an enabled save button.
    await page.locator("#tripCountrySelect").selectOption("SN");
    await page.locator('#tripForm input[name="cities"]').fill("Dakar");
    await choose("#tripDatePicker","2026-11-05");
    await values("2026-11-05","");
    assert.equal(await page.locator("#tripDatePicker .drp-summary").innerText(),
      "Arrivée le 5 nov. 2026 — touchez maintenant la date de départ");
    assert.equal(await page.locator("#saveTrip").isEnabled(),true,"save stays enabled for explanation");
    await page.locator("#saveTrip").click();
    assert.equal(await page.locator("#tripMsg").innerText(),"Choisissez la date de départ du pays.");
    assert.equal(await page.evaluate(()=>window.__excursionFixture.tripInserts.length),0,"partial period must not be inserted");
    assert.equal(await page.locator("#saveTrip").isEnabled(),true,"save remains usable after validation");
    await choose("#tripDatePicker","2026-11-05");
    await values("2026-11-05","2026-11-05");
    assert.equal(await page.locator("#tripDatePicker .drp-summary").innerText(),"Le 5 nov. 2026");
    assert.equal(await page.locator("#tripMsg").isHidden(),true,"fixing the date clears the validation message");

    // Range with both ends and the continuous eight-day highlight.
    await choose("#tripDatePicker","2026-11-03");
    await values("2026-11-03","");
    await values("2026-11-03","");
    await choose("#tripDatePicker","2026-11-10");
    await values("2026-11-03","2026-11-10");
    assert.match(await page.locator("#tripDatePicker .drp-summary").innerText(),/Du 3 au 10 nov\. 2026 · 8 jours/);
    assert.equal(await page.locator("#tripDatePicker .drp-selected").count(),8);
    assert.match(await page.locator('#tripDatePicker [data-date="2026-11-03"]').getAttribute("class"),/drp-start/);
    assert.match(await page.locator('#tripDatePicker [data-date="2026-11-10"]').getAttribute("class"),/drp-end/);
    assert.equal(await page.locator('#tripDatePicker [data-date="2026-11-08"]').getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator('#tripDatePicker [data-date="2026-11-08"]').evaluate(e=>e.classList.contains("drp-booked")),true);
    assert.equal(await page.locator('#tripDatePicker [data-date="2026-11-18"]').evaluate(e=>e.classList.contains("drp-booked")),false,"multi-day exit excluded like SQL");
    if(width===360)await page.locator("#tripDateFields").screenshot({path:path.join(dir,"periode-selectionnee-360.png"),animations:"disabled"});

    // A future journey also remains a light hint; the SQL exit-day is free.
    await page.locator("#tripDatePicker .drp-year").selectOption("2027");
    await page.locator("#tripDatePicker .drp-month").selectOption("3");
    assert.equal(await page.locator('#tripDatePicker [data-date="2027-04-12"]').evaluate(e=>e.classList.contains("drp-booked")),true,"future journey hint");
    assert.equal(await page.locator('#tripDatePicker [data-date="2027-04-16"]').evaluate(e=>e.classList.contains("drp-booked")),false,"end-exclusive future journey");

    // Third click resets, earlier second date moves the start.
    await choose("#tripDatePicker","2026-11-14");
    await values("2026-11-14","");
    await choose("#tripDatePicker","2026-11-02");
    await values("2026-11-02","");
    await choose("#tripDatePicker","2026-11-05");
    await values("2026-11-02","2026-11-05");
    const focused=page.locator('#tripDatePicker [data-date="2026-11-03"]');
    await focused.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.date),"2026-11-04","arrow keyboard navigation");
    await page.keyboard.press("Enter");
    await values("2026-11-04","");
    await page.locator("#tripDatePicker .drp-clear").click();
    await values("","");

    // One-day period and exact same values in both hidden date sources.
    await page.locator('[data-trip-mode="day"]').click();
    await choose("#tripDatePicker","2026-11-12");
    await values("2026-11-12","2026-11-12");
    assert.equal(await page.locator("#tripDatePicker .drp-summary").innerText(),"Le 12 nov. 2026");
    assert.equal(await page.locator("#tripDatePicker .drp-selected").count(),1);
    if(width===360)await page.locator("#tripDateFields").screenshot({path:path.join(dir,"une-journee-360.png"),animations:"disabled"});

    // A direct year dropdown is necessary for trips recorded years earlier.
    await page.locator("#tripDatePicker .drp-year").selectOption("2020");
    await page.locator("#tripDatePicker .drp-month").selectOption("7");
    assert.equal(await page.locator("#tripDatePicker .drp-year").inputValue(),"2020");
    if(width===360)await page.locator("#tripDateFields").screenshot({path:path.join(dir,"choix-annee-360.png"),animations:"disabled"});

    const max=await page.evaluate(()=>window.BEAM_DATE_RANGE_PICKER.maxAllowed());
    await page.locator("#tripDatePicker .drp-year").selectOption(max.slice(0,4));
    await page.locator("#tripDatePicker .drp-month").selectOption(String(Number(max.slice(5,7))-1));
    const after=new Date(max+"T00:00:00Z");after.setUTCDate(after.getUTCDate()+1);
    const afterISO=after.toISOString().slice(0,10);
    if(afterISO.slice(0,7)===max.slice(0,7))
     assert.equal(await page.locator('#tripDatePicker [data-date="'+afterISO+'"]').isDisabled(),true,"two-year cap");
    else assert.equal(await page.locator("#tripDatePicker .drp-next").isDisabled(),true,"future month unreachable");
    await page.locator("#close").click();

    // Editing must reopen on the stored period, with own booking excluded from hints.
    const france=page.locator("#trips .journeyTrip").filter({hasText:"France"}).first();
    await france.locator(".tripOpen").click();
    await page.locator("#detailModeToggle").click();
     await page.locator("#detailEdit").click();
    await values("2026-11-08","2026-11-18");
    assert.equal(await page.locator("#tripDatePicker .drp-year").inputValue(),"2026");
    assert.equal(await page.locator("#tripDatePicker .drp-month").inputValue(),"10");
    assert.equal(await page.locator("#tripDatePicker .drp-selected").count(),11);
    assert.equal(await page.locator('#tripDatePicker [data-date="2026-11-08"]').evaluate(e=>e.classList.contains("drp-booked")),false);
    await page.locator("#close").click();

    // Supabase insert receives unchanged entry_date and exit_date strings.
    await page.locator("#add").click();
    await page.locator("#tripCountrySelect").selectOption("SN");
    await page.locator('#tripForm input[name="cities"]').fill("Dakar");
    await choose("#tripDatePicker","2026-12-01");
    await choose("#tripDatePicker","2026-12-03");
    await page.locator("#saveTrip").click();
    await page.waitForFunction(()=>window.__excursionFixture.tripInserts.length===1);
    const saved=await page.evaluate(()=>window.__excursionFixture.tripInserts[0]);
    assert.equal(saved.entry_date,"2026-12-01");
    assert.equal(saved.exit_date,"2026-12-03");

    // Same widget for stages, bounded by the parent trip. Stage writes remain unchanged.
    await france.locator(".tripOpen").click();
    // The premium detail defaults to reading mode; stage editing is opt-in.
    await page.locator("#detailModeToggle").click();
    assert.equal(await page.locator("#detailModeToggle").innerText(),"Terminé");
    await page.locator("#addTripStop").click();
    assert.equal(await page.locator('#tripStopDatePicker [data-date="2026-11-07"]').isDisabled(),true);
    assert.equal(await page.locator('#tripStopDatePicker [data-date="2026-11-19"]').isDisabled(),true);
    await page.locator("#tripStopCountry").selectOption("DE");
    await page.locator("#tripStopCities").fill("Berlin");
    await choose("#tripStopDatePicker","2026-11-10");
    assert.equal(await page.locator("#tripStopExit").inputValue(),"");
    await page.locator("#tripStopSave").click();
    assert.equal(await page.locator("#tripStopFormMessage").innerText(),"Choisissez la date de départ du pays.");
    assert.equal(await page.evaluate(()=>window.__excursionFixture.stopInserts.length),0,"incomplete stage stays unsaved");
    await choose("#tripStopDatePicker","2026-11-11");
    assert.equal(await page.locator("#tripStopFormMessage").innerText(),"");
    await page.locator("#tripStopSave").click();
    await page.waitForFunction(()=>window.__excursionFixture.stopInserts.length===1);
    const stop=await page.evaluate(()=>window.__excursionFixture.stopInserts[0]);
    assert.equal(stop.entry_date,"2026-11-10");
    assert.equal(stop.exit_date,"2026-11-11");
    const audit=await page.evaluate(()=>({
     viewport:document.documentElement.scrollWidth-innerWidth,
     trip:document.querySelector("#tripForm").scrollWidth-document.querySelector("#tripForm").clientWidth,
     stop:document.querySelector("#tripStopForm").scrollWidth-document.querySelector("#tripStopForm").clientWidth
    }));
    assert.ok(audit.viewport<=1&&audit.trip<=2&&audit.stop<=2,"Android "+width+" overflow: "+JSON.stringify(audit));
    // Two presses on the same day in "Plusieurs jours" save as a valid excursion.
    await page.locator("#detailClose").click();
    await page.locator("#add").click();
    await page.locator("#tripCountrySelect").selectOption("SN");
    await page.locator('#tripForm input[name="cities"]').fill("Dakar");
    await choose("#tripDatePicker","2027-09-08");
    await choose("#tripDatePicker","2027-09-08");
    await values("2027-09-08","2027-09-08");
    assert.equal(await page.locator("#tripDatePicker .drp-summary").innerText(),"Le 8 sept. 2027");
    await page.locator("#saveTrip").click();
    await page.waitForFunction(()=>window.__excursionFixture.tripInserts.length===2);
    const sameDay=await page.evaluate(()=>window.__excursionFixture.tripInserts[1]);
    assert.equal(sameDay.entry_date,"2027-09-08");
    assert.equal(sameDay.exit_date,"2027-09-08");
    assert.deepEqual(errors,[],"Browser errors "+width+": "+errors);
    console.log("PASS range picker Android "+width+" px, first tap guard, double-tap single day, compact formats, stage, Supabase and no overflow");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
