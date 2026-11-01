"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const countries=require("../travel/countries.js");
const html=fs.readFileSync("travel/index.html","utf8");
const pdf=fs.readFileSync("travel/factual-pdf.js","utf8");
const writer=fs.readFileSync("travel/factual-pdf-file.js","utf8");
const journal=fs.readFileSync("travel/printable-journal.js","utf8");
const manifest=JSON.parse(fs.readFileSync("travel/manifest.webmanifest","utf8"));
assert.equal(countries.ORDER.length,249);
for(const code of countries.ORDER){
 const file=path.join("travel/assets/flags",code.toLowerCase()+".svg");
 assert.ok(fs.existsSync(file),"Missing local flag "+code);
 const image=fs.readFileSync(file,"utf8");
 assert.match(image,/<svg\b[^>]*[\s\S]*<\/svg>/i,code+" must be SVG");
 assert.ok(!/\b(?:href|src)\s*=\s*["']https?:\/\//i.test(image)&&!/url\(\s*["']?https?:\/\//i.test(image),"Remote SVG reference not allowed: "+code);
}
assert.ok(fs.existsSync("travel/assets/flags/LICENSE.flag-icons"));
assert.equal(manifest.name,"BEAM Travel History");
assert.equal(manifest.short_name,"BTH");
assert.match(html,/<meta name="apple-mobile-web-app-title" content="BTH">/);
assert.match(html,/<aside class="authContact" aria-label="Contact">/);
assert.match(html,/<a href="https:\/\/wa\.me\/224622095630"[^>]*>\+224 622 09 56 30<\/a>/);
const appHeader=html.match(/<main id="app"[^>]*>[\s\S]*?<\/header>/)?.[0]||"";
assert.ok(!appHeader.includes("BEAM"),"Connected client header must be unbranded");
assert.equal((html.match(/id="saveContactDetails"/g)||[]).length,1);
assert.equal((html.match(/id="saveTravelerName"/g)||[]).length,0,"Single visible account save button only");
assert.match(html,/\.update\(\{display_name:name,phone:phone\|\|null,postal_address:address\|\|null,country_of_residence:residence\}\)/);
assert.match(html,/id="includePdfContacts" type="checkbox"/);
for(const forbidden of ["BEAM · TRAVEL HISTORY","BEAM - Travel History PDF","BEAM-Travel-History.pdf"]){
 assert.ok(!pdf.includes('"'+forbidden+'"'),"PDF output label still branded: "+forbidden);
 assert.ok(!writer.includes('textAt("'+forbidden+'"'),"PDF file output still branded: "+forbidden);
}
assert.ok(!journal.includes('"BEAM · TRAVEL HISTORY"'));
assert.ok(!journal.includes('"BEAM · EN IMAGES"'));
assert.ok(!journal.includes('" par BEAM Travel History"'));
assert.equal(require("../travel/factual-pdf.js").filenameForName("Fatou Diallo"),"Historique-de-voyages-Fatou-Diallo.pdf");
assert.equal(require("../travel/factual-pdf.js").filenameForName("Élodie D’Été"),"Historique-de-voyages-Elodie-D-Ete.pdf");
console.log("PASS client-owned UI, unified profile save, offline-local 249 flag SVG, neutral PDFs and PWA names");
