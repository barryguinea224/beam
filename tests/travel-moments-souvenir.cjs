"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const DETAIL=require("../travel/trip-detail.js");
const a={id:"a",title:"Visite imaginaire",place:"Paris",happened_on:"2026-08-09",duration_days:3};
const b={id:"b",title:"Sans date",place:"",happened_on:null,duration_days:1};
const c={id:"c",title:"Promenade fictive",place:"Centre-ville",happened_on:"2026-08-05",duration_days:1};
const original=[a,b,c],sorted=DETAIL.sortedActivities(original);
assert.deepEqual(sorted.map(row=>row.id),["c","a","b"],"Undated activities must be last");
assert.deepEqual(original.map(row=>row.id),["a","b","c"],"Never mutate stored order");
const html=DETAIL.activities(original,false);
assert.match(html,/detailActivityList detailTimeline/);
assert.deepEqual([...html.matchAll(/class="detailActivity"/g)].map((m,i)=>i).length,3);
assert.ok(html.indexOf("Promenade fictive")<html.indexOf("Visite imaginaire"));
assert.ok(html.indexOf("Visite imaginaire")<html.indexOf("Sans date"));
assert.match(html,/detailActivityDay">5<\/span>/);
assert.match(html,/detailActivityMonth">août<\/span>/);
assert.match(html,/aria-label="5 août 2026"/);
assert.match(html,/Paris · 3 jours/);
assert.match(html,/detailActivityUndated/);
assert.match(html,/svg viewBox=/);
assert.doesNotMatch(html,/detailRemoveActivity/,"Reading mode remains pure consultation");
assert.doesNotMatch(html,/detailActivityThumb/,"No inferred photo links");
assert.match(DETAIL.activities([a],true),/detailRemoveActivity/);
assert.match(DETAIL.activities([a],false),/Visite imaginaire/);
assert.match(DETAIL.activities([{...a,title:'<img src=x onerror=alert(1)>'}],false),/&lt;img/);
assert.doesNotMatch(DETAIL.activities([{...a,title:'<img src=x onerror=alert(1)>'}],false),/<img src=x/);
assert.equal(DETAIL.souvenirDateLine("2026-08-05","2026-08-15"),
 "Écrit pour le voyage du 5 au 15 août 2026");
assert.equal(DETAIL.souvenirDateLine("2026-08-05","2026-08-05"),
 "Écrit pour le voyage du 5 août 2026");
assert.equal(DETAIL.souvenirDateLine("2026-08-30","2026-09-04"),
 "Écrit pour le voyage du 30 août 2026 au 4 septembre 2026");
assert.equal(DETAIL.souvenirDateLine("invalid","2026-09-04"),"");
const css=fs.readFileSync("travel/trip-premium.css","utf8"),
 index=fs.readFileSync("travel/index.html","utf8"),
 sw=fs.readFileSync("travel/sw.js","utf8");
assert.match(css,/font:600 22px\/1\.3 Poppins/);
assert.match(css,/grid-template-columns:52px minmax\(0,1fr\) auto/);
assert.match(css,/width:64px/);
assert.match(css,/detailActivity:not\(:last-child\)/);
assert.match(css,/line-clamp:6/);
assert.match(css,/padding:24px 18px 23px/);
assert.match(index,/id="detailNoteToggle"/);
assert.match(index,/id="detailNoteDate"/);
assert.match(index,/Mon souvenir/);
assert.match(index,/detailMeasureSouvenir/);
assert.match(sw,/jyetais-v58-moments-souvenir/);
console.log("PASS dated moment cards, stable sort, privacy, clipped souvenir, dates and layout rules");
