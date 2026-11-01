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
assert.doesNotMatch(source,/size:A4 portrait/);
assert.doesNotMatch(source,/transform:rotate\(180deg\)/);
assert.doesNotMatch(source,/Noto Color Emoji|Apple Color Emoji/,"Emoji font must not capture ASCII spaces or numerals in printed PDF");
assert.match(source,/size:A4 landscape/);
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
     leafRect:(()=>{const r=document.querySelector(".leaf").getBoundingClientRect();return {width:r.width,height:r.height}})(),
     rotatedPages:[...document.querySelectorAll(".leaf")].filter(e=>getComputedStyle(e).transform!=="none").length,
     justifiedText:[...document.querySelectorAll("h1,h2,h3,blockquote,.natural")].filter(e=>getComputedStyle(e).textAlign==="justify"||getComputedStyle(e).textAlignLast==="justify").length,
     coverTitle:document.querySelector(".cover h1")?.textContent,
     tabTitle:document.title
    };
   });
   assert.equal(audit.sheetCount,4);
   assert.equal(audit.format,"booklet");
   assert.equal(audit.coverTitle,"Carnet d\u0027Aminata Camara".replace("\\u0027","\u0027"));
   assert.equal(audit.tabTitle,"Carnet d\u0027Aminata Camara".replace("\\u0027","\u0027"));
   assert.ok(audit.paperRect.width>audit.paperRect.height,"A4 must be landscape");
   assert.ok(audit.leafRect.height>audit.leafRect.width,"A5 must be portrait");
   assert.equal(audit.rotatedPages,0,"No A5 leaf may be rotated");
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
   const print=path.join(dir,"demo-livret-a5-portrait-impose.pdf");
   fs.writeFileSync(print,await page.pdf({preferCSSPageSize:true,printBackground:true}));
   assert.doesNotMatch(execFileSync("pdffonts",[print],{encoding:"utf8"}),/NotoColorEmoji|Type 3/,"ASCII letters, spaces and digits must not fall back to emoji fonts");
   const info=execFileSync("pdfinfo",[print],{encoding:"utf8"});
   assert.match(info,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
   const dims=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
   assert.ok(dims&&Number(dims[1])>Number(dims[2]),"Printed A4 must be landscape");
   assert.match(info,/Pages:\s+4\b/,"Eight A5 leaves must occupy four A4 printed sides");
   const text=execFileSync("pdftotext",["-raw",print,"-"],{encoding:"utf8"}).replace(/\s+/g," ");
   for(const token of ["Carnet d\u0027Aminata Camara".replace("\\u0027","\u0027"),"Dalaba","Dakar","Nos prochains voyages"]){
    assert.ok(text.includes(token),"Missing fictional content "+token);
   }
   assert.ok(!text.includes("Document personnel, non destiné"));
   // Switch formats without a fresh Supabase query or requesting another signed URL.
   await page.selectOption("#bookletFormat","simple");
   assert.equal(await page.locator(".sheet").count(),8);
   assert.equal(await page.locator(".half.left").count(),0);
   const plain=path.join(dir,"demo-pages-simples-a4.pdf");
   fs.writeFileSync(plain,await page.pdf({preferCSSPageSize:true,printBackground:true}));
   assert.doesNotMatch(execFileSync("pdffonts",[plain],{encoding:"utf8"}),/NotoColorEmoji|Type 3/,"Simple A4 PDF must not substitute emoji font for spacing");
   const singleInfo=execFileSync("pdfinfo",[plain],{encoding:"utf8"});
   assert.match(singleInfo,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
   assert.match(singleInfo,/Pages:\s+8\b/);
   const simpleDims=singleInfo.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
   assert.ok(simpleDims&&Number(simpleDims[1])>Number(simpleDims[2]),"Simple A4 stays landscape");
   const youssouf=await page.evaluate(data=>{
    window.BEAM_FAMILY_BOOKLET.render(document,{...data,name:"Youssouf",generatedAt:new Date(data.generatedAt)});
    return [document.title,document.querySelector(".cover h1")?.textContent];
   },{...model,generatedAt:model.generatedAt.toISOString()});
   assert.deepEqual(youssouf,["Carnet de Youssouf","Carnet de Youssouf"]);
   console.log("PASS family booklet: 4/8/12 imposition, A5 portrait left binding on A4 landscape, elision, upright pages, left-aligned headings, 8 A4 simple pages");
  }finally{await page.close()}
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
