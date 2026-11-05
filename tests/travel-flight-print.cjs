"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const svg=fs.readFileSync("travel/assets/world-map.svg","utf8");
const centroids=JSON.parse(fs.readFileSync("travel/assets/world-centroids.json","utf8"));
const model={
 name:"Voyageuse fictive",generatedAt:"2026-11-05T00:00:00Z",filters:{},
 mapSvgText:svg,worldCentroids:centroids,countryOfResidence:"GN",
 trips:[
  {trip:{id:"fiction-ca",country_code:"CA",cities:["Montréal"],entry_date:"2026-01-01",exit_date:"2026-01-04",duration_days:4,purpose:"tourisme",is_domestic:false},activities:[],photos:[]},
  {trip:{id:"fiction-jp",country_code:"JP",cities:["Tokyo"],entry_date:"2026-03-01",exit_date:"2026-03-04",duration_days:4,purpose:"affaires",is_domestic:false},activities:[],photos:[]},
  {trip:{id:"fiction-sn",country_code:"SN",cities:["Dakar"],entry_date:"2026-08-01",exit_date:"2026-08-04",duration_days:4,purpose:"famille",is_domestic:false},activities:[],photos:[]},
  {trip:{id:"fiction-gn",country_code:"GN",cities:["Kindia"],entry_date:"2026-09-01",exit_date:"2026-09-04",duration_days:4,purpose:"famille",is_domestic:true},activities:[],photos:[]}
 ]
};
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage();
  await page.setContent("<!doctype html><html lang='fr'><head></head><body></body></html>");
  for(const file of ["countries.js","dashboard-filters.js","flight-connections.js","printable-journal.js","family-booklet.js"])
   await page.addScriptTag({path:path.resolve("travel",file)});
  await page.evaluate(input=>window.BEAM_PERSONAL_JOURNAL.render(document,{...input,generatedAt:new Date(input.generatedAt)}),model);
  let results=await page.evaluate(()=>({
   maps:document.querySelectorAll(".atlas svg").length,
   arcs:document.querySelectorAll(".atlas .flightArc").length,
   homes:document.querySelectorAll(".atlas .flightResidence").length,
   animated:document.querySelectorAll(".atlas .flightMotion").length,
   countries:[...document.querySelectorAll(".atlas .flightArc")].map(p=>p.dataset.destination)
  }));
  assert.equal(results.maps,1);
  assert.equal(results.arcs,3);
  assert.equal(results.homes,1);
  assert.equal(results.animated,0,"Print must never animate");
  assert.deepEqual(results.countries,["CA","JP","SN"]);
  await page.evaluate(input=>window.BEAM_FAMILY_BOOKLET.render(document,{...input,generatedAt:new Date(input.generatedAt)}),model);
  results=await page.evaluate(()=>({
   maps:document.querySelectorAll(".world-leaf .world svg").length,
   paths:document.querySelectorAll(".world-leaf .world .flightArc").length,
   homes:document.querySelectorAll(".world-leaf .world .flightResidence").length,
   animated:document.querySelectorAll(".world-leaf .world .flightMotion").length
  }));
  assert.equal(results.maps,2,"Two halves of the A5 booklet map");
  assert.equal(results.paths,6,"Both halves carry exactly the three same static arcs");
  assert.equal(results.homes,2);
  assert.equal(results.animated,0,"Booklet must never animate");
  console.log("PASS journal and A5 booklet: same three static flight arcs, no Guinea domestic route");
  await page.close();
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
