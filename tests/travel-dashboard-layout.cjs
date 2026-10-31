"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8");
const baseCss=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const filterCss=fs.readFileSync("travel/dashboard-filters.css","utf8");
const filterPanel=html.match(/<section id="filterPanel"([\s\S]*?)<div id="travelPanels"/)?.[0]
 ?.replace(/<div id="travelPanels"$/,"");
assert.ok(baseCss&&filterPanel&&filterPanel.includes('id="filterScope"'),"real dashboard filter markup missing");
const footer=html.match(/<footer id="dashboardFooter"[\s\S]*?<\/footer>/)?.[0];
assert.ok(footer,"real dashboard footer markup missing");

async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:760},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   try{
    await page.setContent('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="app"><div class="w"><section class="hero" id="travelHero"><div><h1 id="dashboardTitle">Carnet de Mariama Djouldé Doumbouya</h1><div class="actions"><button class="btn">Ajouter un voyage</button><button class="btn ghost">Travel History PDF</button></div></div><div class="statsWrap"><div class="stats"><div class="stat"><b>2</b><small>voyages affichés</small></div><div class="stat"><b>1</b><small>pays affiché</small></div><div class="stat"><b>10</b><small>jours affichés</small></div></div></div></section>'+
      filterPanel+'<section class="panel"><div class="map" id="map"><svg viewBox="0 0 200 90"><path class="visited selectedCountry" data-country="FR" aria-pressed="true" d="M20 20h85v45h-85z"></path></svg></div><div id="countryList" class="countryList"><button class="countryChip" aria-pressed="true">France <b>2</b></button><button class="countryChip" aria-pressed="false">Guinée <b>1</b></button></div></section>'+footer+'</div></main></body></html>');
    await page.addStyleTag({content:baseCss+"\n"+filterCss});
    await page.evaluate(()=>{const panel=document.querySelector("#filterPanel");panel.classList.add("filterOpen");panel.setAttribute("aria-hidden","false");});
    const data=await page.evaluate(()=>{
      const controls=[...document.querySelectorAll("#filterPanel select,#filterPanel button,#countryList button,#logout")].map(el=>{
        const b=el.getBoundingClientRect();return {tag:el.tagName,left:b.left,right:b.right,height:b.height,width:b.width,text:el.textContent?.trim()};
      });
      const svg=document.querySelector(".selectedCountry");
      return {screen:innerWidth,scroll:document.documentElement.scrollWidth,controls,
        selectionStroke:getComputedStyle(svg).stroke,selectionFill:getComputedStyle(svg).fill,
        title:document.querySelector("h1").textContent};
    });
    assert.ok(data.scroll<=width+1,"dashboard overflow "+width+"px: "+JSON.stringify(data));
    assert.ok(data.title.includes("Mariama"));
    for(const item of data.controls){
      assert.ok(item.height>=43,"touch target too short "+width+"px: "+JSON.stringify(item));
      assert.ok(item.left>=-1&&item.right<=width+1,"control clipped "+width+"px: "+JSON.stringify(item));
    }
    assert.notEqual(data.selectionStroke,"none");
    assert.notEqual(data.selectionFill,"none");
    await page.locator("#filterScope").selectOption("domestic");
    assert.equal(await page.locator("#filterScope").inputValue(),"domestic");
    await page.locator("#countryList .countryChip").first().focus();
    const pressed=await page.locator("#countryList .countryChip").first().getAttribute("aria-pressed");
    assert.equal(pressed,"true");
    console.log("PASS dashboard Android "+width+"px: touch controls, no overflow, visual country selection");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
