"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const FR=require("../travel/fr-accords.js");
const nouns=[
 ["photo","photos"],["voyage","voyages"],["pays","pays"],
 ["jour","jours"],["étape","étapes"],["activité","activités"],
 ["compagnon","compagnons"],["mois","mois"]
];
for(const [one,many] of nouns){
 for(const n of [0,1,2]){
  const expected=n+" "+(n<=1?one:many);
  assert.equal(FR.count(n,one,many),expected,one+" "+n);
  assert.equal(FR.word(n,one,many),n<=1?one:many);
 }
}
assert.equal(FR.count(0,"photo")+" "+FR.word(0,"privée","privées")+" de voyage","0 photo privée de voyage");
assert.equal(FR.count(1,"photo")+" "+FR.word(1,"privée","privées")+" de voyage","1 photo privée de voyage");
assert.equal(FR.count(2,"photo")+" "+FR.word(2,"privée","privées")+" de voyage","2 photos privées de voyage");
assert.equal(FR.count(1,"pays","pays"),"1 pays");
assert.equal(FR.count(4,"pays","pays"),"4 pays");
assert.equal(FR.count(4,"mois","mois"),"4 mois");
// Search every text source in travel/ for the invalid form, not just this UI module.
const path=require("node:path");
function audit(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const filename=path.join(directory,entry.name);
  if(entry.isDirectory()){audit(filename);continue}
  if(!/\.(?:html?|js|css|json|sql|md|txt|svg)$/.test(entry.name))continue;
  const source=fs.readFileSync(filename,"utf8");
  assert.doesNotMatch(source,/\bpayss\b/i,"Bad invariant country plural in "+filename);
 }
}
audit("travel");
const D=require("../travel/activity-durations.js"),T=require("../travel/trip-stops.js"),V=require("../travel/visual-cards.js");
assert.match(D.format("2026-11-10",2),/2 jours/);
assert.match(T.factual({country_code:"SN",cities:["Dakar"],entry_date:"2026-11-10",exit_date:"2026-11-10"}),/1 jour/);
assert.match(T.factual({country_code:"SN",cities:["Dakar"],entry_date:"2026-11-10",exit_date:"2026-11-11"}),/2 jours/);
for(const n of [0,1,2]){
 const t={id:"60000000-0000-4000-8000-000000000001",country_code:"FR",cities:["Paris"],
  entry_date:"2026-11-10",exit_date:"2026-11-11",duration_days:n};
 const markup=V.markup(t,"France","Tourisme","2026");
 assert.ok(markup.includes(FR.count(n,"jour")),String(n)+" on a journey card");
}
for(const file of ["index.html","profile-cover-ui.js","visual-cards.js","trip-stops.js","activity-durations.js","date-range-picker.js","printable-journal.js","family-booklet.js"]){
 const content=fs.readFileSync("travel/"+file,"utf8");
 assert.match(content,/BEAM_FR_ACCORDS|FR\.(?:word|count)/,"Shared agreement required: "+file);
}
const page=fs.readFileSync("travel/index.html","utf8");
assert.match(page,/src="\.\/fr-accords\.js"/);
assert.ok(page.indexOf('src="./fr-accords.js"')<page.indexOf('src="./visual-cards.js"'),"Agreement loaded first");
console.log("PASS 0/1/2 French agreement in photos, journeys, countries, days, stages, activities, companions; shared application integration");
