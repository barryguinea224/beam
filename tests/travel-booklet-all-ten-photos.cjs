"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const BOOK=require("../travel/family-booklet.js");
const dir=path.resolve("test-artifacts/family-booklet");
fs.mkdirSync(dir,{recursive:true});
const map=fs.readFileSync("travel/assets/world-map.svg","utf8");
const trip={id:"fixture-ten",country_code:"GN",cities:["Kindia"],entry_date:"2026-07-01",
 exit_date:"2026-07-10",duration_days:10,purpose:"tourisme",note:"Dix photographies.",
 is_domestic:true};
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:950,height:850}});
  try{
   await page.setContent("<!doctype html><html lang='fr'><head></head><body></body></html>");
   for(const mod of ["countries.js","dashboard-filters.js","printable-journal.js","family-booklet.js"])
    await page.addScriptTag({path:path.resolve("travel",mod)});
   const result=await page.evaluate(async data=>{
    const originals=new Map(),signed=[];
    for(let i=0;i<10;i++){
     const wide=i===0,tall=i===7;
     const canvas=document.createElement("canvas");
     canvas.width=wide?4200:tall?1000:2000;
     canvas.height=wide?1050:tall?4200:1500;
     const ctx=canvas.getContext("2d");
     const grad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
     grad.addColorStop(0,"hsl("+(i*36)+",75%,24%)");
     grad.addColorStop(.5,"hsl("+((i*36+65)%360)+",85%,70%)");
     grad.addColorStop(1,"hsl("+((i*36+145)%360)+",62%,37%)");
     ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height);
     for(let j=0;j<130;j++){
      ctx.fillStyle="hsla("+((i*36+j*9)%360)+",72%,57%,.30)";
      ctx.beginPath();ctx.arc((j*173+i*37)%canvas.width,(j*191+i*61)%canvas.height,
       10+(j*37)%140,0,2*Math.PI);ctx.fill();
     }
     ctx.font="bold 180px sans-serif";ctx.fillStyle="white";ctx.fillText("PHOTO "+(i+1),30,220);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
     const signedUrl="https://fixture.invalid/photo-"+i+".jpg?signature=FICTIVE_"+i;
     signed.push(signedUrl);originals.set(signedUrl,blob);
     canvas.width=canvas.height=1;
    }
    const requests=[];
    const env={document,createImageBitmap:blob=>window.createImageBitmap(blob),
     fetch:async(url,opts)=>{
      requests.push({url,cache:opts.cache,mode:opts.mode,credentials:opts.credentials});
      return new Response(originals.get(url),{status:200,headers:{"content-type":"image/jpeg"}});
     }};
    const prepared=await window.BEAM_FAMILY_BOOKLET.preparePhotos([{
      trip:data.trip,activities:[],photos:signed,favoritePhoto:signed[5],missingPhotos:0
    }],env);
    const item=prepared.trips[0];
    const originalDimensions=[[4200,1050],[1000,4200]];
    const resized=[];
    for(const n of [0,7]){
     const bitmap=await createImageBitmap(await (await fetch(item.photos[n])).blob());
     resized.push({index:n,width:bitmap.width,height:bitmap.height});
     bitmap.close();
    }
    const count=window.BEAM_FAMILY_BOOKLET.render(document,{
      trips:prepared.trips,name:"Aminata Camara",generatedAt:new Date("2026-11-01T12:00:00Z"),
      mapSvgText:data.map,limitReached:true,unoptimized:prepared.unoptimized});
    const leaf=[...document.querySelectorAll(".leaf")];
    const arranged=[...leaf].sort((a,b)=>{
      const an=Number(a.querySelector(".page-number")?.textContent)||0,
       bn=Number(b.querySelector(".page-number")?.textContent)||0;
      return an-bn;
    });
    return {count,unoptimized:prepared.unoptimized,requests,resized,
      photos:item.photos.map(x=>({prefix:x.slice(0,25),length:x.length})),
      unique:new Set(item.photos).size,
      heroSrc:document.querySelector(".photo-leaf .photo-hero")?.src,
      favorite:item.favoritePhoto,
      heroFit:getComputedStyle(document.querySelector(".photo-hero")).objectFit,
      blur:getComputedStyle(document.querySelector(".photo-backdrop")).filter,
      mosaicFit:getComputedStyle(document.querySelector(".mosaic-grid img")).objectFit,
      mosaicCount:document.querySelectorAll(".mosaic-grid img").length,
      mosaicLeaves:document.querySelectorAll(".mosaic-leaf").length,
      tripMosaic:[...document.querySelectorAll(".mosaic-leaf")].map(x=>x.dataset.trip),
      mosaicIndexes:[...document.querySelectorAll(".mosaic-grid img")].map(x=>x.dataset.photoIndex),
      paperCount:document.querySelectorAll(".sheet").length,
      closeText:document.querySelector(".toolbar .help").textContent,
      leafClassCounts: [...document.querySelectorAll(".leaf")].map(x=>x.className),
      statusAtStart:document.querySelector(".toolbar [role=status]").textContent,
      chapterOrder:[...document.querySelectorAll(".leaf")].map(x=>x.className)};
   },{trip,map});
   assert.equal(result.count,8,"8 logical A5 leaves including two journey-local mosaic leaves");
   assert.equal(result.paperCount,4,"A4 portrait imposition must remain four physical sides");
   assert.equal(result.unoptimized,0,"all signed fixtures must be compressed in memory");
   assert.equal(result.requests.length,10,"unique signed image fetched once each");
   assert.ok(result.requests.every(x=>x.cache==="no-store"&&x.credentials==="omit"));
   assert.equal(result.unique,10,"all 10 distinct photos must survive");
   assert.ok(result.photos.every(x=>x.prefix.startsWith("data:image/jpeg;base64,")&&x.length<2200000),
    "no signed URL may remain in prepared print HTML; bounded JPEG payloads");
   assert.equal(result.heroSrc,result.favorite,"favorite wins as full hero, not merely first");
   assert.equal(result.heroFit,"contain","wide/tall hero must show the whole photograph");
   assert.match(result.blur,/blur/,"background must be from the same image and blurred");
   assert.equal(result.mosaicFit,"contain","very tall thumbnail must remain legible");
   assert.equal(result.mosaicLeaves,2);
   assert.equal(result.mosaicCount,9);
   assert.deepEqual(result.tripMosaic,["fixture-ten","fixture-ten"]);
   assert.deepEqual([...result.mosaicIndexes].sort((a,b)=>Number(a)-Number(b)),["2","3","4","5","6","7","8","9","10"],
    "imposition changes DOM order, but all nine additional pictures must occur exactly once");
   assert.deepEqual(result.resized.map(x=>Math.max(x.width,x.height)),[1500,1500]);
   for(const d of result.resized)assert.ok(d.width>0&&d.height>0);
   assert.match(result.closeText,/bord court/);
   await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled,null,{timeout:20000});
   const status=await page.locator(".toolbar [role=status]").textContent();
   assert.match(status,/Limite de 60 photos atteinte/);
   await page.emulateMedia({media:"print"});
   const corners=await page.evaluate(()=>{
    const hits=[];
    for(const half of document.querySelectorAll(".sheet .half")){
     const paper=half.closest(".sheet").getBoundingClientRect(),leaf=half.querySelector(".leaf");
     for(const [left,top] of [[.04,.04],[.96,.04],[.04,.96],[.96,.96],[.5,.5]]){
      const x=paper.left+paper.width*left;
      const y=paper.top+paper.height*((half.classList.contains("right")?.5:0)+top*.5);
      const start=half.classList.contains("right")?paper.top+paper.height/2:paper.top;
      hits.push({okay:x>=paper.left&&x<=paper.right&&y>=start&&y<=start+paper.height/2,
        leaf:leaf?.className});
     }
    }
    return hits;
   });
   assert.equal(corners.length,40);
   assert.ok(corners.every(p=>p.okay));
   const filename=path.join(dir,"ten-photos-a5-portrait.pdf");
   fs.writeFileSync(filename,await page.pdf({format:"A4",landscape:false,preferCSSPageSize:false,
    printBackground:true}));
   const bytes=fs.statSync(filename).size;
   assert.ok(bytes<12*1024*1024,"WhatsApp-shareable 10 photo booklet must stay under 12 MiB, got "+bytes);
   const info=execFileSync("pdfinfo",[filename],{encoding:"utf8"});
   assert.match(info,/Pages:\s+4\b/);
   assert.match(info,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
   const images=execFileSync("pdfimages",["-list",filename],{encoding:"utf8"}).split("\n")
     .filter(line=>/^\s*\d+\s+\d+\s+image\s+/.test(line));
   assert.ok(images.length>=10,"all ten unique photos must be embedded in the actual PDF (found "+images.length+")");
   const text=execFileSync("pdftotext",["-layout",filename,"-"],{encoding:"utf8"});
   for(const word of ["Nos photos","1/2","2/2","Kindia","Carnet d'Aminata Camara"])
    assert.ok(text.includes(word),"missing printed content: "+word);
   console.log("PASS 10 private photos embedded, 1500px resampling, portrait+wide contain, two local mosaics, A4 booklet, PDF "+bytes+" bytes");
  }finally{await page.close()}
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});