"use strict";
// J'y étais — direction artistique « carnet », PR 1 (accueil).
// Captures avant/après avec un compte fictif (jamais de données réelles) et
// contrôles mesurables : en-tête plus bas, statistiques sans cartes, pays sans
// pastilles, carte plus présente, hors ligne discret, pas de débordement.
// Usage : node tests/travel-carnet-home.cjs [baseline-index.html | ref:<git-ref>]
// Avec ref:<git-ref>, la phase « avant » sert TOUS les fichiers /travel/ de ce commit.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {execFileSync}=require("node:child_process");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const dir=path.resolve("test-artifacts/carnet-home");
const WIDTHS=[320,360,390,430,1280];

async function measure(page){
 return page.evaluate(()=>{
  const q=s=>document.querySelector(s),cs=el=>getComputedStyle(el),r=el=>el.getBoundingClientRect();
  const hero=q("#travelHero"),map=q("#travelMapPanel .map");
  const stats=[...document.querySelectorAll("#travelHero .passportStat")];
  const chips=[...document.querySelectorAll("#countryList .countryChip")];
  const heavy=[...document.querySelectorAll("#travelHero *,#travelMapPanel h2,#homeActions *,#countryList *")]
   .filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&Number(cs(el).fontWeight)>600)
   .map(el=>el.id||String(el.className)||el.tagName);
  return {
   heroHeight:r(hero).height,empty:!!q("#app .w.emptyTravel"),heroBg:cs(hero).backgroundImage,heroShadow:cs(hero).boxShadow,
   heroRadius:cs(hero).borderBottomLeftRadius,
   statsTops:stats.map(el=>Math.round(r(el).top)),
   statBoxes:stats.map(el=>({bg:cs(el).backgroundColor,border:cs(el).borderTopWidth,radius:cs(el).borderTopLeftRadius})),
   settings:(()=>{const b=q("#openAccount");return {w:r(b).width,h:r(b).height,bg:cs(b).backgroundColor,border:cs(b).borderTopWidth}})(),
   mapHeight:map?r(map).height:0,
   mapGap:(()=>{const svg=map?.querySelector("svg"),vb=svg?.viewBox?.baseVal;if(!vb||!vb.width)return null;
    const box=r(map),drawn=Math.min(box.height,box.width*vb.height/vb.width);return Math.round(box.height-drawn)})(),
   flags:chips.map(el=>!!el.querySelector(".countryFlag")),
   chips:chips.map(el=>({border:cs(el).borderTopWidth,bg:cs(el).backgroundColor,h:r(el).height})),
   codeVisible:(()=>{const c=q("#passportResidenceCode");return !!c&&!c.hidden&&c.getClientRects().length>0})(),
   heavy,
   scroll:document.documentElement.scrollWidth,viewport:innerWidth
  };
 });
}

async function main(){
 await fs.mkdir(dir,{recursive:true});
 const arg=process.argv[2]||"",ref=arg.startsWith("ref:")?arg.slice(4):"";
 const baseline=ref?execFileSync("git",["show",ref+":travel/index.html"],{encoding:"utf8"}):arg?await fs.readFile(arg,"utf8"):null;
 const fromRef=pathname=>{try{return execFileSync("git",["show",ref+":travel/"+pathname.slice("/travel/".length)])}catch{return null}};
 const types={css:"text/css",js:"application/javascript",svg:"image/svg+xml",json:"application/json",woff2:"font/woff2",png:"image/png",webp:"image/webp",webmanifest:"application/manifest+json"};
 const server=serve();
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const report=[];
 try{
  for(const width of WIDTHS){
   const mobile=width<900,results={};
   for(const phase of baseline?["avant","apres"]:["apres"]){
    const ctx=await browser.newContext({viewport:{width,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:"block"});
    const page=await ctx.newPage(),errors=[],external=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.route("**/*",route=>{
     const url=new URL(route.request().url());
     if(url.hostname!=="127.0.0.1"){external.push(url.href);return route.abort()}
     if(url.pathname==="/travel/vendor/supabase.umd.js")
      return route.fulfill({status:200,contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"});
     if(phase==="avant"&&url.pathname==="/travel/")
      return route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:baseline});
     if(phase==="avant"&&ref&&url.pathname.startsWith("/travel/")&&url.pathname!=="/travel/config.js"){
      const body=fromRef(url.pathname),ext=url.pathname.split(".").pop();
      return body?route.fulfill({status:200,contentType:types[ext]||"application/octet-stream",body}):route.fulfill({status:404,body:""});
     }
     return route.continue();
    });
    try{
     await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load",timeout:30000});
     await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
     await page.evaluate(()=>document.fonts.ready);
     await page.waitForTimeout(250);
     results[phase]=await measure(page);
     await page.screenshot({path:path.join(dir,`${phase}-accueil-${width}.png`),animations:"disabled"});
     if(width===360||width===430){
      // Planisphère entier (cas d'un carnet sur plusieurs continents) : même réglage que fitMapToVisited.
      await page.evaluate(()=>{document.querySelector("#map svg").setAttribute("viewBox","0 0 1000 445");document.querySelector("#map").style.aspectRatio="1000 / 445"});
      results[phase+"World"]=await measure(page);
      await page.locator("#travelMapPanel").screenshot({path:path.join(dir,`${phase}-planisphere-${width}.png`),animations:"disabled"});
     }
     if(width===360){
      await page.evaluate(()=>{const b=document.querySelector("#offlineBanner");b.textContent="Hors ligne · voyages du 24 nov. 2026";b.hidden=false;scrollTo(0,0)});
      await page.screenshot({path:path.join(dir,`${phase}-hors-ligne-360.png`),animations:"disabled",clip:{x:0,y:0,width,height:420}});
     }
     assert.deepEqual(errors,[],"Erreurs JS "+phase+" "+width);
     assert.deepEqual(external,[],"Requête externe "+phase+" "+width);
    }finally{await ctx.close()}
   }
   const a=results.apres,b=results.avant;
   if(results.apresWorld)assert.ok(results.apresWorld.mapGap<=2,`Planisphère : ${results.apresWorld.mapGap}px de vide à ${width}px`);
   assert.ok(a.scroll<=a.viewport+1,`Débordement horizontal à ${width}px`);
   assert.equal(a.heroBg,"none","En-tête sans dégradé");
   assert.equal(a.heroShadow,"none","En-tête sans ombre");
   assert.equal(new Set(a.statsTops).size,1,"Statistiques sur une seule ligne à "+width);
   a.statBoxes.forEach(s=>{assert.equal(s.bg,"rgba(0, 0, 0, 0)");assert.equal(s.radius,"0px")});
   assert.equal(a.settings.bg,"rgba(0, 0, 0, 0)","Paramètres sans fond");
   assert.equal(a.settings.border,"0px","Paramètres sans bordure");
   assert.ok(a.settings.w>=44&&a.settings.h>=44,"Zone tactile 44 px conservée");
   assert.ok(a.chips.length>=2,"Le compte fictif affiche des pays");
   a.chips.forEach(c=>{assert.equal(c.border,"0px");assert.equal(c.bg,"rgba(0, 0, 0, 0)");assert.ok(c.h>=44,"Pays : 44 px tactiles")});
   assert.equal(a.codeVisible,true,"Code de résidence toujours visible");
   // Carnet : en-tête mesuré (l'original faisait 294 à 304 px). Depuis la direction
   // « atlas intime », une couverture (photo ou illustration) garde une bande visible
   // au-dessus de l'identité, réservée dès le premier affichage (pas de décalage quand
   // la photo privée arrive). Seul un carnet vide garde l'en-tête compact.
   const [lo,hi]=a.empty?[120,190]:mobile?[190,240]:[190,270];
   assert.ok(a.heroHeight>=lo&&a.heroHeight<=hi,`En-tête de ${Math.round(a.heroHeight)}px à ${width}px (attendu ${lo} à ${hi})`);
   assert.ok(a.mapGap!==null&&a.mapGap<=2,`Carte : ${a.mapGap}px de vide vertical à ${width}px`);
   assert.ok(a.flags.every(Boolean),"Chaque pays a son emplacement de drapeau");
   assert.deepEqual(a.heavy,[],"Aucune graisse au-delà de 600 sur l'accueil");
   if(b){
    const gain=1-a.heroHeight/b.heroHeight;

    report.push({width,heroAvant:Math.round(b.heroHeight),heroApres:Math.round(a.heroHeight),reduction:Math.round(gain*100)+" %",
     carteAvant:Math.round(b.mapHeight),videAvant:b.mapGap,carteApres:Math.round(a.mapHeight),videApres:a.mapGap,
     videPlanisphereAvant:results.avantWorld?.mapGap,videPlanisphereApres:results.apresWorld?.mapGap});
   }
   console.log("PASS accueil carnet "+width+" px");
  }
  if(report.length){
   console.table(report);
   await fs.writeFile(path.join(dir,"mesures.json"),JSON.stringify(report,null,1));
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
