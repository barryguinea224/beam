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

const edgeColors={
 wide:{top:[255,16,16],right:[16,255,16],bottom:[16,16,255],left:[255,16,255]},
 tall:{top:[255,156,16],right:[16,255,255],bottom:[255,255,16],left:[255,16,136]}
};
async function printedPhotoBoxes(page,mode){
 return page.evaluate(mode=>{
  const all=[...document.querySelectorAll(".sheet")],urls=window.__bookletFixture.urls;
  const wanted=mode==="wide"?
   [["cover",".cover .cover-photo",5],["hero",".photo-leaf .photo-hero",5],
    ["story",".story-leaf .media img",0]]:
   [["cover",".cover .cover-photo",0],["hero",".photo-leaf .photo-hero",0],
    ["story",".story-leaf .media img",5]];
  return wanted.map(([place,selector,index])=>{
   const image=place==="story"?
    [...document.querySelectorAll(selector)].find(img=>img.src===urls[index]):
    document.querySelector(selector);
   if(!image||image.src!==urls[index]||!image.naturalWidth||!image.naturalHeight)
    throw Error("Target source missing from printed "+place+": PHOTO "+(index+1));
   const sheet=image.closest(".sheet"),sheetIndex=all.indexOf(sheet);
   if(sheetIndex<0)throw Error("No printed A4 sheet for "+place);
   const frame=image.getBoundingClientRect(),paper=sheet.getBoundingClientRect(),
     cssWidth=image.clientWidth,cssHeight=image.clientHeight;
   // Imposed A5 leaves are rotated 90 degrees within a portrait A4 sheet.
   // The contained source's physical rectangle is therefore width=contentHeight,
   // height=contentWidth. Keep it centered in the transformed element frame.
   const scale=Math.min(cssWidth/image.naturalWidth,cssHeight/image.naturalHeight);
   const contentW=image.naturalWidth*scale,contentH=image.naturalHeight*scale;
   const printable={left:frame.left+(frame.width-contentH)/2,
    top:frame.top+(frame.height-contentW)/2,width:contentH,height:contentW};
   if(printable.width<=1||printable.height<=1)throw Error("Empty printed photo");
   return {place,index,sheetIndex,sheetWidth:paper.width,sheetHeight:paper.height,
    bounds:{x:printable.left-paper.left,y:printable.top-paper.top,
     width:printable.width,height:printable.height},
    fit:getComputedStyle(image).objectFit,
    source:{width:image.naturalWidth,height:image.naturalHeight}};
  });
 },mode);
}
function readPPM(file){
 const buffer=fs.readFileSync(file);let i=0;
 function token(){
  for(;;){
   while(i<buffer.length&&buffer[i]<=32)i++;
   if(buffer[i]!==35)break;
   while(i<buffer.length&&buffer[i]!==10)i++;
  }
  const begin=i;while(i<buffer.length&&buffer[i]>32)i++;
  return buffer.toString("ascii",begin,i);
 }
 assert.equal(token(),"P6");const width=+token(),height=+token(),max=+token();
 assert.equal(max,255);assert.ok(width>0&&height>0);
 if(buffer[i]===13&&buffer[i+1]===10)i+=2;else i++;
 assert.ok(buffer.length-i>=width*height*3,"Incomplete PPM PDF raster");
 return {buffer,width,height,start:i};
}
function hasEdgeColor(ppm,rect,rgb){
 const x0=Math.max(0,Math.floor(rect.x)),x1=Math.min(ppm.width,Math.ceil(rect.x+rect.width));
 const y0=Math.max(0,Math.floor(rect.y)),y1=Math.min(ppm.height,Math.ceil(rect.y+rect.height));
 let matches=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const offset=ppm.start+(y*ppm.width+x)*3;
  if(Math.abs(ppm.buffer[offset]-rgb[0])<=65&&
     Math.abs(ppm.buffer[offset+1]-rgb[1])<=65&&
     Math.abs(ppm.buffer[offset+2]-rgb[2])<=65){
    if(++matches>=2)return true;
  }
 }
 return false;
}
function assertPdfPhotoEdges(pdf,boxes,mode){
 const existing=new Map(),dpi=120;
 for(const box of boxes){
  assert.equal(box.fit,"contain",box.place+" must preserve full source without cover");
  if(!existing.has(box.sheetIndex)){
   const out=path.join(dir,"pdf-edges-"+mode+"-sheet-"+box.sheetIndex);
   execFileSync("pdftoppm",["-f",String(box.sheetIndex+1),"-l",String(box.sheetIndex+1),
    "-r",String(dpi),"-singlefile",pdf,out]);
   existing.set(box.sheetIndex,readPPM(out+".ppm"));
   fs.unlinkSync(out+".ppm");
  }
  const ppm=existing.get(box.sheetIndex),scale=ppm.width/box.sheetWidth;
  const rect={x:box.bounds.x*scale,y:box.bounds.y*scale,
   width:box.bounds.width*scale,height:box.bounds.height*scale};
  assert.ok(rect.x>=-2&&rect.y>=-2&&rect.x+rect.width<=ppm.width+2&&
   rect.y+rect.height<=ppm.height+2,
   "Contained image must lie completely within its physical A4 sheet: "+JSON.stringify(box));
  const palette=edgeColors[box.index===5?"wide":"tall"];
  for(const [edge,color] of Object.entries(palette))
   assert.ok(hasEdgeColor(ppm,rect,color),
    "Cropped/overlaid "+edge+" edge of PHOTO "+(box.index+1)+" in "+mode+" "+box.place+
    " (PDF page "+(box.sheetIndex+1)+") "+JSON.stringify({rect,box}));
 }
}

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
     const wide=i===5,tall=i===0;
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
     // Four distinct printed edge-marker colors per source; an actual cropped
     // image cannot pass all four checks after rasterizing the finished PDF.
     if(wide||tall){
      const colors=wide?["#ff1010","#10ff10","#1010ff","#ff10ff"]:
       ["#ff9c10","#10ffff","#ffff10","#ff1088"];
      const thick=Math.max(35,Math.round(Math.min(canvas.width,canvas.height)*.08));
      ctx.fillStyle=colors[0];ctx.fillRect(0,0,canvas.width,thick);
      ctx.fillStyle=colors[1];ctx.fillRect(canvas.width-thick,0,thick,canvas.height);
      ctx.fillStyle=colors[2];ctx.fillRect(0,canvas.height-thick,canvas.width,thick);
      ctx.fillStyle=colors[3];ctx.fillRect(0,0,thick,canvas.height);
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
    const resized=[];
    for(const n of [0,5]){
     const bitmap=await createImageBitmap(await (await fetch(item.photos[n])).blob());
     resized.push({index:n,width:bitmap.width,height:bitmap.height});
     bitmap.close();
    }
    window.__bookletFixture={pack:prepared.trips,urls:item.photos,map:data.map};
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
      coverSrc:document.querySelector(".cover .cover-photo")?.src,
      coverFit:getComputedStyle(document.querySelector(".cover .cover-photo")).objectFit,
      coverBackdrop:getComputedStyle(document.querySelector(".cover .cover-backdrop")).filter,
      heroBackdropSrc:document.querySelector(".photo-leaf .photo-backdrop")?.src,
      coverBackdropSrc:document.querySelector(".cover .cover-backdrop")?.src,
      mediaFit:getComputedStyle(document.querySelector(".story-leaf .media img")).objectFit,
      captionDoesNotOverlap:(()=>{
       const pairs=[[".cover .feature-frame",".cover .feature-caption"],
        [".photo-leaf .feature-frame",".photo-leaf .feature-caption"]];
       return pairs.every(([photo,caption])=>{
        const a=document.querySelector(photo).getBoundingClientRect(),
         b=document.querySelector(caption).getBoundingClientRect();
        return a.bottom<=b.top+1||b.bottom<=a.top+1||a.right<=b.left+1||b.right<=a.left+1;
       });
      })(),
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
   assert.equal(result.heroSrc,result.favorite,"PHOTO 6 favorite wins as full hero");
   assert.equal(result.coverSrc,result.favorite,"PHOTO 6 favorite wins as full cover");
   assert.equal(result.coverBackdropSrc,result.favorite);
   assert.equal(result.heroBackdropSrc,result.favorite);
   assert.equal(result.coverFit,"contain","full cover photograph must never be cropped");
   assert.match(result.coverBackdrop,/blur/);
   assert.equal(result.mediaFit,"contain","tall PHOTO 1 must never be cropped in story strip");
   assert.ok(result.captionDoesNotOverlap,"photo pixels and text bands must be disjoint");
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
   const wideBoxes=await printedPhotoBoxes(page,"wide");
   const filename=path.join(dir,"ten-photos-a5-portrait.pdf");
   fs.writeFileSync(filename,await page.pdf({format:"A4",landscape:false,preferCSSPageSize:false,
    printBackground:true}));
   assertPdfPhotoEdges(filename,wideBoxes,"wide");
   // Second scenario: PHOTO 1 (tall) is favorite on cover+hero, while
   // PHOTO 6 (wide) appears first in the story strip. Both use the exact
   // same resized, EXIF-free in-memory images.
   await page.emulateMedia({media:"screen"});
   const alternate=await page.evaluate(()=>{
    const fixture=window.__bookletFixture,urls=fixture.urls;
    const photos=[urls[5],urls[0],...urls.filter((_,i)=>i!==0&&i!==5)];
    return window.BEAM_FAMILY_BOOKLET.render(document,{
     trips:[{...fixture.pack[0],photos,favoritePhoto:urls[0]}],
     name:"Aminata Camara",mapSvgText:fixture.map,limitReached:false,
     generatedAt:new Date("2026-11-01T12:00:00Z")
    });
   });
   assert.equal(alternate,8,"portrait favorite must preserve booklet imposition");
   await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled,null,{timeout:20000});
   await page.emulateMedia({media:"print"});
   const tallBoxes=await printedPhotoBoxes(page,"tall");
   const portraitPdf=path.join(dir,"ten-photos-favorite-portrait-a5.pdf");
   fs.writeFileSync(portraitPdf,await page.pdf({format:"A4",landscape:false,
    preferCSSPageSize:false,printBackground:true}));
   assertPdfPhotoEdges(portraitPdf,tallBoxes,"tall");
   const portraitBytes=fs.statSync(portraitPdf).size;
   assert.ok(portraitBytes<12*1024*1024,"portrait favorite PDF must be WhatsApp-shareable");
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