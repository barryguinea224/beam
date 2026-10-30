"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390,720]){
   const page=await browser.newPage({viewport:{width,height:740},isMobile:true,hasTouch:true});
   try{
    await page.setContent(html);
    await page.evaluate(()=>{
     document.querySelector("#app").classList.remove("hidden");
     for(const selector of ["#travelHero","#residencePanel","#travelPanels","#myAccount"])document.querySelector(selector).classList.remove("hidden");
     document.querySelector("#nd").textContent="1286";
     document.querySelector("#nt").textContent="12345";
     document.querySelector("#nc").textContent="249";
     document.querySelector("#domesticCount").textContent="+ 14 séjours intérieurs";
     const select=document.querySelector("#residence");
     const option=document.createElement("option");option.value="AE";option.textContent="Émirats arabes unis";select.appendChild(option);select.value="AE";
     document.querySelector("#countryList").innerHTML='<button class="countryChip">Guinée</button> <button class="countryChip">Arabie saoudite</button>';
    });
    const m=await page.evaluate(()=>{
     const vw=window.innerWidth;
     const overflow=document.documentElement.scrollWidth-vw;
     const metrics=[".statsWrap",".stats",".stat","#residencePanel","#residence","#countryList",".countryChip"].map(sel=>{
      const boxes=[...document.querySelectorAll(sel)].map(el=>el.getBoundingClientRect());
      return {sel,maxRight:Math.max(...boxes.map(x=>x.right)),minLeft:Math.min(...boxes.map(x=>x.left))};
     });
     return {vw,overflow,metrics};
    });
    assert.ok(m.overflow<=1,"Horizontal page overflow "+width+"px: "+JSON.stringify(m));
    for(const el of m.metrics){
     assert.ok(el.minLeft>=-1&&el.maxRight<=width+1,"Clipped "+el.sel+" at "+width+"px "+JSON.stringify(el));
    }
    console.log("PASS mobile "+width+"px: header, 4-digit stats, residence and chips in viewport");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
