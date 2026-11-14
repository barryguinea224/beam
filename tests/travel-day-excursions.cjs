"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const DAY=require("../travel/day-excursions.js");
const STOPS=require("../travel/trip-stops.js");
const CARD=require("../travel/visual-cards.js");
const JOURNAL=require("../travel/printable-journal.js");
const BOOK=require("../travel/family-booklet.js");
const PDF=require("../travel/factual-pdf.js");
const p={id:"11111111-1111-4111-8111-111111111111",country_code:"FR",
 cities:["Paris"],entry_date:"2026-11-08",exit_date:"2026-11-18",
 duration_days:11,purpose:"tourisme",is_domestic:false,stops:[]};
const day={id:"22222222-2222-4222-8222-222222222222",country_code:"SN",
 cities:["Dakar"],entry_date:"2026-11-12",exit_date:"2026-11-12",
 duration_days:1,purpose:"tourisme",is_domestic:false};
assert.equal(DAY.modeFor(p),"multi");
assert.equal(DAY.modeFor(day),"day");
assert.equal(DAY.single(day),true);
assert.equal(DAY.single(p),false);
assert.deepEqual(DAY.datesFor("day","2026-11-12","2026-11-22"),
 {entry_date:"2026-11-12",exit_date:"2026-11-12"});
assert.deepEqual(DAY.datesFor("multi","2026-11-12","2026-11-22"),
 {entry_date:"2026-11-12",exit_date:"2026-11-22"});
assert.equal(DAY.short("2026-11-12"),"12 nov. 2026");
for(const date of ["2026-11-31","2026-02-30","2026-13-01","",null,"2026/11/12"])
 assert.equal(DAY.validDate(date),false);
const selected={entry_date:"2026-11-12",exit_date:"2026-11-12",country_code:"DE"};
const match=DAY.conflict(selected,[p]);
assert.equal(match.kind,"stop");
assert.equal(match.date,"2026-11-12");
assert.equal(match.trip.id,p.id);
assert.equal(DAY.message(match),
 "Ce jour fait partie de votre voyage en France du 8 nov. 2026 au 18 nov. 2026.");
assert.equal(DAY.conflict({...selected,country_code:"FR"},[p]).kind,"activity");
assert.equal(DAY.conflict({...selected,entry_date:"2026-12-12",exit_date:"2026-12-12"},[p]),null);
assert.equal(DAY.conflict(selected,[p],p.id),null);
assert.equal(DAY.conflict(selected,[{...p,is_domestic:true}]),null);
assert.equal(DAY.conflict({...selected,entry_date:"2026-11-06",exit_date:"2026-11-09"},[p]).date,"2026-11-08",
 "partial period overlap selects a date within the existing foreign trip");
assert.equal(DAY.conflict({...selected,entry_date:"2026-11-12",exit_date:"2026-11-20"},[p]).date,"2026-11-12");

/* Regression: Postgres daterange uses [entry,exit) for multi-day journeys
   and [entry,entry] for a single day. Departure-day borders are allowed. */
const france={...p,id:"fixture-France",country_code:"FR",
 entry_date:"2026-11-01",exit_date:"2026-11-10"};
const request=(country_code,entry_date,exit_date=entry_date)=>({country_code,entry_date,exit_date});
const belgiumAfter=request("BE","2026-11-10","2026-11-15");
const belgiumBefore=request("BE","2026-10-25","2026-11-01");
const senegalOnDeparture=request("SN","2026-11-10");
assert.equal(DAY.conflict(belgiumAfter,[france]),null,
 "FR 01→10 then BE 10→15: same-day border crossing does not overlap");
assert.equal(DAY.conflict(belgiumBefore,[france]),null,
 "BE 25/10→01/11 then FR 01→10: departure date is not included");
assert.equal(DAY.conflict(senegalOnDeparture,[france]),null,
 "single-day SN on FR departure date is permitted");
assert.equal(DAY.conflict(request("SN","2026-11-05"),[france]).kind,"stop",
 "single-day foreign country inside FR proposes a stage");
assert.equal(DAY.conflict(request("FR","2026-11-05"),[france]).kind,"activity",
 "single-day same country inside FR proposes an activity");
const wholePeriod=DAY.conflict(request("BE","2026-11-03","2026-11-06"),[france]);
assert.equal(wholePeriod.kind,"stop");
assert.equal(wholePeriod.fullyContained,true);
assert.deepEqual(wholePeriod.stopDates,{entry_date:"2026-11-03",exit_date:"2026-11-06"},
 "fully contained 4-day period must retain both dates for trip_stops");
assert.equal(STOPS.validate({country_code:"BE",cities:["Bruxelles"],
 entry_date:wholePeriod.stopDates.entry_date,exit_date:wholePeriod.stopDates.exit_date},france,[]),"");
const partialPeriod=DAY.conflict(request("BE","2026-10-30","2026-11-05"),[france]);
assert.equal(partialPeriod.fullyContained,false);
assert.deepEqual(partialPeriod.stopDates,{entry_date:"2026-11-01",exit_date:"2026-11-01"},
 "partially overlapping period must offer only a safe date");
assert.equal(DAY.conflict(request("BE","2026-11-03","2026-11-06"),[france],"fixture-France"),null,
 "a voyage in modification excludes its own unchanged record");
assert.equal(DAY.conflict(request("BE","2026-11-03","2026-11-06"),
 [france,{...france,id:"editing-itself"}],"editing-itself").trip.id,"fixture-France",
 "modification must still detect other overlapping trips");
assert.equal(DAY.conflict(request("BE","2026-11-10","2026-11-15"),
 [france,{...france,id:"editing-itself",entry_date:"2026-11-10",exit_date:"2026-11-15"}],
 "editing-itself"),null,"modification at the border must be accepted");

// Independent discrete-date reference: enumerate each date occupied by the SQL
// range, treating only the multi-day departure date as unoccupied.
const utcDay=iso=>Math.floor(Date.parse(iso+"T00:00:00Z")/86400000);
function occupiedDays(row){
 const first=utcDay(row.entry_date),last=utcDay(row.exit_date);
 const bound=row.entry_date===row.exit_date?last+1:last;
 const occupied=new Set();
 for(let i=first;i<bound;i++)occupied.add(i);
 return occupied;
}
function referenceSqlOverlaps(a,b){
 const left=occupiedDays(a),right=occupiedDays(b);
 for(const date of left)if(right.has(date))return true;
 return false;
}
const examples=["2026-10-25","2026-10-31","2026-11-01","2026-11-03",
 "2026-11-05","2026-11-06","2026-11-09","2026-11-10",
 "2026-11-11","2026-11-15","2026-11-18"];
const ranges=[];
for(let i=0;i<examples.length;i++)
 for(let j=i;j<examples.length;j++)
  ranges.push(request("BE",examples[i],examples[j]));
let checkedPairs=0;
for(const parent of ranges){
 for(const attempt of ranges){
  const actual=DAY.conflict(attempt,[{...parent,id:"parent",country_code:"FR"}])!==null;
  const expected=referenceSqlOverlaps(attempt,parent);
  assert.equal(actual,expected,
   "daterange mismatch: "+attempt.entry_date+"→"+attempt.exit_date+
   " versus "+parent.entry_date+"→"+parent.exit_date);
  checkedPairs++;
 }
}
assert.equal(checkedPairs,ranges.length*ranges.length);
const stop={country_code:"DE",cities:["Berlin"],entry_date:"2026-11-12",
 exit_date:"2026-11-12",position:1};
assert.equal(STOPS.validate(stop,p,[]),"");
assert.equal(STOPS.interval(stop.entry_date,stop.exit_date),"12 nov. 2026");
assert.equal(STOPS.compact(stop),"Allemagne (12 nov. 2026)");
const card=CARD.markup(day,"Sénégal","Tourisme",DAY.short(day.entry_date));
assert.match(card,/12 nov\. 2026 · Excursion · 1 jour/);
assert.doesNotMatch(card,/12 nov\. → 12 nov\.|1 jours/);
const projected=JOURNAL.viewTrip({...day,stops:[stop]});
assert.equal(projected.entry,projected.exit);
assert.equal(projected.stops[0].label,"Allemagne (12 nov. 2026)");
assert.match(BOOK.natural(projected),/12 nov\. 2026 · Excursion · 1 jour/);
const factual=PDF.factualRows([day])[0];
assert.equal(factual.entry,"12/11/2026");
assert.equal(factual.exit,"12/11/2026");
assert.equal(factual.duration,"1 jour");
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
const html=fs.readFileSync("travel/index.html","utf8");
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);
new vm.Script(inline,{filename:"travel/index.html"});
new vm.Script(fs.readFileSync("travel/day-excursions.js","utf8"),{filename:"travel/day-excursions.js"});
for(const marker of ['id="tripDurationChoices"','data-trip-mode="day"','data-trip-mode="multi"',
 'id="tripOverlapStop"','id="tripOverlapActivity"','id="tripOverlapEditDates"',
 'id="tripEntryDate"','id="tripExitDate"','DAY.datesFor(tripMode',
 'DAY.conflict(p,trips,editingTripId)','S.from("trip_stops").insert',
 'DAY.single(trip)','Excursion · 1 jour','type="button"'])
 assert.ok(html.includes(marker),"Missing travel UI "+marker);
assert.match(html,/showTripOverlap\(p,match,!wasEditing\)/);
assert.match(html,/if\(error\.code==="23P01"/);
assert.doesNotMatch(html,/msg\.textContent=error\.message/);
const sw=fs.readFileSync("travel/sw.js","utf8");
assert.match(sw,/jyetais-v44-period-calendar/);
assert.ok(sw.includes('"./day-excursions.js"')&&sw.includes('"./day-excursions.css"'));
const style=fs.readFileSync("travel/day-excursions.css","utf8");
assert.ok(style.includes(".dayModeChoices")&&style.includes(".tripOverlapOffer"));
console.log("PASS one-day excursions: dates, conflict/stop/activity routing, printable formatting, six-field factual PDF, UI safety and PWA v44");
