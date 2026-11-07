"use strict";
// No customer data: static contract and synthetic values only.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const JOURNAL=require("../travel/printable-journal.js");
const PDF=require("../travel/factual-pdf.js");
const page=fs.readFileSync("travel/index.html","utf8");
const schema=fs.readFileSync("travel/supabase/schema.sql","utf8");
const migration=fs.readFileSync("travel/supabase/migrations/20261104160000_trips_airline_hotel.sql","utf8");
const booklet=fs.readFileSync("travel/family-booklet.js","utf8");
const journal=fs.readFileSync("travel/printable-journal.js","utf8");
const sw=fs.readFileSync("travel/sw.js","utf8");
for(const [key,label] of [["airline","Compagnie aérienne"],["hotel","Hôtel / hébergement"]]){
 assert.ok(page.includes('name="'+key+'" type="text" maxlength="160"'),key+" input length");
 assert.ok(page.includes(label+" (facultatif)"),key+" input must be optional");
 assert.ok(page.includes('f.'+key+'.value=x.'+key+'||""'),key+" edit prefill");
 assert.ok(page.includes(key+':'+key+'||null'),key+" must be removable");
 assert.ok(page.includes('trip.'+key+'?.trim()'),key+" must be hidden if absent");
 assert.ok(schema.includes(key+' text constraint trips_'+key+'_max_length check(char_length('+key+')<=160)'),key+" SQL length");
}
assert.ok(migration.includes("grant update(airline,hotel) on public.trips to authenticated"));
assert.ok(page.includes("airline.length>160||hotel.length>160"));
assert.ok(page.includes('stayFact("Compagnie aérienne",trip.airline,"airline")'));
assert.ok(page.includes('stayFact("Hôtel / hébergement",trip.hotel,"hotel")'));
assert.ok(journal.includes("trip-logistics") && booklet.includes("stay-logistics"));
// Regression: inspect the REAL query feeding both personal print formats.
const printStart=page.indexOf('$("#printJournal").onclick=async()=>');
const factualStart=page.indexOf('$("#pdf").onclick=async()=>',printStart);
assert.ok(printStart>=0&&factualStart>printStart,"print/factual handlers must be separated");
const printHandler=page.slice(printStart,factualStart);
const tripQueries=[...printHandler.matchAll(/S\.from\("trips"\)\s*\.select\("([^"]+)"\)/g)];
assert.equal(tripQueries.length,1,"one explicit trips projection must feed both personal print formats");
const expectedColumns=[
 "id","country_code","cities","entry_date","exit_date","duration_days",
 "purpose","is_domestic","note","airline","hotel","companions","airline_media_id","hotel_media_id"
];
assert.deepEqual(tripQueries[0][1].split(","),expectedColumns,
 "the real personal-booklet select must include airline + hotel (never select *)");
assert.ok(printHandler.includes("pack[position]={trip,stops:trip.stops||[],activities:"),
 "the selected full trip must be passed to journal and family booklet");
assert.ok(printHandler.includes("BEAM_FAMILY_BOOKLET.render(tab.document"),
 "both personal-print formats must consume the same trip pack");
const factualHandler=page.slice(factualStart);
assert.ok(factualHandler.includes("BEAM_TRAVEL_PDF.fetchRows(S,uid)"),
 "factual PDF must keep its separate security-invoker view");
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"],
 "neither airline nor hotel may enter the factual PDF");

assert.ok(sw.includes("jyetais-v38-settings"));
const sample={country_code:"FR",cities:["Paris"],entry_date:"2025-05-01",exit_date:"2025-05-03",
 duration_days:3,purpose:"tourisme",airline:"  Compagnie fictive  ",hotel:"  Hôtel fictif  "};
const projected=JOURNAL.viewTrip(sample);
assert.equal(projected.airline,"Compagnie fictive");
assert.equal(projected.hotel,"Hôtel fictif");
assert.equal(JOURNAL.viewTrip({...sample,airline:null,hotel:null}).hotel,"");
assert.equal(JOURNAL.viewTrip({...sample,airline:" ".repeat(5),hotel:""}).airline,"");
assert.equal(JOURNAL.viewTrip({...sample,airline:"x".repeat(200)}).airline.length,160);
const factual=schema.split("create view public.travel_history_pdf")[1]?.split(";")[0];
assert.ok(factual,"Factual PDF view must exist");
assert.ok(!factual.includes("airline")&&!factual.includes("hotel"));
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
const a=page.indexOf("<script>"),b=page.indexOf("</script>",a+8);
assert.ok(a>=0&&b>a);
new vm.Script(page.slice(a+8,b),{filename:"travel/index.html"});
console.log("PASS optional airline/hotel: UI, edit/clear, projection, SQL, factual PDF, private journal");
