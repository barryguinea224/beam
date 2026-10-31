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
const mapSvgText=fs.readFileSync("travel/assets/world-map.svg","utf8");
const flagDir=path.resolve("travel/assets/flags");
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"beam-personal-journal-"));
 try{
  for(const width of [360,390]){
   const page=await browser.newPage({viewport:{width,height:760},isMobile:true,hasTouch:true});
   await page.route("http://127.0.0.1/travel/assets/flags/**",async route=>{
     const code=route.request().url().match(/\/([a-z]{2})\.svg$/)?.[1];
     if(!code)return route.fulfill({status:404,body:""});
     try{
      return route.fulfill({status:200,contentType:"image/svg+xml",
       body:await fs.promises.readFile(path.join(flagDir,code+".svg"))});
     }catch{return route.fulfill({status:404,body:""})}
   });
   await page.route("https://private-photo.example.test/**",route=>{
      if(route.request().url().includes("/missing-"))
        return route.fulfill({status:404,body:"",headers:{"cache-control":"no-store"}});
      return route.fulfill({status:200,body:webp,contentType:"image/webp",headers:{"cache-control":"no-store"}});
    });
   try{
    await page.setContent('<!doctype html><html lang="fr"><head><base href="http://127.0.0.1/travel/"></head><body></body></html>');
    await page.addScriptTag({path:path.resolve("travel/countries.js")});
    await page.addScriptTag({path:path.resolve("travel/dashboard-filters.js")});
    await page.addScriptTag({path:path.resolve("travel/printable-journal.js")});
    await page.evaluate(({signedUrl,missingUrls,PRIVATE_EMAIL,PASSPORT,mapSvgText})=>{
      const trip={
       id:"test-1",country_code:"SN",cities:["Dakar"],entry_date:"2026-04-01",exit_date:"2026-04-09",
       duration_days:9,purpose:"tourisme",is_domestic:false,note:"Souvenir privé de Dakar",
       email:PRIVATE_EMAIL,passport:PASSPORT
      };
      const national={...trip,id:"test-2",country_code:"GN",cities:["Kindia"],note:"Séjour à Kindia",is_domestic:true};
      BEAM_PERSONAL_JOURNAL.render(document,{
       name:"Aminata Diallo",filters:{country:"SN",year:"2026"},
       mapSvgText,limitReached:true,generatedAt:new Date("2026-10-31T12:00:00Z"),
       trips:[
        {trip,activities:Array.from({length:45},(_,i)=>({title:"Activité au Sénégal "+i,place:"Dakar",happened_on:"2026-04-03"})),photos:[signedUrl,...missingUrls]},
        {trip:national,activities:[{title:"Visite familiale"}],photos:[]}
       ]
      });
    },{signedUrl,missingUrls,PRIVATE_EMAIL,PASSPORT,mapSvgText});
    await page.waitForFunction(()=>!document.querySelector(".toolbar button").disabled,{timeout:15000});
    const audit=await page.evaluate(()=>({
     text:document.body.textContent, title:document.title,
     width:document.documentElement.scrollWidth,innerWidth,
     photos:[...document.querySelectorAll('img[src^="https://"]')].map(x=>({ref:x.getAttribute("referrerpolicy"),complete:x.complete})),
     noticeHead:document.querySelector(".screen-head")?.textContent,
     noticeFoot:document.querySelector(".screen-foot")?.textContent,
      mapVisited:[...document.querySelectorAll(".atlas path.atlas-visited")].map(p=>p.getAttribute("data-country")),
      inkChoice:document.querySelector("#inkSaver")?.type,
      quotaText:document.querySelector(".load-status")?.textContent,
      domesticPills:[...document.querySelectorAll(".trip-hero .pill")].filter(x=>x.textContent==="Séjour national").length,
      status:document.querySelector(".load-status")?.textContent,
      missingCaptions:document.querySelectorAll("figcaption.photo-missing").length
    }));
    assert.ok(audit.width<=width+1,"journal horizontal overflow on "+width+": "+JSON.stringify(audit));
    assert.equal(audit.noticeHead,NOTICE);assert.equal(audit.noticeFoot,NOTICE);
    assert.match(audit.text,/Carnet d'Aminata Diallo/);
    assert.match(audit.text,/Sénégal · 2026/);
    assert.match(audit.text,/Séjour national/);
    assert.match(audit.text,/Souvenir privé de Dakar/);
    assert.match(audit.text,/Visite familiale/);
    assert.ok(!audit.text.includes(PRIVATE_EMAIL)&&!audit.text.includes(PASSPORT));
    assert.ok(audit.photos.every(x=>x.ref==="no-referrer"));
    assert.match(audit.status,/2 photos n'ont pas pu être chargées/,
      "two failed images must be explicitly reported before print");
    assert.equal(audit.missingCaptions,2,"failed photos must have printed placeholders");
    assert.equal(audit.photos.length,2,"one authorized image reused by cover and journey");
    assert.equal(audit.inkChoice,"checkbox");
    assert.deepEqual(new Set(audit.mapVisited),new Set(["GN","SN"]));
    const bounds=await page.locator(".atlas svg").evaluate(svg=>({
      x:svg.viewBox.baseVal.x,y:svg.viewBox.baseVal.y,
      width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height
    }));
    assert.ok(bounds.width<800&&bounds.height<400,
      "the atlas must zoom on the two visited West African countries: "+JSON.stringify(bounds));
    assert.equal(audit.domesticPills,1,"one national badge per journey");
    assert.match(audit.quotaText,/Limite de 40 photos atteinte/);
    const dest=path.join(dir,"journal-"+width+".pdf");
    fs.writeFileSync(dest,await page.pdf({printBackground:true,preferCSSPageSize:true}));
    const info=execFileSync("pdfinfo",[dest],{encoding:"utf8"});
    const a4=info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)/);
    assert.ok(a4 && Math.abs(Number(a4[1])-595.28)<1.5 &&
      Math.abs(Number(a4[2])-841.89)<1.5,"Printed document must be physical A4: "+info);
    const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.ok(pages>=5,"Expected visual cover, yearbook and two spreads, got "+pages);
    const first=execFileSync("pdftotext",["-f","1","-l","1","-layout",dest,"-"],{encoding:"utf8"});
    const second=execFileSync("pdftotext",["-f","2","-l","2","-layout",dest,"-"],{encoding:"utf8"});
    assert.match(first,/Carnet d'Aminata Diallo/);
    assert.match(second,/Mon année en voyages/);
    for(let p=1;p<=pages;p++){
     const txt=execFileSync("pdftotext",["-f",String(p),"-l",String(p),"-layout",dest,"-"],{encoding:"utf8"});
     if(!txt.includes(NOTICE))throw new Error("Mandatory disclaimer absent from printed A4 page "+
       p+"/"+pages+"; page contents="+JSON.stringify(txt.slice(0,1100)));
    }
    const text=execFileSync("pdftotext",["-layout",dest,"-"],{encoding:"utf8"});
    assert.ok(!text.includes(PRIVATE_EMAIL)&&!text.includes(PASSPORT));
    assert.ok(text.includes("Séjour national")&&text.includes("Sénégal")&&text.includes("Kindia"));
    assert.ok(text.includes("Activité au Sénégal"));
    assert.ok(text.includes("Carnet généré le 31 octobre 2026 par BEAM Travel History"));
    const pageNumberTest=execFileSync("pdftotext",["-f","2","-l","2","-layout",dest,"-"],{encoding:"utf8"});
    assert.match(pageNumberTest,/\b2\b/,"page numbers should be present in A4 margin boxes");
    await page.locator("#inkSaver").check();
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("ink-saver")),true);
    await page.locator("#inkSaver").uncheck();
    if(width===360){
      const destDir=path.resolve("test-artifacts/travel-journal");
      fs.mkdirSync(destDir,{recursive:true});
      for(const [pageNo,label] of [[1,"01-couverture"],[2,"02-synthese"],[3,"03-voyage-photo"],[4,"04-voyage-souvenir"]]){
       execFileSync("pdftoppm",["-f",String(pageNo),"-l",String(pageNo),"-r","110",
        "-png","-singlefile",dest,path.join(destDir,label)]);
      }
      fs.copyFileSync(dest,path.join(destDir,"album-demo-a4.pdf"));
      console.log("Created four actual A4 page screenshots in test-artifacts/travel-journal/");
    }
    const images=execFileSync("pdfimages",["-list",dest],{encoding:"utf8"}).split("\n");
    assert.ok(images.length>2,"A signed photo must be included in printed journal PDF");
    console.log("PASS personal journal "+width+"px "+pages+" A4 pages, header/footer each page, private photo, no identity/overflow");
   }finally{await page.close()}
  }
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
