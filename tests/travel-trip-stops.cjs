"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const STOPS=require("../travel/trip-stops.js");
const PDF=require("../travel/factual-pdf.js");
const FILE=require("../travel/factual-pdf-file.js");
const FILTER=require("../travel/dashboard-filters.js");
const STATS=require("../travel/journal-stats.js");
const JOURNAL=require("../travel/printable-journal.js");
const trip={id:"fixture-fr",country_code:"FR",cities:["Paris"],entry_date:"2026-11-05",
 exit_date:"2026-11-15",duration_days:11,purpose:"tourisme",is_domestic:false,
 companions:"Maman",airline:"Compagnie fictive",hotel:"Hôtel fictif",
 stops:[{id:"fixture-de",trip_id:"fixture-fr",country_code:"DE",cities:["Berlin"],
  entry_date:"2026-11-10",exit_date:"2026-11-14",position:1}]};
const expected="↳ Allemagne · Berlin · 10/11/2026 → 14/11/2026 · 5 jours · étape";
assert.equal(STOPS.factual(trip.stops[0]),expected);
assert.equal(STOPS.days(trip.entry_date,trip.exit_date),11);
assert.equal(STOPS.days(trip.stops[0].entry_date,trip.stops[0].exit_date),5);
assert.equal(STOPS.validate(trip.stops[0],trip,[]),"");
assert.match(STOPS.validate({...trip.stops[0],country_code:"FR"},trip,[]),/différent/);
assert.match(STOPS.validate({...trip.stops[0],entry_date:"2026-11-04"},trip,[]),/dates/);
assert.match(STOPS.validate({...trip.stops[0],id:"second"},trip,trip.stops),/chevauch/);
assert.equal(STOPS.validate({id:"be",country_code:"BE",cities:[],entry_date:"2026-11-14",exit_date:"2026-11-15"},trip,trip.stops),"","Same-day handoff after the German stage is allowed");
assert.match(STOPS.validate({id:"be",country_code:"BE",cities:[],entry_date:"2026-11-13",exit_date:"2026-11-15"},trip,trip.stops),/chevauch/);
assert.deepEqual(STOPS.codes(trip),["FR","DE"]);
const filter={country:"DE"};
assert.deepEqual(FILTER.apply([trip],filter),[trip],"Country filter must match country inside stops");
assert.ok(FILTER.options([trip]).countries.includes("DE"));
assert.equal(FILTER.summary([trip],{}).countries,2);
assert.equal(FILTER.summary([trip],{}).days,11,"Five stage days must not be counted again");
assert.equal(STATS.summarize([trip]).countries,2);
assert.equal(STATS.summarize([trip]).days,11);
const print=JOURNAL.viewTrip(trip,[]);
assert.equal(print.stops[0].label,"Allemagne (10 → 14 nov.)");
const raw=[{country_code:"FR",cities:["Paris"],entry_date:"2026-11-05",
 exit_date:"2026-11-15",duration_days:11,purpose:"tourisme",stops:trip.stops,
 note:"JAMAIS DANS PDF",companions:"JAMAIS DANS PDF",airline:"JAMAIS DANS PDF",
 hotel:"JAMAIS DANS PDF"}];
const original=PDF.factualRows(raw)[0];
assert.equal(original.country,"France");assert.equal(original.cities,"Paris");
assert.deepEqual(original.stops.map(s=>s.label),[expected]);
assert.equal(original.duration,"11 jours");
assert.ok(!("companions" in original)&&!("airline" in original)&&!("hotel" in original));
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
const attached=PDF.attachStops([{...raw[0],stops:undefined}],{
 parents:[{id:"fixture-fr",country_code:"FR",entry_date:"2026-11-05",exit_date:"2026-11-15"}],
 children:trip.stops.map(s=>({trip_id:"fixture-fr",...s}))
});
assert.equal(PDF.factualRows(attached)[0].stops[0].label,expected);
const output=FILE.make({displayName:"VOYAGEUR FICTIF",generatedAt:new Date("2026-11-07T12:00:00Z")},raw);
const rawBytes=Buffer.from(output).toString("latin1");
assert.ok(rawBytes.startsWith("%PDF-1.4"));
assert.ok(rawBytes.includes("Allemagne")&&rawBytes.includes("Berlin"));
assert.ok(!rawBytes.includes("JAMAIS DANS PDF"));
assert.match(rawBytes,/53 [0-9.]+ m 53 [0-9.]+ l 60/,"Vector ↳ arrow in native J'y étais PDF");
// Long document exercises multipage line placement and no split stage lines.
const long=Array.from({length:80},(_,i)=>({...raw[0],
  entry_date:"2026-11-05",exit_date:"2026-11-15",stops:trip.stops
}));
const multi=Buffer.from(FILE.make({displayName:"VOYAGEUR FICTIF",generatedAt:new Date("2026-11-07T12:00:00Z")},long)).toString("latin1");
assert.ok((multi.match(/\/Type \/Page\b/g)||[]).length>1);
assert.equal((multi.match(/Allemagne/g)||[]).length,80);
const index=fs.readFileSync("travel/index.html","utf8");
const inline=index.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(inline);new vm.Script(inline);
for(const token of ['S.from("trip_stops")','fetchOwnedStops(data||[],user.id)',
 'trip.stops||[]','detailStopsSection','tripStopForm','tripStopDeleteConfirm',
 'window.BEAM_TRAVEL_PDF.fetchStops(S,uid)','window.BEAM_TRAVEL_PDF.attachStops(data,stops)']){
 assert.ok(index.includes(token),"Missing real query / UI wiring: "+token);
}
assert.match(index,/\.eq\("user_id",uid\)\.order\("position"/);
assert.match(index,/\.eq\("trip_id",id\)\.eq\("user_id",uid\)/);
for(const file of ["travel/printable-journal.js","travel/family-booklet.js"]){
 const src=fs.readFileSync(file,"utf8");
 assert.match(src,/trip\.stops/,"Personal carnet must contain stages");
}
assert.match(index,/pack\[position\]=\{trip,stops:trip\.stops/);
assert.equal(fs.readFileSync("travel/sw.js","utf8").includes("jyetais-v38-settings"),true);
const sql=fs.readFileSync("travel/supabase/migrations/20261107150000_trip_stops.sql","utf8");
assert.match(sql,/foreign key\(trip_id,user_id\)/i);
assert.match(sql,/constraint trip_stops_no_overlap exclude using gist/i);
assert.match(sql,/ETAPE_LIMITE_10/);
assert.doesNotMatch(sql,/\b(?:grant|revoke)\b.*\bon public\.(?:trips|activities)\b/i);
console.log("PASS trip stops: multistop filters, distinct countries, no duplicate days, factual 6 fields + indented stops, real queries, native J'y étais PDF multipage");
