"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const STATS=require("../travel/journal-stats.js");
const PDF=require("../travel/factual-pdf.js");
const html=fs.readFileSync("travel/index.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
new vm.Script(script);
assert.deepEqual(STATS.summarize([
 {country_code:"GN",duration_days:1269,is_domestic:true},
 {country_code:"FR",duration_days:11,is_domestic:false},
 {country_code:"MA",duration_days:6,is_domestic:false}
]),{trips:2,countries:2,days:17,domestic:1});
assert.deepEqual(STATS.summarize([
 {country_code:"FR",duration_days:11,is_domestic:false},
 {country_code:"FR",duration_days:9,is_domestic:false},
 {country_code:"GN",duration_days:1,is_domestic:true},
 {country_code:"SN",duration_days:400,is_domestic:false,deleting:true}
]),{trips:2,countries:1,days:20,domestic:1});
assert.equal(PDF.purposeName("tourisme"),"Tourisme");
assert.equal(PDF.purposeName("etudes"),"Études");
assert.equal(PDF.factualRows([{country_code:"FR",cities:["Paris"],entry_date:"2026-01-01",exit_date:"2026-01-02",duration_days:2,purpose:"etudes"}])[0].purpose,PDF.purposeName("etudes"));
// The original international-only helper remains valid for legacy consumers.
 // The new dashboard intentionally shows all visible filtered journeys, domestic too.
assert.ok(script.includes('const visible=api.apply(trips,dashboardFilters)'));
assert.ok(script.includes('stats=api.summary(visible)'));
assert.ok(script.includes('window.BEAM_TRAVEL_PDF.fetchRows(S,uid)'));
assert.ok(script.includes('window.BEAM_TRAVEL_PDF.purposeName(x.purpose)'));
assert.ok(script.includes('fact("Motif",window.BEAM_TRAVEL_PDF.purposeName(trip.purpose))'));
assert.ok(script.includes('window.confirm("Retirer cette activité du voyage ?")'),"Activity confirmation must be retained");
assert.ok(html.indexOf('src="./journal-stats.js"')<html.indexOf("<script>"),"Stats module loads before app");
assert.ok(html.includes('id="domesticCount"'));
assert.ok(html.includes('class="statsWrap"'));
console.log("BEAM journal finishes PASS: 1269 domestic days excluded, shared purpose, activity confirmation");
