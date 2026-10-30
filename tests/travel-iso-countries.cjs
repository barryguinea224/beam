"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const C=require("../travel/countries.js");
const PDF=require("../travel/factual-pdf.js");
const html=fs.readFileSync("travel/index.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
new vm.Script(script,{filename:"travel/index.html"});
const codes=Object.keys(C.NAMES);
assert.equal(codes.length,249,"Must list 249 official alpha-2 country and territory codes");
assert.equal(new Set(codes).size,249);
assert.ok(codes.every(code=>/^[A-Z]{2}$/.test(code)&&C.NAMES[code].trim()));
for(const code of ["GN","SA","GF","GP","MQ","RE","SG","BH","MT","US","SE"]){
 assert.ok(C.has(code),"Missing "+code);
}
for(const invalid of ["ZZ","XK","UK","","XX","US-CA","sa","__proto__"]){
 assert.equal(C.has(invalid),false,"Invalid code accepted: "+invalid);
}
assert.equal(C.NAMES.SA,"Arabie saoudite");
assert.equal(C.NAMES.GF,"Guyane française");
assert.equal(C.NAMES.GP,"Guadeloupe");
assert.equal(C.NAMES.MQ,"Martinique");
assert.equal(C.NAMES.RE,"La Réunion");
assert.ok(C.search("ara").includes("SA"));
assert.ok(C.search("etats").includes("US"));
assert.ok(C.search("cote").includes("CI"));
assert.ok(C.search("reunion").includes("RE"));
assert.deepEqual(C.search("aucunpaysxxxxx"),[]);
assert.deepEqual(C.ordered().slice(0,C.POPULAR.length),C.POPULAR);
assert.equal(new Set(C.ordered()).size,249);
assert.equal(PDF.factualRows([{country_code:"SA",cities:["Djeddah"],entry_date:"2026-01-01",exit_date:"2026-01-03",duration_days:3,purpose:"tourisme"}])[0].country,C.NAMES.SA);
assert.equal(PDF.factualRows([{country_code:"RE",cities:["Saint-Denis"],entry_date:"2026-01-01",exit_date:"2026-01-03",duration_days:3,purpose:"tourisme"}])[0].country,C.NAMES.RE);
assert.ok(script.includes('if(!window.BEAM_COUNTRIES.has(p.country_code))'),"Unknown code must not be stored");
assert.ok(script.includes('if(value&&!window.BEAM_COUNTRIES.has(value))'),"Unknown residence must be rejected");
assert.ok(html.includes('id="tripCountrySearch"')&&html.includes('id="residenceSearch"'),"Search fields missing");
assert.ok(html.indexOf('src="./countries.js"')<html.indexOf('src="./country-picker.js"'));
assert.ok(html.indexOf('src="./country-picker.js"')<html.indexOf("<script>"));
assert.ok(script.includes('tripCountryPicker.setValue(x.country_code)'),"Editing selection must restore ISO code");
assert.ok(script.includes('tripCountryPicker.setValue("")'),"New trip must reset search");
assert.ok(script.includes('residencePicker.setValue(profile.country_of_residence||"")'),"Saved residence must load");
assert.ok(script.includes('map(c=>$("#map-"+CSS.escape(c))).filter(Boolean)'),"Small territory without polygon must not break map");
assert.ok(script.includes('$("#countryList").innerHTML=[...counts]'),"All visited territories must have chips");
console.log("BEAM ISO249 PASS: names, common data, accent search, invalid codes, small island map fallback");
