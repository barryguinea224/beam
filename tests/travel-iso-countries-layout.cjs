"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:740},isMobile:true,hasTouch:true});
   try{
    await page.setContent(html);
    await page.addScriptTag({path:path.resolve("travel/countries.js")});
    await page.addScriptTag({path:path.resolve("travel/country-picker.js")});
    await page.evaluate(()=>{
      document.querySelector("#app").classList.remove("hidden");
      document.querySelector("#travelHero").classList.remove("hidden");
      document.querySelector("#residencePanel").classList.remove("hidden");
      document.querySelector("#modal").classList.add("open");
      window.testTrip=window.BEAM_COUNTRY_PICKER.attach({
        searchInput:document.querySelector("#tripCountrySearch"),
        select:document.querySelector("#tripCountrySelect"),
        countries:window.BEAM_COUNTRIES
      });
      window.testResidence=window.BEAM_COUNTRY_PICKER.attach({
        searchInput:document.querySelector("#residenceSearch"),
        select:document.querySelector("#residence"),
        countries:window.BEAM_COUNTRIES
      });
    });
    await page.locator("#tripCountrySearch").fill("ara");
    const first=await page.locator("#tripCountrySelect option").evaluateAll(nodes=>nodes.map(n=>({code:n.value,label:n.textContent})));
    assert.ok(first.some(x=>x.code==="SA"&&x.label==="Arabie saoudite"),"Arabie must be in search results");
    assert.ok(first.length<249,"Search must filter long menu");
    await page.locator("#tripCountrySelect").selectOption("SA");
    assert.equal(await page.locator("#tripCountrySearch").inputValue(),"Arabie saoudite");
    assert.equal(await page.locator("#tripCountrySelect").inputValue(),"SA");
    await page.locator("#tripCountrySearch").fill("etats");
    assert.ok(await page.locator("#tripCountrySelect option[value='US']").count(),"Accent-insensitive search absent");
    assert.equal(await page.locator("#tripCountrySelect").inputValue(),"","Typing a new query must not keep an old selection");
    await page.evaluate(()=>window.testTrip.setValue("GF"));
    assert.equal(await page.locator("#tripCountrySelect").inputValue(),"GF","Editing must restore French Guiana");
    await page.locator("#residenceSearch").fill("reunion");
    assert.ok(await page.locator("#residence option[value='RE']").count());
    const measurements=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,
      viewport:innerWidth,
      input:document.querySelector("#tripCountrySearch").getBoundingClientRect().right,
      select:document.querySelector("#tripCountrySelect").getBoundingClientRect().right
    }));
    assert.ok(measurements.scroll<=width+1,"country picker overflow at "+width+": "+JSON.stringify(measurements));
    assert.ok(measurements.input<=width+1&&measurements.select<=width+1);
    console.log("PASS ISO249 search on "+width+"px");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(err=>{console.error(err);process.exitCode=1});
