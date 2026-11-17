"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const CONTINENTS=require("../travel/continents.js");
const FR=require("../travel/fr-accords.js");
const trip=(country_code,entry_date,stops=[])=>({
 country_code,entry_date,exit_date:"2026-11-10",stops,deleting:false
});
const now="2026-11-17";
assert.equal(CONTINENTS.fromCodes(["GN","FR","JP","US"]),4,"Guinea, France, Japan, USA cross 4 continents");
assert.equal(CONTINENTS.fromCodes(["GN","GN","FR"]),2);
assert.equal(CONTINENTS.count([
 trip("GN","2026-01-01"),trip("FR","2026-02-01"),trip("JP","2026-03-01"),
 trip("US","2026-04-01")
],now),4);
assert.equal(CONTINENTS.count([
 trip("FR","2025-01-01",[
  {country_code:"US",entry_date:"2026-01-01"},
  {country_code:"JP",entry_date:"2027-01-01"}])
],now),2,"Future stops do not count yet");
assert.equal(CONTINENTS.count([trip("JP","2027-01-01")],now),0,"Future trips do not count");
assert.equal(CONTINENTS.count([trip("JP","2025-01-01"),{...trip("FR","2025-01-01"),deleting:true}],now),1);
assert.equal(CONTINENTS.count([],now),0);
assert.equal(FR.count(0,"continent"),"0 continent");
assert.equal(FR.count(1,"continent"),"1 continent");
assert.equal(FR.count(4,"continent"),"4 continents");
const source=fs.readFileSync(path.resolve(__dirname,"../travel/index.html"),"utf8");
const sw=fs.readFileSync(path.resolve(__dirname,"../travel/sw.js"),"utf8");
const css=fs.readFileSync(path.resolve(__dirname,"../travel/passport-home.css"),"utf8");
for(const id of ["passportResidenceCode","travelerLocation","continentCount","detailSlideshowOpen",
 "detailSlideshowClose","slideCounter","slideCaption","slideImageBox"]){
 assert.ok(source.includes('id="'+id+'"'),"Missing "+id);
}
assert.match(sw,/jyetais-v60-passeport-diaporama/);
for(const asset of ["continents.js","trip-slideshow.js","passport-home.css"]){
 assert.ok(sw.includes('./'+asset),"Precache "+asset);
}
assert.doesNotMatch(css,/font-family:\s*[^;]*(?:Georgia|Times New Roman|serif)/i);
assert.match(css,/#C9962E/);
assert.match(css,/prefers-reduced-motion/);
const home=source.match(/<section id="travelHero"[\s\S]*?<\/section>/)?.[0]||"";
const actions=source.match(/<section id="homeActions"[\s\S]*?<\/section>/)?.[0]||"";
assert.doesNotMatch(home,/Officiel|Attestation|Certifié/i);
assert.doesNotMatch(actions,/Officiel|Attestation|Certifié/i);
console.log("PASS local continent catalogue / future journeys / home contracts / PWA cache");
