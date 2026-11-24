"use strict";
// J'y étais — identité visuelle de l'accueil : en-tête avec couverture, carte,
// Mon carnet, barre « Mes voyages », cartes photographiques, bouton flottant.
// Comptes et photos FICTIFS (SVG de synthèse), aucune requête externe.
// Usage : node tests/travel-home-identity.cjs            → captures « apres » + vérifications
//         node tests/travel-home-identity.cjs ref:<git>  → captures « avant » d'une autre version
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const {serve}=require("./travel-day-excursions-mobile.cjs");
const FIX=require("./helpers/home-photo-fixture.cjs");

const refArg=process.argv.find(a=>a.startsWith("ref:"));
const avant=refArg?refArg.slice(4):null;
const label=avant?"avant":"apres";
const dir=path.resolve("test-artifacts/home-identity");
const SC=FIX.scenarios();

async function open(browser,port,name,{width,height=820,zoom=1,slow=false}){
 const sc=SC[name];
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:width<900,deviceScaleFactor:1,serviceWorkers:"block"});
 const page=await ctx.newPage(),errors=[],external=[];
 page.on("pageerror",e=>errors.push(e.message));
 if(slow){const cdp=await ctx.newCDPSession(page);await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:400,downloadThroughput:60*1024,uploadThroughput:30*1024})}
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="fixture.invalid"){
   const body=FIX.photoRoute(url);
   return body?route.fulfill({status:200,contentType:"image/svg+xml",body}):route.fulfill({status:404,body:""});
  }
  if(url.hostname!=="127.0.0.1"){external.push(url.href);return route.abort()}
  if(url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",body:FIX.vendor(sc)});
  if(avant&&url.pathname.startsWith("/travel/")&&url.pathname!=="/travel/config.js"){
   const file=url.pathname==="/travel/"?"index.html":url.pathname.slice(8);
   try{const body=execFileSync("git",["show",avant+":travel/"+file]);
    const ext=file.split(".").pop(),types={html:"text/html; charset=utf-8",css:"text/css",js:"application/javascript",svg:"image/svg+xml",json:"application/json",woff2:"font/woff2"};
    return route.fulfill({status:200,contentType:types[ext]||"application/octet-stream",body});
   }catch{return route.fulfill({status:404,body:""})}
  }
  return route.continue();
 });
 await page.goto(`http://127.0.0.1:${port}/travel/`,{waitUntil:"load",timeout:90000});
 if(zoom!==1)await page.addStyleTag({content:`html{zoom:${zoom}}`});
 await page.waitForFunction(n=>document.querySelector("#dashboardTitle")?.textContent===n,sc.name,{timeout:90000});
 if(sc.rows.length)await page.waitForFunction(()=>document.querySelector("#map svg path[data-country]"),null,{timeout:90000});
 await page.evaluate(()=>document.fonts.ready);
 // Les couvertures privées se chargent à l'approche de l'écran : on parcourt la page.
 await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0)});
 await page.waitForTimeout(700);
 return {ctx,page,errors,external};
}

// Mesures objectives, prises dans la page réelle.
const measure=page=>page.evaluate(()=>{
 const q=s=>document.querySelector(s),r=el=>el?.getBoundingClientRect();
 const vis=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=="hidden";
 const hero=q("#travelHero"),cover=q("#profileCoverImage");
 const toolbar=q("#tripListToolbar");
 const tools=[...document.querySelectorAll("#tripListToolbar .tripTool")].filter(vis).map(b=>{const x=r(b);return {w:Math.round(x.width),h:Math.round(x.height)}});
 const cards=[...document.querySelectorAll("#trips .journeyTrip")].filter(vis);
 const card=cards[0],cs=card&&getComputedStyle(card.querySelector(".journeyMedia")||card);
 // Débordement réel : html{overflow-x:clip} masque scrollWidth, on mesure les boîtes.
 const widest=Math.max(...[...document.querySelectorAll("#app *")].filter(vis).map(el=>Math.ceil(r(el).right)));
 return {
  scrollW:Math.max(document.documentElement.scrollWidth,widest),vw:innerWidth,
  heroH:Math.round(r(hero)?.height||0),heroBg:getComputedStyle(hero).backgroundColor,
  coverSource:q("#profileCover")?.dataset.source||"",coverShown:vis(cover)&&!cover.hidden,
  coverOpacity:cover?getComputedStyle(cover).opacity:"",
  toolbarH:Math.round(r(toolbar)?.height||0),toolbarBg:toolbar?getComputedStyle(toolbar).backgroundColor:"",
  toolbarShadow:toolbar?getComputedStyle(toolbar).boxShadow:"",
  summaryShown:vis(q("#tripListSummary")),tools,
  cardRadius:cs?.borderRadius||"",cardShadow:card?getComputedStyle(card).boxShadow:"",
  cards:cards.length,
  journalTitle:q("#printJournal .tileTitle")?.textContent||""
 };
});

async function shots(page,name,width){
 const base=path.join(dir,`${label}-${name}-${width}`);
 await page.screenshot({path:base+".png",fullPage:true,animations:"disabled"});
 await page.screenshot({path:base+"-ecran.png",animations:"disabled"});
}

// Contraste réel : on cache le texte, on photographie ce qu'il y a derrière, et on
// compare la couleur du texte au pixel le plus clair (99e centile) de sa zone.
async function backdropContrast(page,boxesSelector,textColorRgb){
 const boxes=await page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length)
  .map(e=>{const r=e.getBoundingClientRect();return {sel:e.id||e.className,x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,
   color:getComputedStyle(e).color}}),boxesSelector);
 await page.addStyleTag({content:`${boxesSelector}{color:transparent!important}${boxesSelector} *{visibility:hidden!important}`});
 await page.waitForTimeout(80);
 const out=[];
 for(const b of boxes){
  if(b.w<2||b.h<2)continue;
  const png=await page.screenshot({clip:{x:b.x,y:b.y,width:b.w,height:b.h},fullPage:true,animations:"disabled"});
  const lums=await page.evaluate(async b64=>{
   const img=new Image();img.src="data:image/png;base64,"+b64;await img.decode();
   const c=document.createElement("canvas");c.width=img.width;c.height=img.height;const x=c.getContext("2d");x.drawImage(img,0,0);
   const d=x.getImageData(0,0,c.width,c.height).data,L=[];
   const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};
   for(let i=0;i<d.length;i+=4)L.push(.2126*lin(d[i])+.7152*lin(d[i+1])+.0722*lin(d[i+2]));
   L.sort((a,b)=>a-b);return L[Math.floor(L.length*.99)];
  },png.toString("base64"));
  const m=b.color.match(/\d+(\.\d+)?/g).map(Number),lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};
  const lt=.2126*lin(m[0])+.7152*lin(m[1])+.0722*lin(m[2]);
  out.push({zone:String(b.sel).slice(0,24),ratio:Math.round(((Math.max(lt,lums)+.05)/(Math.min(lt,lums)+.05))*100)/100});
 }
 return out;
}

async function main(){
 await fs.mkdir(dir,{recursive:true});
 const server=serve();await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const rows=[];
 try{
  const plan=[
   ...[320,360,375,390,430,768,1024,1440].map(w=>["photos",w]),
   ...["couverture-claire","couverture-sombre","couverture-chargee","sans-photo","nom-long","cent-voyages","vide"].map(n=>[n,360])
  ];
  for(const [name,width] of plan){
   const {ctx,page,errors,external}=await open(browser,port,name,{width});
   try{
    await shots(page,name,width);
    const m=await measure(page);
    rows.push({cas:`${name}-${width}`,...m,tools:m.tools.map(t=>t.w+"×"+t.h).join(" "),errors:errors.length,external:external.length});
    // Défilement : barre collante et bouton flottant au-dessus des cartes.
    if(name==="photos"&&[360,390].includes(width)){
     await page.locator("#trips .journeyTrip").first().scrollIntoViewIfNeeded();
     await page.evaluate(()=>scrollBy(0,-60));await page.waitForTimeout(400);
     await page.screenshot({path:path.join(dir,`${label}-${name}-${width}-defilement.png`),animations:"disabled"});
    }
   }finally{await ctx.close()}
  }
  // Texte agrandi et connexion lente.
  for(const [name,opts,tag] of [["photos",{width:360,zoom:1.3},"texte-130"],["photos",{width:360,slow:true},"connexion-lente"]]){
   const {ctx,page}=await open(browser,port,name,opts);
   try{await shots(page,name,`360-${tag}`);rows.push({cas:`${name}-360-${tag}`,...await measure(page)})}finally{await ctx.close()}
  }
  if(!avant){
   // 1. Contraste du texte sur les couvertures (en-tête) et sur les photos (cartes).
   const contrast=[];
   for(const name of ["photos","couverture-claire","couverture-sombre","couverture-chargee","sans-photo"]){
    const {ctx,page}=await open(browser,port,name,{width:360});
    try{
     for(const c of await backdropContrast(page,"#travelHero #dashboardTitle,#travelHero #travelerLocationText,#travelHero .passportNumber,#travelHero .passportLabel"))contrast.push({cas:name,...c});
     await page.reload();await page.waitForFunction(n=>document.querySelector("#dashboardTitle")?.textContent===n,SC[name].name);
     await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0)});
     await page.waitForTimeout(600);
     for(const c of await backdropContrast(page,"#trips .journeyCountry,#trips .journeyFooter,#trips .journeyCities,#trips .journeyOpenLabel"))contrast.push({cas:name+" (cartes)",...c});
    }finally{await ctx.close()}
   }
   await fs.writeFile(path.join(dir,"contrastes.json"),JSON.stringify(contrast,null,1));
   const worst=contrast.reduce((m,c)=>c.ratio<m.ratio?c:m,{ratio:99});
   console.log("Contraste minimal du texte sur image :",worst);
   assert.ok(worst.ratio>=4.5,"Texte sur photo : au moins 4,5:1 partout ("+JSON.stringify(worst)+")");
   await fs.writeFile(path.join(dir,"contrastes.json"),JSON.stringify(contrast,null,1));

   // 2. Débordement horizontal, zones tactiles, état de chargement de Mon carnet, filtre actif, bouton flottant.
   for(const r of rows.filter(r=>!/texte-130/.test(r.cas)))assert.ok(r.scrollW-r.vw<=0,"Aucun débordement horizontal : "+r.cas+" ("+(r.scrollW-r.vw)+" px)");
   const {ctx,page}=await open(browser,port,"photos",{width:360});
   try{
    const touch=await page.evaluate(()=>["#openAccount","#add","#printJournal","#pdf","#countryListToggle","#tripListMap","#tripListFilter","#tripListSort"]
     .map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,Math.round(r.width),Math.round(r.height)]}));
    for(const [s,w,h] of touch)assert.ok(w>=48&&h>=48||s==="#countryListToggle"&&h>=48,"Zone tactile 48 px : "+s+" "+w+"×"+h);
    assert.equal(await page.locator("#mapArcNote summary").isVisible(),true,"L’information sur les arcs est accessible");
    assert.equal(await page.locator("#mapArcNote p").isVisible(),false,"La note ne surcharge pas la carte au repos");
    await page.locator("#mapArcNote summary").click();
    assert.equal(await page.locator("#mapArcNote p").isVisible(),true,"Explication affichée à la demande");
    await page.locator("#mapArcNote summary").click();
    assert.equal(await page.locator("#mapArcNote p").isVisible(),false);
    const labels=await page.evaluate(()=>[...document.querySelectorAll("#trips .journeyMedia")].map(m=>{
     const img=m.querySelector(".journeyBackdrop"),label=getComputedStyle(m,"::before").content;
     return {prive:img?.dataset.isPrivate==="true",illustration:label==='"Illustration"'};
    }));
    assert.ok(labels.every(l=>!(l.prive&&l.illustration)),"Une photo personnelle n'est jamais marquée « Illustration »");
    assert.ok(labels.some(l=>l.illustration),"Une illustration de pays est signalée");
    // Mon carnet : le titre ne disparaît jamais, la hauteur ne bouge pas.
    const before=await page.locator("#printJournal").boundingBox();
    await page.evaluate(()=>{window.open=()=>({closed:false,opener:null,document:{write(){},close(){},body:{textContent:"",replaceChildren(){},append(){}}},location:{},focus(){}});
     window.__holdProfiles=true;});
    await page.locator("#printJournal").click();
    const during=await page.evaluate(()=>({t:document.querySelector("#printJournal .tileTitle").textContent,s:document.querySelector("#printJournal .tileSubtitle").textContent,busy:document.querySelector("#printJournal").getAttribute("aria-busy"),h:document.querySelector("#printJournal").getBoundingClientRect().height}));
    assert.equal(during.t,"Mon carnet","Le titre Mon carnet reste affiché pendant la préparation");
    assert.ok(Math.abs(during.h-before.height)<1,"Mon carnet ne change pas de hauteur");
    console.log("Mon carnet pendant la préparation :",during);
    // Filtre actif : point doré + ligne de résumé.
    await page.locator('#countryList .countryChip[data-country="FR"]').click();
    const filt=await page.evaluate(()=>({cls:document.querySelector("#tripListToolbar").className,
     summary:getComputedStyle(document.querySelector("#tripListSummary")).display,
     dot:getComputedStyle(document.querySelector("#tripListFilter"),"::after").content}));
    assert.match(filt.cls,/isFiltered/);assert.equal(filt.summary,"block");assert.equal(filt.dot,'""');
    await page.screenshot({path:path.join(dir,"apres-filtre-actif-360.png"),fullPage:false,animations:"disabled"});
    await page.locator('#countryList .countryChip[data-country="FR"]').click();
    // Bouton flottant : jamais sur les étiquettes des cartes, à plusieurs positions de défilement.
    // Balayage serré (tous les 20 px) : un échantillon de quelques positions laisse passer des recouvrements.
    const pageH=await page.evaluate(()=>document.body.scrollHeight);
    for(let y=0;y<pageH;y+=20){
     await page.evaluate(v=>scrollTo(0,v),y);await page.waitForTimeout(30);
     const hit=await page.evaluate(()=>{const f=document.querySelector("#addFloating");if(f.hidden)return null;const a=f.getBoundingClientRect();
      return [...document.querySelectorAll("#trips .journeyFlagLine,#trips .journeyPhotoCount,#trips .journeyStatus")].filter(e=>{const b=e.getBoundingClientRect();
       return !(b.right<a.left||b.left>a.right||b.bottom<a.top||b.top>a.bottom)}).map(e=>e.className)});
     assert.deepEqual(hit||[],[],"Le bouton flottant ne masque aucune étiquette à "+y+" px");
    }
   }finally{await ctx.close()}
  }
 }finally{await browser.close();server.close()}
 console.table(rows.map(({cas,heroH,coverSource,coverOpacity,toolbarH,summaryShown,tools,cardRadius,scrollW,vw,errors})=>({cas,heroH,coverSource,coverOpacity,toolbarH,summaryShown,tools,cardRadius,overflow:scrollW-vw,errors})));
 await fs.writeFile(path.join(dir,`${label}-mesures.json`),JSON.stringify(rows,null,1));
 return rows;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={open,measure,SC};
