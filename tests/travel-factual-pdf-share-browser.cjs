"use strict";
// Browser share test: the native Web Share API receives the actual PDF File,
// never the about:blank preview URL or a link to private data.
const assert=require("node:assert/strict");
const path=require("node:path");
const {chromium}=require("playwright");
const secret="SECRET_PASSPORT_MUST_NEVER_APPEAR_921";
const rows=[{country_code:"SN",cities:["Dakar"],entry_date:"2026-08-01",
 exit_date:"2026-08-03",duration_days:3,purpose:"tourisme",
 note:secret,passport:secret,storage_path:secret}];
const generatedAt="2026-10-31T12:00:00Z";
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const context=await browser.newContext({
   viewport:{width:360,height:780},isMobile:true,hasTouch:true,acceptDownloads:true
  });
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.setContent('<!doctype html><html lang="fr"><head></head><body></body></html>');
  for(const script of ["countries.js","factual-pdf.js","factual-pdf-file.js"])
   await page.addScriptTag({path:path.resolve("travel",script)});
  await page.evaluate(()=>{
   window.__shareCalls=[];
   Object.defineProperty(navigator,"canShare",{configurable:true,value:({files})=>
    files?.length===1&&files[0].type==="application/pdf"});
   Object.defineProperty(navigator,"share",{configurable:true,value:async(payload)=>{
    const file=payload.files[0];
    const b=new Uint8Array(await file.arrayBuffer());
    const decoded=new TextDecoder("windows-1252").decode(b);
    window.__shareCalls.push({type:file.type,name:file.name,size:file.size,
     pdfHeader:decoded.slice(0,8),includesEmail:decoded.includes("auth@example.net"),
     includesPhone:decoded.includes("+224 612 34 56 78"),
     includesCompactPhone:decoded.includes("+224612345678"),
     includesPassport:decoded.includes("SECRET_PASSPORT"),
     containsBrand:decoded.includes("BEAM"),
     title:payload.title,hasUrl:Object.prototype.hasOwnProperty.call(payload,"url")});
   }});
  });
  // Consent OFF: even if extra metadata was supplied, output is private by default.
  await page.evaluate(({rows,generatedAt})=>{
   BEAM_TRAVEL_PDF.render(document,rows,{
    displayName:"Fatou Diallo",generatedAt:new Date(generatedAt),
    includeContacts:false,
    contacts:{email:"auth@example.net",phone:"+224612345678",postalAddress:"Conakry"}
   });
  },{rows,generatedAt});
  let text=await page.locator("body").textContent();
  assert.ok(!text.includes("auth@example.net")&&!text.includes("+224612345678"));
  assert.ok(!text.includes("Coordonnées déclarées"));
  await page.locator(".share-button").click();
  await page.waitForFunction(()=>window.__shareCalls.length===1);
  const a=await page.evaluate(()=>window.__shareCalls[0]);
  assert.equal(a.type,"application/pdf");
  assert.equal(a.name,"Historique-de-voyages-Fatou-Diallo.pdf");
  assert.equal(a.pdfHeader,"%PDF-1.4");
  assert.equal(a.includesEmail,false);
  assert.equal(a.includesPhone,false);
  assert.equal(a.includesPassport,false);
  assert.equal(a.containsBrand,false,"shared PDF bytes must not contain BEAM");
  assert.equal(a.hasUrl,false,"must never send preview or private document URL");

  await page.evaluate(({rows,generatedAt})=>{
   BEAM_TRAVEL_PDF.render(document,rows,{
    displayName:"Fatou Diallo",generatedAt:new Date(generatedAt),
    includeContacts:true,
    contacts:{email:"auth@example.net",phone:"+224612345678",
     postalAddress:"Conakry",passport:"SECRET_PASSPORT"}
   });
  },{rows,generatedAt});
  text=await page.locator("body").textContent();
  assert.match(text,/Coordonnées déclarées/);
  assert.match(text,/auth@example.net/);
  assert.match(text,/\+224 612 34 56 78/);
  assert.ok(!text.includes("+224612345678"));
  assert.ok(!text.includes(secret));
  await page.locator(".share-button").click();
  await page.waitForFunction(()=>window.__shareCalls.length===2);
  const b=await page.evaluate(()=>window.__shareCalls[1]);
  assert.equal(b.includesEmail,true);
  assert.equal(b.includesPhone,true);
  assert.equal(b.includesCompactPhone,false,"shared file must show grouped phone only");
  assert.equal(b.includesPassport,false);
  assert.equal(b.containsBrand,false);

  // Unsupported browser must download a local PDF, never share a link.
  await page.evaluate(()=>{
   Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>false});
  });
  const [download]=await Promise.all([page.waitForEvent("download",{timeout:10000}),
   page.locator(".share-button").click()]);
  assert.equal(download.suggestedFilename(),"Historique-de-voyages-Fatou-Diallo.pdf");
  assert.deepEqual(errors,[]);
  console.log("PASS mobile Chrome factual PDF share: native File, opt-in privacy, no URL, safe local download fallback");
  await context.close();
 }finally{await browser.close()}
}
main().catch(err=>{console.error(err);process.exitCode=1});
