"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const countries=fs.readFileSync("travel/countries.js","utf8");
const visual=fs.readFileSync("travel/visual-cards.js","utf8");
const css=fs.readFileSync("travel/visual-cards.css","utf8");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390,768]){
   const page=await browser.newPage({viewport:{width,height:750},isMobile:true,hasTouch:true});
   const external=[];
   page.on("request",req=>{if(/^https?:/.test(req.url()))external.push(req.url())});
   try{
    await page.setContent('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="trips"></div></body></html>');
    await page.addStyleTag({content:'*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}body{background:#f7f5ef;color:#17231f;font-family:system-ui;padding:12px}#trips{max-width:480px;margin:0 auto}' + css});
    await page.addScriptTag({content:countries});
    await page.addScriptTag({content:visual});
    await page.evaluate(()=>{
      const t=(code,name,city,domestic=false)=>({
       id:"60000000-0000-4000-8000-00000000000"+(["FR","GN","SA","NZ"].indexOf(code)+1),country_code:code,cities:[city],duration_days:11,
       is_domestic:domestic,cover_media_id:null
      });
      const trips=[t("FR","France","Paris"),t("GN","Guinée","Labé",true),t("SA","Arabie saoudite","Djeddah"),t("NZ","Nouvelle-Zélande","Auckland")];
      document.querySelector("#trips").innerHTML=trips.map(x=>
        BEAM_VISUAL_CARDS.markup(x,BEAM_COUNTRIES.NAMES[x.country_code],"Tourisme","20 → 30 juin 2026")).join("");
    });
    const state=await page.evaluate(()=>{
      const box=document.querySelector("#trips").getBoundingClientRect();
      const cards=[...document.querySelectorAll(".tripOpen")].map(el=>{
        const b=el.getBoundingClientRect();
        return {left:b.left,right:b.right,width:b.width,height:b.height,label:el.textContent};
      });
      return {scrollWidth:document.documentElement.scrollWidth,innerWidth,cards,boxRight:box.right,
       flagUrls:[...document.querySelectorAll(".journeyFlag")].map(el=>el.getAttribute("src")),
       artUrls:[...document.querySelectorAll(".journeyBackdrop")].map(el=>el.getAttribute("src"))};
    });
    assert.ok(state.scrollWidth<=width+1,"Horizontal overflow at "+width+": "+JSON.stringify(state));
    for(const c of state.cards){
      assert.ok(c.left>=-1&&c.right<=width+1&&c.height>=176,
        "Card clipped or too short at "+width+": "+JSON.stringify(c));
    }
    assert.equal(state.cards.length,4);
    assert.ok(state.cards[0].label.includes("France"));
    assert.ok(state.cards[1].label.includes("Voyage intérieur"));
    assert.ok(state.cards[2].label.includes("Djeddah"));
    assert.ok(state.cards[3].label.includes("Nouvelle-Zélande"));
    assert.ok(state.flagUrls.every(src=>src.startsWith("./assets/flags/")));
    assert.ok(state.artUrls.every(src=>src.startsWith("./assets/countries/")));
    assert.deepEqual(external,[],"No third-party requests in visual cards at "+width);
    console.log("PASS visual cards "+width+"px: responsive, ISO fallback, zero third-party requests");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
