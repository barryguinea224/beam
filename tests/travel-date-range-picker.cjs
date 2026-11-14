"use strict";
// No personal data. The server exclusion constraint remains authoritative.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const P=require("../travel/date-range-picker.js");
const DAY=require("../travel/day-excursions.js");
const one=(entry_date,exit_date,id)=>({id,entry_date,exit_date});
assert.equal(P.maxAllowed(new Date("2026-11-14T12:00:00Z")),"2028-11-14");
assert.equal(P.maxAllowed(new Date("2026-11-14T23:30:00-08:00")),"2028-11-15","UTC date must match public.check_trip_dates");
assert.equal(P.maxAllowed(new Date("2024-02-29T12:00:00Z")),"2026-02-28");
for(const invalid of ["2026-11-31","2026-02-29","2026-13-01","2026/11/03",""])
 assert.equal(P.parse(invalid),null,"invalid date "+invalid);
assert.equal(P.shortDate("2026-11-03"),"3 nov. 2026");
assert.equal(P.longDate("2026-11-03"),"mardi 3 novembre 2026");
let s=P.nextSelection("multi","","","2026-11-03");
assert.deepEqual(s,{entry:"2026-11-03",exit:""});
s=P.nextSelection("multi",s.entry,s.exit,"2026-11-10");
assert.deepEqual(s,{entry:"2026-11-03",exit:"2026-11-10"});
assert.equal(P.summary("multi",s.entry,s.exit),"Du 3 au 10 nov. 2026 · 8 jours");
assert.equal(P.summary("multi","2026-11-05",""),"Arrivée le 5 nov. 2026 — touchez maintenant la date de départ");
assert.deepEqual(P.nextSelection("multi","2026-11-05","","2026-11-05"),{entry:"2026-11-05",exit:"2026-11-05"},"two taps same date is valid");
assert.equal(P.summary("multi","2026-11-05","2026-11-05"),"Le 5 nov. 2026");
assert.equal(P.summary("multi","2026-11-05","2026-11-06"),"Du 5 au 6 nov. 2026 · 2 jours");
assert.equal(P.summary("multi","2026-11-05","2026-11-11"),"Du 5 au 11 nov. 2026 · 7 jours");
assert.equal(P.summary("multi","2026-10-28","2026-11-03"),"Du 28 oct. au 3 nov. 2026 · 7 jours");
assert.equal(P.summary("multi","2026-12-28","2027-01-03"),"Du 28 déc. 2026 au 3 janv. 2027 · 7 jours");
const STOPS=require("../travel/trip-stops.js"),CARDS=require("../travel/visual-cards.js");
const stage=one("2026-11-05","2026-11-05","s");
assert.match(STOPS.factual({...stage,country_code:"DE",cities:["Berlin"]}),/1 jour · étape/);
assert.match(STOPS.factual({...stage,exit_date:"2026-11-06",country_code:"DE",cities:["Berlin"]}),/2 jours · étape/);
function card(duration,exit){
 return CARDS.markup({id:"00000000-0000-4000-8000-000000000000",country_code:"FR",
  cities:["Paris"],entry_date:"2026-11-05",exit_date:exit,duration_days:duration},
  "France","Tourisme","5 nov. 2026");
}
assert.match(card(1,"2026-11-06"),/1 jour/);
assert.doesNotMatch(card(1,"2026-11-06"),/1 jours/);
assert.match(card(2,"2026-11-06"),/2 jours/);
s=P.nextSelection("multi",s.entry,s.exit,"2026-11-14");
assert.deepEqual(s,{entry:"2026-11-14",exit:""},"third click starts a new selection");
s=P.nextSelection("multi",s.entry,s.exit,"2026-11-02");
assert.deepEqual(s,{entry:"2026-11-02",exit:""},"earlier second click becomes arrival");
s=P.nextSelection("day","","","2026-11-12");
assert.deepEqual(s,{entry:"2026-11-12",exit:"2026-11-12"});
assert.equal(P.summary("day",s.entry,s.exit),"Le 12 nov. 2026");
const france=one("2026-11-01","2026-11-10","france");
assert.equal(P.occupied("2026-11-01",france),true);
assert.equal(P.occupied("2026-11-09",france),true);
assert.equal(P.occupied("2026-11-10",france),false,"SQL departure day is excluded");
assert.equal(P.occupied("2026-11-10",one("2026-11-10","2026-11-10","day")),true);
assert.equal(P.occupied("2027-04-12",one("2027-04-12","2027-04-16","upcoming")),true,"future journeys remain visible as subtle hints");
assert.equal(P.occupied("2027-04-16",one("2027-04-12","2027-04-16","upcoming")),false,"SQL end-exclusive future trip");
assert.equal(DAY.conflict({country_code:"BE",entry_date:"2026-11-10",exit_date:"2026-11-15"},[{...france,country_code:"FR"}]),null,"the visual indicator must not change conflict logic");
const html=fs.readFileSync("travel/index.html","utf8");
const sw=fs.readFileSync("travel/sw.js","utf8");
for(const token of ['id="tripDatePicker"','id="tripStopDatePicker"','id="stopDurationChoices"',
 'id="tripEntryDate" name="entry_date" type="hidden"',
 'id="tripExitDate" name="exit_date" type="hidden"',
 'id="tripStopEntry" name="entry_date" type="hidden"',
 'id="tripStopExit" name="exit_date" type="hidden"',
 'const tripPicker=RANGE.mount','const stopPicker=RANGE.mount',
 'tripPicker.setExisting(trips,id)','stopPicker.setBounds({min:trip?.entry_date',
 'DAY.conflict(p,trips,editingTripId)','...DAY.datesFor(tripMode',
 'new FormData(form)','S.from("trip_stops").insert'])
 assert.ok(html.includes(token),"missing existing data flow: "+token);
assert.ok(html.indexOf('src="./date-range-picker.js"')<html.indexOf("const RANGE="));
assert.ok(html.includes('href="./date-range-picker.css"'));
assert.match(html,/BEAM_DATE_RANGE_PICKER/);
assert.ok(html.includes('msg.textContent="Choisissez la date de départ du pays."'),"partial range submit must explain missing departure");
assert.ok(html.includes('stopMode==="multi"&&$("#tripStopEntry").value&&!$("#tripStopExit").value'),"stages must also reject an incomplete range");
assert.ok(html.includes('tripMode==="multi"&&$("#tripEntryDate").value&&!$("#tripExitDate").value'),"trip save must read hidden date sources directly");
assert.match(sw,/jyetais-v47-poppins-all-headings/);
for(const resource of ['"./date-range-picker.js"','"./date-range-picker.css"'])
 assert.ok(sw.includes(resource),"Missing safe public cache resource "+resource);
new vm.Script(fs.readFileSync("travel/date-range-picker.js","utf8"));
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)?.[1]);
console.log("PASS range picker: period, reversed start, third click, one-day, leap-year limit, SQL visual hints, hidden form sources, PWA");
