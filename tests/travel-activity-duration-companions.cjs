"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const D=require("../travel/activity-durations.js");
const DETAIL=require("../travel/trip-detail.js");
const JOURNAL=require("../travel/printable-journal.js");
const read=p=>fs.readFileSync(p,"utf8");
assert.equal(D.format("2026-12-24",1),"24 déc.");
assert.equal(D.format("2026-12-24",3),"24 → 26 déc. · 3 jours");
assert.equal(D.format("2026-12-31",3),"31 déc. 2026 → 2 janv. 2027 · 3 jours");
assert.equal(D.addDays("2024-02-28",2),"2024-03-01");
assert.equal(D.addDays("2026-12-31",1),"2027-01-01");
assert.equal(D.format("2026-13-24",1),"");
const trip={entry_date:"2026-12-20",exit_date:"2026-12-31"};
assert.match(D.validate("2026-12-30",3,trip),/fin du voyage/);
assert.equal(D.validate("2026-12-24",3,trip),"");
assert.equal(D.validate("",30,trip),"");
assert.match(D.validate("",31,trip),/1 et 30/);
assert.match(D.validate("2026-12-24",0,trip),/1 et 30/);
const owned=DETAIL.validateActivity({title:"Visite",place:"Dakar",happened_on:"2026-12-24",duration_days:3},trip);
assert.equal(owned.value.duration_days,3);
assert.match(DETAIL.validateActivity({title:"Visite",happened_on:"2026-12-30",duration_days:3},trip).error,/fin du voyage/);
const malicious='<img src=x onerror="alert(1)">';
const list=DETAIL.activities([{id:"synthetic",title:malicious,place:malicious,happened_on:"2026-12-24",duration_days:3}]);
assert.ok(!list.includes(malicious));
assert.match(list,/24 → 26 déc. · 3 jours/);
assert.doesNotMatch(list,/<img src=x/);
const projection=JOURNAL.viewTrip({country_code:"FR",cities:["Paris"],entry_date:"2026-12-20",
 exit_date:"2026-12-31",duration_days:12,purpose:"tourisme",companions:malicious,
 airline:"Airline specimen",hotel:"Fictional hotel"},
 [{title:"Marché fictif",place:"Paris",happened_on:"2026-12-24",duration_days:3}]);
assert.equal(projection.companions,malicious);
assert.equal(projection.activities[0].date,"24 → 26 déc. · 3 jours");
assert.equal(projection.activities[0].durationDays,3);
const inline=read("travel/index.html").match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline);
const html=read("travel/index.html");
for(const token of ['id="tripCompanions"','name="companions"','id="activityDurationChoices"','data-duration="2"',
 'data-duration="3"','data-duration="4"','id="activityDurationOther"','type="number"','name="duration_days"']){
 assert.ok(html.includes(token),"HTML missing "+token);
}
assert.match(html,/Prénoms ou liens seulement, sans nom complet ni numéro de téléphone/);
assert.match(inline,/f\.companions\.value=x\.companions\|\|""/);
assert.match(inline,/companions:companions\|\|null/);
assert.match(inline,/fact\("Voyagé avec",trip\.companions\)/);
assert.match(inline,/select\("id,title,place,happened_on,duration_days"\)/);
assert.match(inline,/select\("title,place,happened_on,duration_days"\)/);
assert.match(inline,/select\("id,country_code,cities,entry_date,exit_date,duration_days,purpose,is_domestic,note,airline,hotel,companions,airline_media_id,hotel_media_id"\)/);
for(const p of ["travel/factual-pdf.js","travel/factual-pdf-file.js"]){
 const text=read(p);
 assert.doesNotMatch(text,/companions|activity_duration|activityDurationOther/,"Embassy PDF must be unchanged "+p);
}
for(const p of ["travel/printable-journal.js","travel/family-booklet.js"]){
 assert.match(read(p),/trip\.companions/,"Companions printed as text for "+p);
}
assert.doesNotMatch(read("travel/printable-journal.js"),/\.innerHTML\s*=/);
assert.doesNotMatch(read("travel/family-booklet.js"),/\.innerHTML\s*=/);
const sw=read("travel/sw.js");
assert.match(sw,/jyetais-v40-settings/);
assert.match(sw,/\.\/activity-durations\.js/);
assert.match(sw,/\.\/activity-duration\.css/);
for(const p of ["travel/activity-durations.js","travel/trip-detail.js","travel/printable-journal.js","travel/family-booklet.js"])
 new vm.Script(read(p));
console.log("PASS J'y étais activity duration + companions: 1/3/30 days, leap-year/month/year, owners queries, escaped companion/activities, factual PDF isolation");
