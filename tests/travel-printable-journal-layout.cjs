"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const NOTICE="Document personnel, non destiné aux démarches administratives";
const PRIVATE_EMAIL="PRIVATE_EMAIL_MUST_NOT_APPEAR_3952";
const PASSPORT="PRIVATE_PASSPORT_MUST_NOT_APPEAR_9321";
const signedUrl="https://private-photo.example.test/temporary.webp?token=TEST_ONLY";
const missingUrls=[
 "https://private-photo.example.test/missing-1.webp?token=TEST_ONLY",
 "https://private-photo.example.test/missing-2.webp?token=TEST_ONLY"
];
const webp=Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==","base64");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"beam-personal-journal-"));
 try{
  for(const width of [360,390]){
   const page=await browser.newPage({viewport:{width,height:760},isMobile:true,hasTouch:true});
   await page.route("https://private-photo.example.test/**",route=>{
      if(route.request().url().includes("/missing-"))
        return route.fulfill({status:404,body:"",headers:{"cache-control":"no-store"}});
      return route.fulfill({status:200,body:webp,contentType:"image/webp",headers:{"cache-control":"no-store"}});
    });
   try{
    await page.setContent('<!doctype html><html lang="fr"><head></head><body></body></html>');
    await page.addScriptTag({path:path.resolve("travel/countries.js")});
    await page.addScriptTag({path:path.resolve("travel/dashboard-filters.js")});
    await page.addScriptTag({path:path.resolve("travel/printable-journal.js")});
    await page.evaluate(({signedUrl,missingUrls,PRIVATE_EMAIL,PASSPORT})=>{
      const trip={
       id:"test-1",country_code:"SN",cities:["Dakar"],entry_date:"2026-04-01",exit_date:"2026-04-09",
       duration_days:9,purpose:"tourisme",is_domestic:false,note:"Souvenir privé de Dakar",
       email:PRIVATE_EMAIL,passport:PASSPORT
      };
      const national={...trip,id:"test-2",country_code:"GN",cities:["Kindia"],note:"Séjour à Kindia",is_domestic:true};
      BEAM_PERSONAL_JOURNAL.render(document,{
       name:"Aminata Diallo",filters:{country:"SN",year:"2026"},
       trips:[
        {trip,activities:Array.from({length:45},(_,i)=>({title:"Activité au Sénégal "+i,place:"Dakar",happened_on:"2026-04-03"})),photos:[signedUrl,...missingUrls]},
        {trip:national,activities:[{title:"Visite familiale"}],photos:[]}
       ]
      });
    },{signedUrl,missingUrls,PRIVATE_EMAIL,PASSPORT});
    await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled,{timeout:15000});
    const audit=await page.evaluate(()=>({
     text:document.body.textContent, title:document.title,
     width:document.documentElement.scrollWidth,innerWidth,
     photos:[...document.querySelectorAll("img")].map(x=>({ref:x.getAttribute("referrerpolicy"),complete:x.complete})),
     noticeHead:document.querySelector(".page-head")?.textContent,
     noticeFoot:document.querySelector(".page-foot")?.textContent,
      status:document.querySelector(".load-status")?.textContent,
      missingCaptions:document.querySelectorAll("figcaption.photo-missing").length
    }));
    assert.ok(audit.width<=width+1,"journal horizontal overflow on "+width+": "+JSON.stringify(audit));
    assert.equal(audit.noticeHead,NOTICE);assert.equal(audit.noticeFoot,NOTICE);
    assert.match(audit.text,/Carnet de Aminata Diallo/);
    assert.match(audit.text,/Sénégal · 2026/);
    assert.match(audit.text,/Séjour national/);
    assert.match(audit.text,/Souvenir privé de Dakar/);
    assert.match(audit.text,/Visite familiale/);
    assert.ok(!audit.text.includes(PRIVATE_EMAIL)&&!audit.text.includes(PASSPORT));
    assert.ok(audit.photos.every(x=>x.ref==="no-referrer"));
    assert.match(audit.status,/2 photos n'ont pas pu être chargées/,
      "two failed images must be explicitly reported before print");
    assert.equal(audit.missingCaptions,2,"failed photos must have printed placeholders");
    assert.equal(audit.photos.length,1,"only successfully loaded images remain");
    const dest=path.join(dir,"journal-"+width+".pdf");
    fs.writeFileSync(dest,await page.pdf({printBackground:true,preferCSSPageSize:true}));
    const info=execFileSync("pdfinfo",[dest],{encoding:"utf8"});
    const a4=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)/);
    assert.ok(a4 && Math.abs(Number(a4[1])-595.28)<1.5 &&
      Math.abs(Number(a4[2])-841.89)<1.5,"Printed document must be physical A4: "+info);
    const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.ok(pages>=3,"Expected multi-page A4 with cover, got "+pages);
    for(let p=1;p<=pages;p++){
     const txt=execFileSync("pdftotext",["-f",String(p),"-l",String(p),"-layout",dest,"-"],{encoding:"utf8"});
     if(!txt.includes(NOTICE))throw new Error("Mandatory disclaimer absent from printed A4 page "+
       p+"/"+pages+"; page contents="+JSON.stringify(txt.slice(0,1100)));
    }
    const text=execFileSync("pdftotext",["-layout",dest,"-"],{encoding:"utf8"});
    assert.ok(!text.includes(PRIVATE_EMAIL)&&!text.includes(PASSPORT));
    assert.ok(text.includes("Séjour national")&&text.includes("Sénégal")&&text.includes("Kindia"));
    assert.ok(text.includes("Activité au Sénégal"));
    const images=execFileSync("pdfimages",["-list",dest],{encoding:"utf8"}).split("\n");
    assert.ok(images.length>2,"A signed photo must be included in printed journal PDF");
    console.log("PASS personal journal "+width+"px "+pages+" A4 pages, header/footer each page, private photo, no identity/overflow");
   }finally{await page.close()}
  }
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
