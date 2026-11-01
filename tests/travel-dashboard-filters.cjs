"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const api=require("../travel/dashboard-filters.js");
const PDF=require("../travel/factual-pdf.js");

const rows=[
 {id:"1",country_code:"FR",entry_date:"2026-06-15",purpose:"tourisme",is_domestic:false,duration_days:7,notes:"SECRET",deleting:false},
 {id:"2",country_code:"FR",entry_date:"2025-01-04",purpose:"affaires",is_domestic:false,duration_days:4,deleting:false},
 {id:"3",country_code:"GN",entry_date:"2026-02-10",purpose:"famille",is_domestic:true,duration_days:3,deleting:false},
 {id:"4",country_code:"SN",entry_date:"2026-03-15",purpose:"tourisme",is_domestic:false,duration_days:9,deleting:false},
 {id:"5",country_code:"SN",entry_date:"2024-03-15",purpose:"tourisme",is_domestic:false,duration_days:1,deleting:true}
];
assert.equal(api.apply(rows,api.EMPTY).length,4,"deleted trips never appear");
assert.deepEqual(api.summary(api.apply(rows,api.EMPTY),api.EMPTY),
 {trips:3,countries:2,days:20,domestic:1},
 "default headline counts only foreign trips, separate domestic stay");
assert.deepEqual(api.summary(api.apply(rows,{year:"2026"}),{year:"2026"}),
 {trips:2,countries:2,days:16,domestic:1},
 "year filter updates international headline and separate domestic count");
assert.deepEqual(api.summary(api.apply(rows,{country:"GN"}),{country:"GN"}),
 {trips:0,countries:0,days:0,domestic:1},
 "domestic-only country must not inflate the international headline");
assert.deepEqual(api.summary(api.apply(rows,{scope:"foreign"}),{scope:"foreign"}),
 {trips:3,countries:2,days:20,domestic:0},
 "foreign selection excludes domestic rows from list and separate count");
// Product example: 3 foreign journeys in 3 countries + 2 domestic stays
// in Guinea are NOT "5 foreign journeys, 4 countries".
const productExample=[
 {country_code:"FR",entry_date:"2026-01-01",purpose:"tourisme",is_domestic:false,duration_days:5},
 {country_code:"SN",entry_date:"2026-02-01",purpose:"affaires",is_domestic:false,duration_days:8},
 {country_code:"MA",entry_date:"2025-03-01",purpose:"famille",is_domestic:false,duration_days:4},
 {country_code:"GN",entry_date:"2026-04-01",purpose:"tourisme",is_domestic:true,duration_days:2},
 {country_code:"GN",entry_date:"2026-05-01",purpose:"famille",is_domestic:true,duration_days:3}
];
assert.deepEqual(api.summary(api.apply(productExample,api.EMPTY),api.EMPTY),
 {trips:3,countries:3,days:17,domestic:2});
assert.deepEqual(api.summary(api.apply(productExample,{scope:"domestic"}),{scope:"domestic"}),
 {trips:2,countries:1,days:5,domestic:2});
assert.deepEqual(api.summary(api.apply(productExample,{country:"GN"}),{country:"GN"}),
 {trips:0,countries:0,days:0,domestic:2});
assert.equal(api.apply(productExample,api.EMPTY).length,5,
 "list may show all five journeys without inflating the foreign headline");

assert.deepEqual(api.options(rows).years,["2026","2025"]);
assert.deepEqual(api.options(rows).countries,["FR","GN","SN"]);
let state=api.toggleCountry(api.EMPTY,"FR");
assert.equal(state.country,"FR");
assert.deepEqual(api.apply(rows,state).map(t=>t.id),["1","2"]);
state=api.toggleCountry(state,"FR");
assert.deepEqual(state,api.EMPTY,"second tap unselects country");
state=api.normalize({country:"FR",year:"2026",purpose:"tourisme",scope:"foreign"});
assert.deepEqual(api.apply(rows,state).map(t=>t.id),["1"],"four filters compose");
assert.deepEqual(api.summary(api.apply(rows,state),state),{trips:1,countries:1,days:7,domestic:0});
assert.equal(api.apply(rows,{country:"GN",scope:"foreign"}).length,0);
assert.deepEqual(api.apply(rows,{scope:"domestic"}).map(t=>t.id),["3"]);
assert.deepEqual(api.summary(api.apply(rows,{scope:"domestic"}),{scope:"domestic"}),
 {trips:1,countries:1,days:3,domestic:1},
 "national selection switches headline to domestic stays");
assert.equal(api.apply(rows,{year:"2025",purpose:"tourisme"}).length,0);
assert.deepEqual(api.normalize({year:"<script>",purpose:"<script>",scope:"bad",country:"<X"}),
 api.EMPTY,"untrusted filter values fail closed");

// The PDF must ignore every dashboard filter, country selection and visible card.
const calls=[];
const client={from(view){
 calls.push(["from",view]);
 return {select(fields){calls.push(["select",fields]);return this},
 eq(column,value){calls.push(["eq",column,value]);return this},
 order(field,{ascending}){calls.push(["order",field,ascending]);return {data:[],error:null}}};
}};
for(const filter of [state,api.normalize({scope:"domestic"}),api.normalize({year:"2025"}),api.EMPTY]){
 assert.ok(api.apply(rows,filter).length!==null);
 PDF.fetchRows(client,"authenticated-owner");
}
const one=[["from","travel_history_pdf"],["select",PDF.FIELDS.join(",")],
 ["eq","user_id","authenticated-owner"],["order","entry_date",false]];
for(let i=0;i<calls.length;i+=4)assert.deepEqual(calls.slice(i,i+4),one);
assert.equal(PDF.VIEW,"travel_history_pdf");
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);

const app=fs.readFileSync("travel/index.html","utf8");
const inline=app.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline,"main UI script missing");
new vm.Script(inline,{filename:"travel/index.html"});
assert.match(inline,/BEAM_TRAVEL_PDF\.fetchRows\(S,uid\)/);
const click=inline.slice(inline.indexOf('$("#pdf").onclick='),inline.indexOf("if(S)S.auth.onAuthStateChange"));
assert.ok(!/dashboardFilters|filterCountry|filterYear|filterPurpose|filterScope/.test(click),
 "PDF generation must never consume dashboard filters");
assert.match(inline,/const visible=api\.apply\(trips,dashboardFilters\)/,
 "filtered rows must drive dashboard");
assert.match(inline,/stats=api\.summary\(visible,dashboardFilters\)/,
 "headline statistics must receive selected scope");
assert.match(inline,/national=dashboardFilters\.scope==="domestic"/,
 "only explicit national scope changes headline to domestic stays");
assert.match(inline,/active\?visible\.length\+/,
 "filter status must reflect displayed trip count, not foreign headline");
assert.match(inline,/const name=typeof profile\.display_name/,
 "title must use loaded profile");
assert.match(inline,/#dashboardTitle/);
const accountMarkup=app.slice(app.indexOf('id="myAccount"'));
const sessionMarkup=accountMarkup.slice(accountMarkup.indexOf('id="accountSession"'));
assert.ok(accountMarkup.includes('id="accountSession"')&&sessionMarkup.includes('<h3 id="accountSessionTitle">Session</h3>')&&
 sessionMarkup.indexOf('id="logout"')>0&&sessionMarkup.indexOf('id="logout"')<sessionMarkup.indexOf('</section>'),
 "logout must be inside the account Session card");
assert.match(app,/<button id="logout" type="button" class="btn ghost">Se déconnecter<\/button>/);
assert.equal((app.match(/id="logout"/g)||[]).length,1);
assert.match(inline,/toggleCountry\(dashboardFilters,code\)/);
assert.match(inline,/path\[data-country\]/);
assert.match(inline,/setAttribute\("aria-pressed"/);
for(const id of ["filterCountry","filterYear","filterPurpose","filterScope","resetFilters","filterStatus"]){
 assert.match(app,new RegExp('id="'+id+'"'));
}
assert.ok(app.includes('<script src="./dashboard-filters.js"></script>'));
const sw=fs.readFileSync("travel/sw.js","utf8");
assert.ok(sw.includes("./dashboard-filters.js")&&sw.includes("./dashboard-filters.css"));
assert.match(sw,/beam-travel-shell-v1-20261101-family-a5-portrait-ten-photos-1500px-no-photo-fallback-v8/);
assert.ok(!sw.includes('beam-travel-shell-v1-20261030'),
 "PWA cache must not regress to the old static shell");

console.log("PASS dashboard filter composition, country toggle, profile header, account Session logout and PDF isolation");
