"use strict";
// Headless Android-sized real map SVG + actual dashboard handler. Synthetic stays only.
const fs=require("node:fs"),assert=require("node:assert/strict"),path=require("node:path");
const {chromium}=require("playwright");
const app=fs.readFileSync("travel/index.html","utf8");
const inline=app.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline,"Actual dashboard script available");
const first=inline.indexOf("let mapReady=false"),last=inline.indexOf("function renderFilterOptions()",first);
assert.ok(first>=0&&last>first,"Exercise actual map code, not a mocked renderer");
const logic=inline.slice(first,last);
const mapSvg=fs.readFileSync("travel/assets/world-map.svg","utf8");
const centroids=JSON.parse(fs.readFileSync("travel/assets/world-centroids.json","utf8"));
const filtersJs=fs.readFileSync("travel/dashboard-filters.js","utf8");
const flightsJs=fs.readFileSync("travel/flight-connections.js","utf8");
const css=fs.readFileSync("travel/flight-connections.css","utf8");
const html=app.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
const journeys=[
 {id:"trip-canada",country_code:"CA",entry_date:"2026-04-10",purpose:"tourisme",is_domestic:false},
 {id:"trip-japan",country_code:"JP",entry_date:"2025-09-17",purpose:"affaires",is_domestic:false},
 {id:"trip-senegal",country_code:"SN",entry_date:"2026-10-08",purpose:"famille",is_domestic:false},
 {id:"trip-guinea",country_code:"GN",entry_date:"2026-10-18",purpose:"famille",is_domestic:true}
];
async function run(){
 fs.mkdirSync("test-artifacts/flight-connections",{recursive:true});
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:760},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   try{
    await page.setContent(html,{waitUntil:"domcontentloaded"});
    await page.addStyleTag({content:css});
    await page.addScriptTag({content:filtersJs});
    await page.addScriptTag({content:flightsJs});
    await page.evaluate(({mapSvg,centroids,journeys})=>{
     document.querySelector("#app").classList.remove("hidden");
     window.__journeys=journeys;
     window.fetch=async url=>{
      if(String(url).includes("world-map.svg"))return {ok:true,text:async()=>mapSvg};
      if(String(url).includes("world-centroids.json"))return {ok:true,json:async()=>centroids};
      throw Error("Unexpected request by offline fictitious test");
     };
    },{mapSvg,centroids,journeys});
    const setup=[
     'const $=selector=>document.querySelector(selector);',
     'const profile={country_of_residence:"GN"};',
     'const trips=window.__journeys;',
     'let dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({});',
     'let accountState="active";',
     'const countryName=code=>({GN:"Guinée",CA:"Canada",JP:"Japon",SN:"Sénégal"}[code]||code);',
     'function render(){applyMapState()}',
     logic
    ].join("\n");
    await page.addScriptTag({content:setup});
    await page.evaluate(()=>loadMap());
    await page.waitForFunction(()=>document.querySelectorAll("#map .flightArc").length===3);
    const initial=await page.evaluate(()=>{
     const map=document.querySelector("#map");
     const panel=document.querySelector("#travelMapPanel");
     const arcs=[...document.querySelectorAll("#map .flightArc")];
     const bounds=panel.getBoundingClientRect(),svg=map.querySelector("svg");
     return {arcCount:arcs.length,svgCount:map.querySelectorAll("svg").length,
      home:svg.querySelectorAll(".flightResidence").length,halo:svg.querySelectorAll(".flightHomeHalo").length,
      dots:svg.querySelectorAll(".flightDestination").length,
      pointer:arcs.map(p=>getComputedStyle(p).pointerEvents),
      movement:arcs.map(p=>parseFloat(getComputedStyle(p).animationDuration)*1000+
          parseFloat(getComputedStyle(p).animationDelay)*1000),
      overflow:document.documentElement.scrollWidth-innerWidth,
      panelOverflow:panel.scrollWidth-panel.clientWidth,
      panelLeft:bounds.left,panelRight:bounds.right,
      viewBox:svg.getAttribute("viewBox")};
    });
    assert.equal(initial.arcCount,3);assert.equal(initial.svgCount,1);
    assert.equal(initial.home,1);assert.equal(initial.halo,1);assert.equal(initial.dots,3);
    assert.ok(initial.pointer.every(v=>v==="none"),"Arc must not steal country taps");
    assert.ok(Math.max(...initial.movement)<=1500,"Animated sequence <=1.5s");
    assert.ok(initial.overflow<=1&&initial.panelOverflow<=1,"Map must fit width "+width+": "+JSON.stringify(initial));
    assert.ok(initial.panelLeft>=-1&&initial.panelRight<=width+1,"Map panel must fit phone");
    await page.evaluate(()=>{
     dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({year:"2026"});applyMapState();
    });
    assert.equal(await page.locator("#map .flightArc").count(),2,"Year filtered arcs");
    await page.evaluate(()=>{
     dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({purpose:"affaires"});applyMapState();
    });
    assert.equal(await page.locator("#map .flightArc").count(),1,"Purpose filtered arcs");
    await page.evaluate(()=>{
     dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({country:"SN"});applyMapState();
    });
    assert.equal(await page.locator("#map .flightArc").count(),1,"Country filtered arcs");
    await page.evaluate(()=>{
     dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({scope:"domestic"});applyMapState();
    });
    assert.equal(await page.locator("#map .flightArc").count(),0,"Domestic Guinea stay has no line");
    await page.evaluate(()=>{
     dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({});profile.country_of_residence=null;applyMapState();
    });
    assert.equal(await page.locator("#map .flightArc").count(),0,"No residence -> unchanged map");
    await page.evaluate(()=>{profile.country_of_residence="GN";flightIntroDone=false;});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.evaluate(()=>applyMapState());
    assert.equal(await page.locator("#map .flightMotion").count(),0,"Reduced motion has no animated paths");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.evaluate(()=>{flightIntroDone=true;applyMapState()});
    // The map country selection remains functional despite the overlay.
    await page.locator('#map-SN').click({force:true});
    assert.equal(await page.locator("#map .flightArc").count(),1,"Map country selection still filters");
    await page.evaluate(()=>{dashboardFilters=window.BEAM_DASHBOARD_FILTERS.normalize({});applyMapState()});
    await page.locator("#travelMapPanel").screenshot({
     path:path.join("test-artifacts/flight-connections","carte-"+width+".png"),
     animations:"disabled"
    });
    console.log("PASS Android "+width+"px — GN→CA/JP/SN, GN domestic skipped, filtered trips and accessible country taps");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
run().catch(err=>{console.error(err);process.exitCode=1});
