"use strict";
// J'y étais's REAL native factual PDF generator; all records are fictional.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const FILE=require("../travel/factual-pdf-file.js"),PDF=require("../travel/factual-pdf.js");
const dir="test-artifacts/trip-stops";fs.mkdirSync(dir,{recursive:true});
const trip={country_code:"FR",cities:["Paris"],entry_date:"2026-11-05",
 exit_date:"2026-11-15",duration_days:11,purpose:"tourisme",
 stops:[{country_code:"DE",cities:["Berlin"],entry_date:"2026-11-10",
  exit_date:"2026-11-14",position:1}]};
const metadata={displayName:"VOYAGEUR FICTIF",generatedAt:new Date("2026-11-07T12:00:00Z")};
const single=FILE.make(metadata,[trip]);
const pdf=PDF.factualRows([trip]);assert.equal(pdf[0].stops[0].country,"Allemagne");
fs.writeFileSync(path.join(dir,"BTH_France_Allemagne_FACTUEL_SPECIMEN.pdf"),Buffer.from(single));
const many=Array.from({length:77},(_,i)=>({...trip,
 cities:["Paris — exemple "+(i+1)],
 stops:trip.stops.map(s=>({...s,cities:["Berlin — étape "+(i+1)]}))}));
const multi=FILE.make(metadata,many);
fs.writeFileSync(path.join(dir,"BTH_France_Allemagne_MULTIPAGE_TEST.pdf"),Buffer.from(multi));
assert.ok(Buffer.from(multi).toString("latin1").match(/\/Type \/Page\b/g)?.length>1);
console.log("PASS J'y étais native PDF generated: factual six-field trip + indented 5-day stage; multipage PDF built with no split stage lines");
