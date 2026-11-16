"use strict";
// Verify an actual exported PNG's 1.5px grey flag outline around white portions,
// with both tricolour (FR) and white-background (JP) SVG assets.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:390,height:820}});
  await page.goto("about:blank");
  await page.addScriptTag({path:path.resolve("travel/trip-share.js")});
  const flags=Object.fromEntries(["fr","jp"].map(code=>[code,fs.readFileSync("travel/assets/flags/"+code+".svg","utf8")]));
  const results=await page.evaluate(async flags=>{
   const data={};
   for(const code of ["fr","jp"]){
    const flag=new Image();
    flag.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(flags[code]);
    await flag.decode();
    const c=document.createElement("canvas");
    const api=window.BEAM_TRIP_SHARE;
    api.draw(c,{country:code==="fr"?"France":"Japon",cities:"Ville fictive",
     dates:"10 → 20 oct. 2026",days:11,flag});
    const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
    const bitmap=await createImageBitmap(blob);
    const sampled=document.createElement("canvas");sampled.width=1080;sampled.height=1350;
    const ctx=sampled.getContext("2d");ctx.drawImage(bitmap,0,0);
    const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
    data[code]={width:bitmap.width,height:bitmap.height,type:blob.type,
     border:pixel(72,655),white:pixel(code==="fr"?105:83,655)};
    bitmap.close();
   }
   return data;
  },flags);
  for(const code of ["fr","jp"]){
   const p=results[code];
   assert.equal(p.width,1080);assert.equal(p.height,1350);assert.equal(p.type,"image/png");
   const [red,green,blue,alpha]=p.border;
   assert.equal(alpha,255,"Border must be opaque on "+code);
   assert.ok(red>=120&&red<=230&&green>=120&&green<=235&&blue>=120&&blue<=235,
     "Border must have a neutral grey pixel "+code+": "+JSON.stringify(p.border));
   assert.ok(Math.abs(red-green)<45&&Math.abs(green-blue)<45,
     "Border must be neutral "+code+": "+JSON.stringify(p.border));
   assert.ok(p.white.slice(0,3).every(x=>x>=235),
     "Flag white portion must remain visible inside the border: "+code+" "+JSON.stringify(p.white));
  }
  console.log("PASS FR/JP actual 1080x1350 PNG: grey pixel around complete rounded flags and visible white area");
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
