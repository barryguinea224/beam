"use strict";
// Actual A4 scenario from review: newest GN (Labé) without a photo;
// older SN (Dakar) with one favorite. Expected five substantive pages.
// All names/URLs are fictional and none are user records.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const photoUrl="https://private-photo.example.test/dakar-favorite.webp?token=fictional";
const webp=Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==","base64");
const world=fs.readFileSync("travel/assets/world-map.svg","utf8");
const resultDir=path.resolve("test-artifacts/travel-album-retouches");
const NOTICE="Document personnel, non destiné aux démarches administratives";
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [360,390]){
   const page=await browser.newPage({viewport:{width,height:780},isMobile:true,hasTouch:true});
   await page.route("https://private-photo.example.test/**",route=>route.fulfill({
    status:200,contentType:"image/webp",body:webp,headers:{"cache-control":"no-store"}
   }));
   await page.route("http://127.0.0.1/travel/assets/flags/**",async route=>{
    const file=route.request().url().match(/\/([a-z]{2})\.svg$/)?.[1];
    if(!file)return route.fulfill({status:404,body:""});
    const full=path.resolve("travel/assets/flags",file+".svg");
    try{return route.fulfill({status:200,contentType:"image/svg+xml",body:fs.readFileSync(full)})}
    catch{return route.fulfill({status:404,body:""})}
   });
   try{
    await page.setContent('<!doctype html><html lang="fr"><head><base href="http://127.0.0.1/travel/"></head><body></body></html>');
    for(const script of ["countries.js","dashboard-filters.js","printable-journal.js"])
     await page.addScriptTag({path:path.resolve("travel",script)});
    await page.evaluate(({url,world})=>{
     const lab={id:"fic-gn",country_code:"GN",cities:["Labé"],entry_date:"2026-08-05",
      exit_date:"2026-08-07",duration_days:3,purpose:"famille",is_domestic:true,
      note:"Un court souvenir des hauteurs du Fouta."};
     const dakar={id:"fic-sn",country_code:"SN",cities:["Dakar"],entry_date:"2026-01-05",
      exit_date:"2026-01-05",duration_days:1,purpose:"tourisme",is_domestic:false,
      note:"Le soleil sur Dakar. Un souvenir que je garderai longtemps."};
     BEAM_PERSONAL_JOURNAL.render(document,{
      name:"Elhadj Barry",filters:{},mapSvgText:world,generatedAt:new Date("2026-10-31T12:00:00Z"),
      trips:[
       {trip:lab,activities:[{title:"Promenade",place:"Labé",happened_on:"2026-08-06"}],photos:[]},
       {trip:dakar,activities:[{title:"Plage",place:"Dakar",happened_on:"2026-01-05"}],
        photos:[url],favoritePhoto:url}
      ]
     });
    },{url:photoUrl,world});
    await page.waitForFunction(()=>!document.querySelector(".print-button").disabled,{timeout:15000});
    const audit=await page.evaluate(()=>({
     coverPhoto:document.querySelector(".cover-art img")?.src,
     title:document.querySelector(".cover h1")?.textContent,
     path:document.querySelector(".atlas svg")?.getAttribute("viewBox"),
     mapCountries:[...document.querySelectorAll(".atlas-visited")].map(p=>p.dataset.country),
     compact:document.querySelectorAll(".trip-compact").length,
     spread:document.querySelectorAll(".trip-spread").length,
     inline:document.querySelectorAll(".trip-story-inline").length,
     noPhotoRibbon:document.querySelector(".trip-compact .photo-placeholder")?.getBoundingClientRect().height,
     summaries:[...document.querySelectorAll(".metric")].map(x=>x.textContent),
     timeline:[...document.querySelectorAll(".timeline-row")].map(x=>x.textContent),
     flags:document.querySelectorAll(".timeline-row .album-flag").length,
     width:document.documentElement.scrollWidth,viewport:innerWidth,
     noticeTop:document.querySelector(".screen-head")?.textContent,
     noticeBottom:document.querySelector(".screen-foot")?.textContent,
     pageTitle:document.title,
     hasBrand:document.body.textContent.includes("BEAM")
    }));
    assert.equal(audit.coverPhoto,photoUrl,"cover must use Dakar favorite although newest Labé has no photo");
    assert.equal(audit.title,"Carnet d'Elhadj Barry");
    assert.equal(audit.compact,2);
    assert.equal(audit.spread,0);
    assert.equal(audit.inline,2);
    assert.ok(audit.noPhotoRibbon>80&&audit.noPhotoRibbon<180,"empty photo ribbon must be near 35mm");
    assert.deepEqual(audit.mapCountries.sort(),["GN","SN"]);
    const [x,y,w,h]=(audit.path||"").split(/\s+/).map(Number);
    assert.ok([x,y,w,h].every(Number.isFinite)&&w<600&&h<280,
     "visited-country zoom must be much tighter than world map: "+audit.path);
    assert.deepEqual(audit.summaries,["1voyage à l’étranger","1pays à l’étranger","1jour à l’étranger"]);
    assert.equal(audit.flags,2);
    assert.ok(audit.timeline[0].includes("Labé")&&audit.timeline[0].includes("3 jours"));
    assert.ok(audit.timeline[1].includes("Dakar")&&audit.timeline[1].includes("1 jour"));
    assert.ok(audit.width<=width+1,"no horizontal overflow at "+width+"px");
    assert.equal(audit.noticeTop,NOTICE);assert.equal(audit.noticeBottom,NOTICE);
    assert.equal(audit.pageTitle,"Mon carnet de voyage");
    assert.equal(audit.hasBrand,false,"client journal must not contain brand");
    const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
    fs.mkdirSync(resultDir,{recursive:true});
    const file=path.join(resultDir,"album-retouches-"+width+".pdf");
    fs.writeFileSync(file,pdf);
    const pdfInfo=execFileSync("pdfinfo",[file],{encoding:"utf8"});
    assert.match(pdfInfo,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
    const pages=Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.equal(pages,5,"two short trips must fit five A4 pages (cover, yearbook, 2 trips, closing)");
    const texts=[];
    for(let i=1;i<=pages;i++){
     const text=execFileSync("pdftotext",["-f",String(i),"-l",String(i),"-layout",file,"-"],{encoding:"utf8"});
     assert.ok(text.includes(NOTICE),"missing legal notice on page "+i);
     assert.ok(!text.includes("BEAM"),"brand leaked on journal page "+i);
     texts.push(text);
    }
    assert.match(texts[0],/Carnet d'Elhadj/);
    assert.match(texts[1],/Mon année en voyages/);
    assert.match(texts[2],/Labé/);
    assert.match(texts[2],/Un court souvenir/,"Labé story must share its photo-free page");
    assert.match(texts[3],/Dakar/);
    assert.match(texts[3],/Le soleil sur Dakar/,"Dakar story must share its one-photo page");
    assert.match(texts[4],/Chaque voyage laisse une histoire/);
    for(let i=2;i<=3;i++)assert.ok(texts[i].length>170,"content page must not be nearly blank: "+(i+1));
    if(width===360){
     const samples=[["01-couverture",1],["02-synthese",2],["03-labe-sans-photo",3],
      ["04-dakar-avec-photo",4],["05-cloture",5]];
     for(const [name,n] of samples)
      execFileSync("pdftoppm",["-f",String(n),"-l",String(n),"-r","120","-png",
       "-singlefile",file,path.join(resultDir,name)]);
    }
    console.log("PASS "+width+"px compact album: 5 A4 pages, zoom, older favorite cover, grammar, timeline");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
