"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const pageHtml=fs.readFileSync("travel/index.html","utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:760},isMobile:true,hasTouch:true});
   try{
    await page.setContent(pageHtml);
    await page.addScriptTag({path:path.resolve("travel/countries.js")});
    await page.addScriptTag({path:path.resolve("travel/country-picker.js")});
    await page.evaluate(()=>{
     document.querySelector("#app").classList.remove("hidden");
     document.querySelector("#travelHero").classList.remove("hidden");
     document.querySelector("#residencePanel").classList.remove("hidden");
     document.querySelector("#accountOverlay").classList.add("accountOpen","accountEditing");
     document.querySelector("#accountOverlay").setAttribute("aria-hidden","false");
     document.querySelector("#modal").classList.add("open");
     window.countryPickers={
       trip:window.BEAM_COUNTRY_PICKER.attach(document.querySelector("#tripCountrySelect"),document.querySelector("#tripCountrySearch")),
       residence:window.BEAM_COUNTRY_PICKER.attach(document.querySelector("#residence"),document.querySelector("#residenceSearch"))
     };
    });
    const select=page.locator("#tripCountrySelect");
    assert.equal(await select.locator("option").count(),250,"All 249 codes plus placeholder");
    assert.deepEqual((await select.locator("option").allTextContents()).slice(1,15),[
      "Guinée","Sénégal","Mali","Côte d’Ivoire","Sierra Leone","France",
      "Belgique","Maroc","Arabie saoudite","Turquie","Émirats arabes unis",
      "Chine","Canada","États-Unis"
    ]);
    await page.locator("#tripCountrySearch").fill("etats");
    assert.ok((await select.locator("option").allTextContents()).includes("États-Unis"));
    assert.ok((await select.locator("option").allTextContents()).length<20);
    assert.equal(await select.inputValue(),"","Typing must not save an unselected country");
    await select.selectOption("US");
    assert.equal(await select.inputValue(),"US");
    await page.locator("#tripCountrySearch").fill("ara");
    assert.ok((await select.locator("option").allTextContents()).includes("Arabie saoudite"));
    await select.selectOption("SA");
    assert.equal(await select.inputValue(),"SA");
    await page.evaluate(()=>window.countryPickers.trip.reset("SA"));
    assert.equal(await select.inputValue(),"SA","Editing must preserve the saved country");
    await page.locator("#residenceSearch").fill("cote");
    assert.ok((await page.locator("#residence option").allTextContents()).includes("Côte d’Ivoire"));
    await page.locator("#residence").selectOption("CI");
    assert.equal(await page.locator("#residence").inputValue(),"CI");
    const overflow=await page.evaluate(()=>({
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      trip:document.querySelector("#tripCountrySelect").getBoundingClientRect().right,
      residence:document.querySelector("#residence").getBoundingClientRect().right
    }));
    assert.ok(overflow.scrollWidth<=width+1,"Horizontal overflow "+JSON.stringify(overflow));
    assert.ok(overflow.trip<=width+1&&overflow.residence<=width+1);
    console.log("PASS "+width+"px: ISO249 native selection + filtered search without overflow");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
