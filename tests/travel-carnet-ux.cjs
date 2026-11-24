"use strict";
// J'y étais — robustesse de l'accueil « carnet » (ordre d'usage, carte entière,
// aperçu de 4 pays, noms longs) avec des comptes FICTIFS de 0 à 100 pays.
// Usage : node tests/travel-carnet-ux.cjs [ref:<git-ref> pour les captures « avant »]
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const COUNTRIES=require("../travel/countries.js");
const LIFE=require("../travel/trip-lifecycle.js");
const dir=path.resolve("test-artifacts/carnet-ux");

// Le compteur d'un pays = nombre de voyages passés par ce pays (destination ou étape), une fois par voyage.
const multi={country_code:"FR",entry_date:"2025-03-01",exit_date:"2025-03-10",
 stops:[{country_code:"DE",entry_date:"2025-03-04"},{country_code:"FR",entry_date:"2025-03-07"}]};
assert.deepEqual(LIFE.visitedCodes(multi,"2025-12-01").sort(),["DE","FR"],"Un voyage multi-étapes compte chaque pays une fois");

const LONG=["VC","CD","BA","CF","GS","UM","HM","PM"];
const pool=["FR","SN","MA","CI","US","CA","JP","DE",...Object.keys(COUNTRIES.NAMES).filter(c=>!["FR","SN","MA","CI","US","CA","JP","DE","AQ"].includes(c))];
function trips(codes){
 return codes.map((code,i)=>{
  const day=String(1+(i%27)).padStart(2,"0"),year=2010+Math.floor(i/12),month=String(1+(i%12)).padStart(2,"0");
  return {id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,"0")}`,country_code:code,cities:["Ville fictive"],
   entry_date:`${year}-${month}-${day}`,exit_date:`${year}-${month}-${day}`,duration_days:1,
   purpose:"tourisme",is_domestic:false,deleting:false,note:null};
 });
}
const SCENARIOS={
 vide:{rows:[]},
 "1-pays":{rows:trips(["FR"])},
 "8-pays":{rows:trips(["FR","FR","FR","DE","DE","CA","JP","SN","MA","US","CI"])},
 "25-pays":{rows:trips(pool.slice(0,25))},
 "100-pays":{rows:trips(pool.slice(0,100))},
 "noms-longs":{rows:trips(LONG),name:"Elhadj Mamadou Alpha Oumar Diallo Barry de Kankan-Conakry"}
};

function vendor(sc){
 const src=fictionalSupabase.toString()
  .replace("const rows=[original,upcoming]","const rows=window.__carnetRows||[original,upcoming]")
  .replace('display_name:"Voyageuse Fictive"','display_name:window.__carnetName||"Voyageuse Fictive"');
 assert.ok(src.includes("window.__carnetRows")&&src.includes("window.__carnetName"),"Fixture injectable");
 return `window.__carnetRows=${JSON.stringify(sc.rows)};window.__carnetName=${JSON.stringify(sc.name||"Voyageuse Fictive")};(${src})();`;
}

async function open(browser,port,sc,{width,zoom=1,slow=false,avant=null}){
 const ctx=await browser.newContext({viewport:{width,height:820},isMobile:width<900,hasTouch:width<900,deviceScaleFactor:1,serviceWorkers:"block"});
 const page=await ctx.newPage(),errors=[],external=[];
 page.on("pageerror",e=>errors.push(e.message));
 if(slow){const cdp=await ctx.newCDPSession(page);await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:400,downloadThroughput:60*1024,uploadThroughput:30*1024})}
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=="127.0.0.1"){external.push(url.href);return route.abort()}
  if(url.pathname==="/travel/vendor/supabase.umd.js")return route.fulfill({status:200,contentType:"application/javascript",body:vendor(sc)});
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
 const name=sc.name||"Voyageuse Fictive";
 await page.waitForFunction(n=>document.querySelector("#dashboardTitle")?.textContent===n,name,{timeout:90000});
 if(sc.rows.length)await page.waitForFunction(()=>document.querySelector("#map svg path[data-country]"),null,{timeout:90000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 return {ctx,page,errors,external};
}

const snapshot=page=>page.evaluate(()=>{
 const q=s=>document.querySelector(s),r=el=>el.getBoundingClientRect(),vis=el=>!!el&&el.getClientRects().length>0;
 const map=q("#map"),svg=q("#map svg"),vb=svg?.viewBox?.baseVal;
 const chips=[...document.querySelectorAll("#countryList .countryChip")];
 const shown=chips.filter(vis);
 const top=s=>vis(q(s))?Math.round(r(q(s)).top+scrollY):null;
 return {
  overflow:document.documentElement.scrollWidth-innerWidth,
  order:["#travelHero","#travelMapPanel","#add","#printJournal","#homeCountries","#pdf"].map(top),
  countriesVisible:vis(q("#homeCountries")),total:chips.length,shown:shown.length,
  toggle:vis(q("#countryListToggle"))?q("#countryListToggle").textContent:null,
  truncated:shown.filter(c=>{const n=c.querySelector(".countryName");return n.scrollWidth>n.clientWidth+1||getComputedStyle(n).textOverflow==="ellipsis"}).map(c=>c.textContent),
  flags:[...new Set(shown.map(c=>{const f=c.querySelector(".countryFlag");return Math.round(r(f).width)+"x"+Math.round(r(f).height)}))],
  chipMin:shown.length?Math.min(...shown.map(c=>r(c).height)):null,
  counters:shown.map(c=>c.querySelector("b").textContent),
  map:vb?{x:vb.x,w:vb.width,gap:Math.round(r(map).height-r(map).width*vb.height/vb.width)}:null,
  settings:(()=>{const b=q("#openAccount"),x=r(b);return [Math.round(x.width),Math.round(x.height)]})(),
  title:(()=>{const t=q("#dashboardTitle");return {lines:Math.round(r(t).height/parseFloat(getComputedStyle(t).lineHeight)),fits:r(t).right<=innerWidth}})()
 };
});

async function main(){
 await fs.mkdir(dir,{recursive:true});
 const ref=(process.argv[2]||"").startsWith("ref:")?process.argv[2].slice(4):"";
 const server=serve();await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const table=[];
 try{
  const runs=[];
  for(const [name,sc] of Object.entries(SCENARIOS))for(const width of [320,360,390,430])runs.push({name,sc,width});
  runs.push({name:"8-pays",sc:SCENARIOS["8-pays"],width:1280});
  runs.push({name:"8-pays",sc:SCENARIOS["8-pays"],width:360,zoom:1.3,label:"texte-130"});
  runs.push({name:"noms-longs",sc:SCENARIOS["noms-longs"],width:320,zoom:1.3,label:"texte-130"});
  runs.push({name:"8-pays",sc:SCENARIOS["8-pays"],width:360,slow:true,label:"connexion-lente"});
  for(const run of runs){
   const tag=`${run.name}-${run.width}${run.label?"-"+run.label:""}`;
   const {ctx,page,errors,external}=await open(browser,port,run.sc,run);
   try{
    const s=await snapshot(page);
    assert.ok(s.overflow<=1,`${tag} : débordement horizontal ${s.overflow}px`);
    assert.ok(s.settings[0]>=44&&s.settings[1]>=44,`${tag} : zone tactile Paramètres`);
    assert.ok(s.title.fits,`${tag} : nom du profil hors écran`);
    if(run.sc.rows.length){
     const o=s.order;
     assert.ok(o.every(v=>v!==null),`${tag} : bloc manquant ${JSON.stringify(o)}`);
     assert.ok(o.every((v,i)=>!i||v>o[i-1]),`${tag} : ordre profil → carte → ajouter → carnet → pays → PDF ${JSON.stringify(o)}`);
     assert.equal(s.map.x,0,`${tag} : carte tronquée à gauche`);assert.equal(s.map.w,1000,`${tag} : planisphère entier`);
     assert.ok(Math.abs(s.map.gap)<=2,`${tag} : ${s.map.gap}px de vide autour de la carte`);
     assert.ok(s.shown<=4,`${tag} : ${s.shown} pays dans l'aperçu`);
     assert.equal(!!s.toggle,s.total>4,`${tag} : lien « Voir les pays »`);
     assert.deepEqual(s.truncated,[],`${tag} : noms de pays tronqués`);
     assert.deepEqual(s.flags,[`${Math.round(24*(run.zoom||1))}x${Math.round(18*(run.zoom||1))}`],`${tag} : drapeaux harmonisés`);
     assert.ok(s.chipMin>=44*(run.zoom||1)-1,`${tag} : pays à moins de 44 px`);
     assert.ok(s.counters.every(c=>/^\d+ voyages?$|^À venir/.test(c)),`${tag} : compteur explicite ${s.counters}`);
     if(s.toggle){
      assert.equal(s.toggle,`Voir les ${s.total} pays`);
      await page.locator("#countryListToggle").click();
      const open=await snapshot(page);
      assert.equal(open.shown,open.total,`${tag} : liste complète après « Voir »`);
      assert.deepEqual(open.truncated,[],`${tag} : noms tronqués dans la liste complète`);
      assert.ok(open.overflow<=1,`${tag} : débordement liste complète`);
      if(run.width===360&&!run.label)await page.locator("#homeCountries").screenshot({path:path.join(dir,`apres-${run.name}-liste-complete-360.png`)});
      await page.locator("#countryListToggle").click();
      assert.ok((await snapshot(page)).shown<=4,`${tag} : repli`);
     }
    }else{
     assert.equal(s.countriesVisible,false,`${tag} : pas de section pays sans voyage`);
    }
    assert.deepEqual(errors,[],`${tag} : erreurs JS`);assert.deepEqual(external,[],`${tag} : requête externe`);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(dir,`apres-${tag}.png`),fullPage:run.width<900&&!run.label});
    table.push({cas:tag,pays:s.total,apercu:s.shown,lien:s.toggle||"—",vide_carte:s.map?.gap??"—",ordre:"ok"});
    console.log("PASS "+tag);
   }finally{await ctx.close()}
  }
  if(ref){
   for(const name of ["8-pays","noms-longs","vide"]){
    const {ctx,page}=await open(browser,port,SCENARIOS[name],{width:360,avant:ref});
    try{await page.screenshot({path:path.join(dir,`avant-${name}-360.png`),fullPage:true})}finally{await ctx.close()}
   }
  }
  console.table(table);
  await fs.writeFile(path.join(dir,"resultats.json"),JSON.stringify(table,null,1));
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
