"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const PDF=require("../travel/factual-pdf.js");
const SECRET="SECRET_MEMORIES_MUST_NOT_APPEAR_83092";
const rows=Array.from({length:92},(_,i)=>({
 country_code:i%2?"GN":"FR",cities:[i%2?"Conakry":"Paris","Destination "+i],
 entry_date:"2026-01-05",exit_date:"2026-01-09",duration_days:5,
 purpose:i%2?"affaires":"tourisme",
 note:SECRET,activities:[{title:SECRET}],storage_path:SECRET,
 photo_url:"https://third-party.invalid/"+SECRET
}));
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"beam-pdf-test-"));
 try{
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  try{
   await page.setContent('<!doctype html><html lang="fr"><head></head><body></body></html>');
   await page.addScriptTag({path:path.resolve("travel/countries.js")});
   await page.addScriptTag({path:path.resolve("travel/factual-pdf.js")});
   await page.evaluate(({rows,displayName,generatedAt})=>
     window.BEAM_TRAVEL_PDF.render(document,rows,{displayName,generatedAt:new Date(generatedAt)}),
     {rows,displayName:"Fatou Diallo",generatedAt:"2026-10-30T12:00:00Z"});
   const audit=await page.evaluate(()=>({
     imageCount:document.querySelectorAll("img,svg,canvas,iframe,video").length,
     externalResources:[...document.querySelectorAll("[src],[href]")].length,
     text:document.body.textContent,
     button:document.querySelector(".print-button")?.textContent,
     disclaimer:document.querySelector(".page-notice")?.textContent
   }));
   assert.equal(audit.imageCount,0);
   assert.equal(audit.externalResources,0);
   assert.ok(!audit.text.includes(SECRET));
   assert.equal(audit.disclaimer,PDF.DECLARATION);
   assert.match(audit.button,/Enregistrer au format PDF/);
   const destination=path.join(dir,"sample.pdf");
   fs.writeFileSync(destination,await page.pdf({printBackground:true,preferCSSPageSize:true}));
   const info=execFileSync("pdfinfo",[destination],{encoding:"utf8"});
   const count=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
   assert.ok(count>=2,"Long travel history must span multiple A4 pages; "+info);
   const allText=execFileSync("pdftotext",["-layout",destination,"-"],{encoding:"utf8"});
   for(const unsafe of [SECRET,"note","photo_url","activities","storage_path"]){
     assert.ok(!allText.includes(unsafe),"Private data or column name in PDF: "+unsafe);
   }
   assert.match(allText,/Voyageur\s*:\s*Fatou Diallo/);
   assert.match(allText,/Document généré le 30\/10\/2026/);
   assert.match(allText,/France/);
   assert.match(allText,/Tourisme/);
   assert.match(allText,/05\/01\/2026/);
   assert.match(allText,/Historique de voyages/);
   for(let i=1;i<=count;i++){
     const text=execFileSync("pdftotext",["-f",String(i),"-l",String(i),"-layout",destination,"-"],{encoding:"utf8"});
     assert.ok(text.includes(PDF.DECLARATION),
       "Mandatory non-official notice absent on printed page "+i+" / "+count);
   }
   const images=execFileSync("pdfimages",["-list",destination],{encoding:"utf8"}).trim().split("\n");
   assert.equal(images.length,2,"Generated PDF must contain NO images");
   console.log("BEAM PDF PRINT PASS: "+count+" A4 pages, non-official notice on each, no private data/images");
  }finally{await page.close()}
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
