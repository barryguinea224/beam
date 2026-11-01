"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const dir=path.resolve("test-artifacts/family-booklet");
fs.mkdirSync(dir,{recursive:true});
const mapSvgText=fs.readFileSync("travel/assets/world-map.svg","utf8");
const flags=Object.fromEntries(["gn","sn"].map(code=>[
 code,"data:image/svg+xml;base64,"+fs.readFileSync(path.resolve("travel/assets/flags",code+".svg")).toString("base64")
]));
function item(id,country_code,date,photos=[]){
 return {trip:{id,country_code,cities:[country_code==="GN"?"Kindia":"Dakar"],
  entry_date:date,exit_date:date,duration_days:1,purpose:"famille",is_domestic:country_code==="GN",
  note:"Un souvenir de notre voyage."},activities:[],photos,missingPhotos:0};
}
async function replaceFlags(page){
 await page.evaluate(values=>{
  for(const img of document.querySelectorAll('img[src^="/travel/assets/flags/"]')){
   const key=img.getAttribute("src").split("/").pop().replace(".svg","");
   if(values[key])img.src=values[key];
  }
 },flags);
 await page.waitForFunction(()=>{
  const icons=[...document.querySelectorAll('img[src^="data:image/svg+xml;base64,"]')];
  return icons.length>0&&icons.every(i=>i.complete&&i.naturalWidth>0);
 },null,{timeout:12000});
}
async function audit(page,mode){
 return page.evaluate(mode=>{
  const cover=document.querySelector(".cover"),leaves=[...document.querySelectorAll(".photo-leaf")];
  const target=leaves.find(e=>e.textContent.includes("Guinée"));
  const box=target?.querySelector(".feature-frame");
  const flag=box?.querySelector(".flag-big");
  const br=flag?.getBoundingClientRect(),container=box?.getBoundingClientRect();
  const art=cover.querySelector(".feature-frame");
  const coverInner=cover.querySelector(".feature-caption");
  return {mode,coverHasFrame:!!art,coverNoPhoto:cover.classList.contains("no-photo"),
   coverText:coverInner?.textContent||"",coverStyle:getComputedStyle(cover).backgroundImage,
   frameCount:target?.querySelectorAll(".feature-frame").length||0,
   frameFallback:box?.classList.contains("flag-fallback"),framePhotos:box?.querySelectorAll(".photo-hero,.photo-backdrop").length||0,
   flagCount:box?.querySelectorAll("img.flag-big").length||0,flagLoaded:!!flag&&flag.complete&&flag.naturalWidth>0,
   flagSize:br?{width:br.width,height:br.height}:null,
   flagCentered:!!br&&!!container&&Math.abs((br.left+br.right)/2-(container.left+container.right)/2)<=2&&
     Math.abs((br.top+br.bottom)/2-(container.top+container.bottom)/2)<=2,
   noEmptyFrames:[...document.querySelectorAll(".feature-frame")].every(f=>
    f.querySelector(".cover-photo,.photo-hero,.flag-big")),
   coverHasPhoto:!!cover.querySelector(".cover-photo"),
   coverContentHeight:coverInner?.getBoundingClientRect().height,
   photoLeafCount:leaves.length,
   imposition:document.querySelectorAll(".sheet").length,
   ready:!document.querySelector(".toolbar button")?.disabled,
   text:document.body.textContent};
 },mode);
}
async function savePdf(page,name){
 const filename=path.join(dir,name);
 await page.emulateMedia({media:"print"});
 fs.writeFileSync(filename,await page.pdf({format:"A4",landscape:false,preferCSSPageSize:false,printBackground:true}));
 const info=execFileSync("pdfinfo",[filename],{encoding:"utf8"});
 assert.match(info,/Pages:\s+4\b/,"8 A5 leaves must remain four physical A4 sides");
 assert.match(info,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
 const text=execFileSync("pdftotext",["-layout",filename,"-"],{encoding:"utf8"}).replace(/\s+/g," ");
 for(const word of ["Carnet d'Aminata Camara","Guinée","Kindia","Nos prochains voyages"])
  assert.ok(text.includes(word),"missing PDF content: "+word);
 assert.ok(fs.statSync(filename).size<12*1024*1024,"photo-free booklet must be WhatsApp-shareable");
 await page.emulateMedia({media:"screen"});
 return filename;
}
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:950,height:850}});
  try{
   await page.setContent("<!doctype html><html lang=fr><head></head><body></body></html>");
   for(const mod of ["countries.js","dashboard-filters.js","printable-journal.js","family-booklet.js"])
    await page.addScriptTag({path:path.resolve("travel",mod)});
   const withPhoto=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=800;c.height=550;
    const x=c.getContext("2d");x.fillStyle="#4c7958";x.fillRect(0,0,800,550);
    x.fillStyle="#ffcf56";x.fillRect(50,50,700,450);
    return c.toDataURL("image/jpeg",.75);
   });
   const base={name:"Aminata Camara",generatedAt:new Date("2026-11-01T13:00:00Z"),
    mapSvgText,limitReached:false};
   // Case A: mixed journey, one trip without photo, one with a valid signed/processed photo.
   assert.equal(await page.evaluate(data=>window.BEAM_FAMILY_BOOKLET.render(document,{
    ...data,generatedAt:new Date(data.generatedAt)
   }),{...base,generatedAt:base.generatedAt.toISOString(),
    trips:[item("no-photo-gn","GN","2026-01-05"),item("with-photo-sn","SN","2026-03-07",[withPhoto])]}),8);
   await replaceFlags(page);
   await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled);
   const mixed=await audit(page,"mixed");
   assert.equal(mixed.frameCount,1,"photo-free journey must have a single deliberate fallback frame");
   assert.equal(mixed.frameFallback,true);
   assert.equal(mixed.framePhotos,0,"no broken or empty private-photo element");
   assert.equal(mixed.flagCount,1,"the photo frame must contain one large local national flag");
   assert.ok(mixed.flagLoaded&&mixed.flagCentered&&mixed.flagSize.width>170&&mixed.flagSize.height>110,
    "large flag must be visible and centered, not just a miniature caption flag: "+JSON.stringify(mixed));
   assert.ok(mixed.noEmptyFrames,"all frames must contain a photo or an explicit large flag");
   assert.ok(mixed.coverHasFrame&&mixed.coverHasPhoto,"cover must use the available Senegal photo");
   assert.equal(mixed.imposition,4);
   await savePdf(page,"mixed-photo-and-no-photo-a5-portrait.pdf");
   // Case B: whole carnet has ZERO photos; the green cover is typographic, without empty photo box.
   assert.equal(await page.evaluate(data=>window.BEAM_FAMILY_BOOKLET.render(document,{
    ...data,generatedAt:new Date(data.generatedAt)
   }),{...base,generatedAt:base.generatedAt.toISOString(),trips:[item("only-gn","GN","2026-07-05")]}),8);
   await replaceFlags(page);
   const none=await audit(page,"zero");
   assert.equal(none.coverHasFrame,false,"no empty 141mm photo frame on the cover");
   assert.equal(none.coverHasPhoto,false);
   assert.equal(none.coverNoPhoto,true,"cover must render polished typography-only fallback");
   assert.match(none.coverStyle,/gradient/);
   assert.ok(none.coverContentHeight>600,"typographic cover must fill the page");
   assert.ok(none.coverText.includes("Carnet d'Aminata Camara"));
   assert.equal(none.frameCount,1);
   assert.equal(none.frameFallback,true);
   assert.equal(none.framePhotos,0);
   assert.equal(none.flagCount,1);
   assert.ok(none.flagLoaded&&none.flagCentered&&none.flagSize.width>170&&none.flagSize.height>110,
    "zero-photo journey must still have a big centered Guinea flag: "+JSON.stringify(none));
   assert.ok(none.noEmptyFrames,"no empty feature-frame in entire zero-photo booklet");
   assert.ok(none.ready,"printing must not wait for absent photos");
   assert.equal(none.imposition,4);
   const pdf=await savePdf(page,"no-photos-a5-portrait.pdf");
   console.log("PASS photo-free journey and photo-free booklet: no empty frames, large local GN flag, full cover typography, 4 A4 PDF sides, "+fs.statSync(pdf).size+" bytes");
  }finally{await page.close()}
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});