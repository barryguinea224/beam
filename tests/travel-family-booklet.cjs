"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const BOOK=require("../travel/family-booklet.js");
const JOURNAL=require("../travel/printable-journal.js");
assert.equal(JOURNAL.titleForName("Aminata"),"Carnet d\u0027Aminata".replace("\\u0027","\u0027"));
assert.equal(JOURNAL.titleForName("Youssouf"),"Carnet de Youssouf");
const expected={
 4:[[4,1],[2,3]],
 8:[[8,1],[2,7],[6,3],[4,5]],
 12:[[12,1],[2,11],[10,3],[4,9],[8,5],[6,7]]
};
for(const [count,stacks] of Object.entries(expected)){
 const result=BOOK.imposedOrder(Number(count));
 assert.deepEqual(result.map(x=>[x.left,x.right]),stacks);
 assert.deepEqual([...result.flatMap(x=>[x.left,x.right])].sort((a,b)=>a-b),
  Array.from({length:Number(count)},(_,i)=>i+1));
 assert.equal(result.length,Number(count)/2,"Two printed A5 leaves per A4 side");
}
assert.throws(()=>BOOK.imposedOrder(6),/multiple|imposable/);
assert.equal(BOOK.splitMemory("abc").join(""),"abc");
const source=fs.readFileSync("travel/family-booklet.js","utf8");
assert.ok(!/\.innerHTML\s*=|document\.write\s*\(/.test(source),"Untrusted text must be inserted as DOM text only");
assert.match(source,/referrerpolicy/);
assert.match(source,/size:A4 portrait/);
assert.doesNotMatch(source,/transform:rotate\(180deg\)/);
assert.doesNotMatch(source,/Noto Color Emoji|Apple Color Emoji/,"Emoji font must not capture ASCII spaces or numerals in printed PDF");
assert.doesNotMatch(source,/size:A4 landscape/);
assert.match(source,/transform:rotate\(90deg\) translateY\(-100%\)/);
assert.match(source,/@page\{size:A4 portrait;margin:0\}/);
assert.doesNotMatch(source,/@media print and \(orientation:landscape\)/);
assert.ok(!source.includes("localStorage")&&!source.includes("caches.open"));
const album=fs.readFileSync("travel/index.html","utf8");
assert.ok(album.includes('src="./family-booklet.js"')&&album.includes("BEAM_FAMILY_BOOKLET.render(tab.document"));
const dir=path.resolve("test-artifacts/family-booklet");
fs.mkdirSync(dir,{recursive:true});
const mapSvgText=fs.readFileSync("travel/assets/world-map.svg","utf8");
const dummyUrl="https://fixture.invalid/imaginary-sunset.webp?signature=FICTIVE";
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#c8d9ad"/><path d="M0 440 Q400 160 960 360 L960 540 L0 540Z" fill="#4c7958"/><circle cx="770" cy="130" r="78" fill="#e4ac68"/></svg>';
const model={
 name:"Aminata Camara",
 generatedAt:new Date("2026-10-31T12:00:00Z"),
 filters:{},
 mapSvgText,
 trips:[
  {trip:{id:"fictif-2026",country_code:"SN",cities:["Dakar"],entry_date:"2026-07-04",
    exit_date:"2026-07-19",duration_days:16,purpose:"famille",note:"Nous avons marché sur la plage au coucher du soleil.",is_domestic:false},
   activities:[{title:"Promenade sur la plage",place:"Dakar",happened_on:"2026-07-12"}],
   photos:[dummyUrl],favoritePhoto:dummyUrl,missingPhotos:0},
  {trip:{id:"fictif-2025",country_code:"GN",cities:["Dalaba"],entry_date:"2025-05-01",
    exit_date:"2025-05-08",duration_days:8,purpose:"famille",note:"Une semaine de retrouvailles, de rires et de souvenirs.",is_domestic:true},
   activities:[{title:"Pique-nique en famille",place:"Dalaba",happened_on:"2025-05-03"}],
   photos:[],missingPhotos:0}
 ]
};
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:360,height:780},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   await page.route("https://fixture.invalid/**",route=>route.fulfill({status:200,contentType:"image/svg+xml",body:svg}));
   await page.setContent("<!doctype html><html lang='fr'><head></head><body></body></html>");
   for(const mod of ["countries.js","dashboard-filters.js","printable-journal.js","family-booklet.js"])
    await page.addScriptTag({path:path.resolve("travel",mod)});
   const count=await page.evaluate(data=>window.BEAM_FAMILY_BOOKLET.render(document,{
    ...data,generatedAt:new Date(data.generatedAt)
   }),{...model,generatedAt:model.generatedAt.toISOString()});
   assert.equal(count,8,"cover + map spread + 2x trip spreads + final page");
   // About:blank has no /travel origin. Inject ONLY the same audited public SVG
   // flags into the fictional PDF fixture. The real app still uses local URLs.
   const fixtureFlags=Object.fromEntries(["gn","sn"].map(code=>[
    code,"data:image/svg+xml;base64,"+fs.readFileSync(path.resolve("travel/assets/flags",code+".svg")).toString("base64")
   ]));
   await page.evaluate(flags=>{
    for(const img of document.querySelectorAll('img[src^="/travel/assets/flags/"]')){
     const code=img.getAttribute("src").split("/").pop().replace(".svg","");
     if(flags[code])img.src=flags[code];
    }
   },fixtureFlags);
   await page.waitForFunction(()=>[...document.querySelectorAll('img[src^="data:image/svg+xml;base64,"]')]
    .every(img=>img.complete&&img.naturalWidth>0),null,{timeout:10000});
   await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled,null,{timeout:20000});
   const audit=await page.evaluate(()=>{
    const pages=[...document.querySelectorAll(".leaf")];
    const photos=[...document.querySelectorAll("img")].filter(x=>x.src.includes("fixture.invalid"));
    return {
     sheetCount:document.querySelectorAll(".sheet").length,
     order:[...document.querySelectorAll(".sheet")].map(x=>({
      side:x.dataset.side,left:x.querySelector(".left .leaf")?.textContent.slice(0,38),
      right:x.querySelector(".right .leaf")?.textContent.slice(0,38)
     })),
     photoCount:photos.length,leafCount:pages.length,
     oldestIndex:pages.findIndex(p=>p.textContent.includes("Dalaba")),
     newestIndex:pages.findIndex(p=>p.textContent.includes("Dakar")),
     text:document.body.textContent,
     hasEmptyMemoryPage:pages.some(x=>x.classList.contains("story-leaf")&&!x.textContent.trim()),
     smallFlags:[...document.querySelectorAll(".story-main .flag-small,.media .placeholder .flag-small")].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})),
     consentCount:document.querySelectorAll("input[type=checkbox]").length,
     format:document.querySelector("#bookletFormat").value,
     paperRect:(()=>{const r=document.querySelector(".sheet").getBoundingClientRect();return {width:r.width,height:r.height}})(),
     leafRect:(()=>{const e=document.querySelector(".leaf"),r=getComputedStyle(e);return {width:parseFloat(r.width),height:parseFloat(r.height)}})(),
     rotatedPages:[...document.querySelectorAll(".leaf")].filter(e=>getComputedStyle(e).transform!=="none").length,
     rotatedSpreads:[...document.querySelectorAll(".spread")].filter(e=>getComputedStyle(e).transform!=="none").length,
     mapGuinea:[...document.querySelectorAll('.world path[data-country="GN"]')].map(e=>e.classList.contains("visited")),
     mapViewport:[...document.querySelectorAll(".world svg")].map(e=>e.getAttribute("viewBox")),
     eastMapPathCount:(()=>{const east=[...document.querySelectorAll(".world-leaf")].find(e=>e.textContent.includes("2/2"));return east?.querySelectorAll("svg path").length||0})(),
     bookletHelp:document.querySelector(".toolbar .help")?.textContent,
     justifiedText:[...document.querySelectorAll("h1,h2,h3,blockquote,.natural")].filter(e=>getComputedStyle(e).textAlign==="justify"||getComputedStyle(e).textAlignLast==="justify").length,
     coverTitle:document.querySelector(".cover h1")?.textContent,
     tabTitle:document.title
    };
   });
   assert.equal(audit.sheetCount,4);
   assert.equal(audit.format,"booklet");
   assert.equal(audit.coverTitle,"Carnet d\u0027Aminata Camara".replace("\\u0027","\u0027"));
   assert.equal(audit.tabTitle,"Carnet d\u0027Aminata Camara".replace("\\u0027","\u0027"));
   assert.ok(audit.paperRect.height>audit.paperRect.width,"Physical A4 must be portrait");
   assert.equal(audit.rotatedSpreads,0,"Portrait layout must not rotate oversized spreads");
   assert.deepEqual(audit.mapGuinea,[true,true],"Domestic Guinea must be highlighted on both map halves");
   assert.deepEqual(audit.mapViewport,["0 0 522 445","478 0 522 445"],"Map halves overlap");
   assert.ok(audit.eastMapPathCount>10,"World map 2/2 must contain actual country paths");
   assert.match(audit.bookletHelp,/Portrait, recto verso bord court/);
   assert.ok(audit.leafRect.height>audit.leafRect.width,"A5 must be portrait");
   assert.equal(audit.rotatedPages,8,"Rotate the eight A5 leaves inside their portrait sheet halves");
   assert.equal(audit.justifiedText,0,"No justified titles or prose");
   assert.ok(audit.photoCount>=2,"A private signed photo appears on cover and spread");
   assert.ok(audit.oldestIndex>=0&&audit.newestIndex>=0);
   // DOM order is imposition order, so first compare the logical content sequence by pages 4/5.
   assert.equal(audit.hasEmptyMemoryPage,false);
   assert.ok(audit.smallFlags.length>=2,"Story flags must exist on the printed booklet");
   for(const rect of audit.smallFlags){
    assert.ok(rect.width<=44&&rect.height<=30,"A flag must not grow to fill a story or mosaic: "+JSON.stringify(rect));
   }
   const logicalPhotos=await page.evaluate(()=>[...document.querySelectorAll(".photo-leaf")]
    .map(leaf=>({country:leaf.querySelector("h2")?.textContent,n:Number(leaf.querySelector(".page-number")?.textContent)}))
    .sort((a,b)=>a.n-b.n).map(x=>x.country));
   assert.deepEqual(logicalPhotos,["Guinée","Sénégal"],"Trips must run oldest to newest, regardless of physical imposition");
   assert.equal(audit.consentCount,0);
   assert.ok(!/BEAM|passeport|numéro de pièce|adresse postale|non destiné|autorité officielle/i.test(audit.text));
   assert.ok(audit.text.includes("Nos prochains voyages…"));
   assert.ok(audit.text.includes("31 octobre 2026"));
   assert.deepEqual(audit.order.map(x=>x.side),["recto","verso","recto","verso"]);
   // Confirm that five logical markers for EACH of the eight A5 leaves fit
   // inside BOTH their half-sheet clipping rectangle and physical A4 sheet.
   // A raster 90%-ink test by itself cannot catch clipped content.
   await page.emulateMedia({media:"print"});
   const landmarks=await page.evaluate(()=>{
    const corners=[
     ["haut-gauche",{top:"2mm",left:"2mm"}],
     ["haut-droite",{top:"2mm",right:"2mm"}],
     ["bas-gauche",{bottom:"2mm",left:"2mm"}],
     ["bas-droite",{bottom:"2mm",right:"2mm"}],
     ["centre",{top:"calc(50% - 1mm)",left:"calc(50% - 1mm)"}]
    ];
    const results=[];
    for(const [i,half] of [...document.querySelectorAll(".sheet .half")].entries()){
     const leaf=half.querySelector(".leaf"),sheet=half.closest(".sheet");
     if(!leaf)throw Error("A5 leaf missing at printed half "+i);
     const bounds=[half.getBoundingClientRect(),sheet.getBoundingClientRect()];
     for(const [name,css] of corners){
      const marker=document.createElement("span");
      marker.className="test-print-landmark";
      Object.assign(marker.style,{position:"absolute",width:"2mm",height:"2mm",
       background:"#111",pointerEvents:"none",...css});
      leaf.appendChild(marker);
      const m=marker.getBoundingClientRect();
      const fits=bounds.every(b=>m.left>=b.left-.5&&m.top>=b.top-.5&&
        m.right<=b.right+.5&&m.bottom<=b.bottom+.5);
      results.push({half:i,corner:name,fits});
     }
    }
    return results;
   });
   assert.equal(landmarks.length,40,"Five markers for each of eight A5 sides");
   for(const mark of landmarks)assert.ok(mark.fits,"Cropped A5 marker: "+JSON.stringify(mark));
   await page.evaluate(()=>document.querySelectorAll(".test-print-landmark").forEach(e=>e.remove()));
   const print=path.join(dir,"demo-livret-a5-sur-a4-portrait.pdf");
   fs.writeFileSync(print,await page.pdf({format:"A4",landscape:false,preferCSSPageSize:false,printBackground:true}));
   assert.doesNotMatch(execFileSync("pdffonts",[print],{encoding:"utf8"}),/NotoColorEmoji|AppleColorEmoji/,"Unexpected emoji-font fallback; Type 3 alone is not an emoji");
   const info=execFileSync("pdfinfo",[print],{encoding:"utf8"});
   assert.match(info,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
   const dims=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
   assert.ok(dims&&Number(dims[1])<Number(dims[2]),"Android-forced A4 must be portrait");
   assert.match(info,/Pages:\s+4\b/,"Eight A5 leaves must occupy four A4 printed sides");
   // Check the nonwhite raster extent of every physical side (Poppler grayscale PGM).
   // Unlike pdfinfo this catches tiny spreads that occupy only the top third.
   function inkExtent(pdf,n){
    const pgmRoot=path.join(dir,"raster-page-"+n);
    execFileSync("pdftoppm",["-f",String(n),"-l",String(n),"-r","36","-singlefile","-gray",pdf,pgmRoot]);
    const buf=fs.readFileSync(pgmRoot+".pgm");
    fs.unlinkSync(pgmRoot+".pgm");
    let pos=0;
    function token(){
     while(pos<buf.length){
      if(buf[pos]===35){while(pos<buf.length&&buf[pos]!==10)pos++}
      else if(buf[pos]<=32)pos++;
      else break;
     }
     const a=pos;while(pos<buf.length&&buf[pos]>32)pos++;
     return buf.toString("ascii",a,pos);
    }
    assert.equal(token(),"P5");
    const width=+token(),height=+token(),max=+token();
    assert.equal(max,255);assert.ok(width>0&&height>0);pos++;
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     if(buf[pos+y*width+x]<254){
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
     }
    }
    assert.ok(maxX>=0,"Page "+n+" is blank");
    return {width:(maxX-minX+1)/width,height:(maxY-minY+1)/height};
   }
   for(let n=1;n<=4;n++){
    const extent=inkExtent(print,n);
    assert.ok(extent.width>=.90&&extent.height>=.90,
      "Portrait side "+n+" covers less than 90%: "+JSON.stringify(extent));
   }
   const text=execFileSync("pdftotext",["-layout",print,"-"],{encoding:"utf8"}).replace(/\s+/g," ");
   const visibleText=text.replace(/[·•]/g," ").replace(/\s+/g," ").toLocaleLowerCase("fr");
   for(const token of ["Carnet d'Aminata Camara","Notre monde 1/2","Notre monde 2/2",
    "Guinée","Sénégal","Dalaba","Dakar","Nos prochains voyages"]){
    assert.ok(visibleText.includes(token.toLocaleLowerCase("fr")),"Missing or clipped PDF text "+token);
   }
   assert.ok(!text.includes("Document personnel, non destiné"));
   // Switch formats without a fresh Supabase query or requesting another signed URL.
   await page.selectOption("#bookletFormat","simple");
   assert.equal(await page.locator(".sheet").count(),8);
   assert.equal(await page.locator(".half.left").count(),0);
   const plain=path.join(dir,"demo-pages-simples-a4.pdf");
   fs.writeFileSync(plain,await page.pdf({format:"A4",landscape:false,preferCSSPageSize:false,printBackground:true}));
   assert.doesNotMatch(execFileSync("pdffonts",[plain],{encoding:"utf8"}),/NotoColorEmoji|AppleColorEmoji/,"Unexpected emoji font in simple PDF");
   const singleInfo=execFileSync("pdfinfo",[plain],{encoding:"utf8"});
   assert.match(singleInfo,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
   assert.match(singleInfo,/Pages:\s+8\b/);
   const simpleDims=singleInfo.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
   assert.ok(simpleDims&&Number(simpleDims[1])<Number(simpleDims[2]),"Simple A4 physical pages must be portrait");
   const fillers=await page.evaluate(data=>{
    const trips=[{...data.trips[0],photos:Array(4).fill(data.trips[0].photos[0])}];
    const count=window.BEAM_FAMILY_BOOKLET.render(document,{...data,trips,generatedAt:new Date(data.generatedAt)});
    return {count,notes:document.querySelectorAll(".notes-leaf").length,
     mosaic:document.querySelectorAll(".mosaic-leaf").length,
     photos:document.querySelectorAll(".mosaic-grid img").length,
     titles:[...document.querySelectorAll(".notes-leaf h2,.mosaic-leaf h2,.closing h2")].map(x=>x.textContent)};
   },{...model,generatedAt:model.generatedAt.toISOString()});
   assert.equal(fillers.count,8);
   assert.equal(fillers.notes,1);
   assert.equal(fillers.mosaic,1);
   assert.equal(fillers.photos,1);
   assert.deepEqual(fillers.titles,["Notes","Quelques images de plus","Nos prochains voyages…"]);
   const youssouf=await page.evaluate(data=>{
    window.BEAM_FAMILY_BOOKLET.render(document,{...data,name:"Youssouf",generatedAt:new Date(data.generatedAt)});
    return [document.title,document.querySelector(".cover h1")?.textContent];
   },{...model,generatedAt:model.generatedAt.toISOString()});
   assert.deepEqual(youssouf,["Carnet de Youssouf","Carnet de Youssouf"]);
   console.log("PASS family booklet: A4 portrait, 40 A5 landmarks, 1/2+2/2 maps, all PDF titles/countries, short-edge help, varied fillers");
  }finally{await page.close()}
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
