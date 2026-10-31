"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const journal=require("../travel/printable-journal.js");
const FILTERS=require("../travel/dashboard-filters.js");
const PDF=require("../travel/factual-pdf.js");
const NOTICE="Document personnel, non destiné aux démarches administratives";
assert.equal(journal.NOTICE,NOTICE);
assert.equal(journal.MAX_PHOTOS_PER_TRIP,4);
assert.ok(journal.SIGNED_SECONDS>0 && journal.SIGNED_SECONDS<=180);
const trips=[
 {id:"1",country_code:"SN",cities:["Dakar"],entry_date:"2026-04-01",exit_date:"2026-04-08",duration_days:8,purpose:"tourisme",note:"Mon souvenir de Dakar",is_domestic:false},
 {id:"2",country_code:"GN",cities:["Kindia"],entry_date:"2025-03-01",exit_date:"2025-03-02",duration_days:2,purpose:"famille",note:"Mon séjour à Kindia",is_domestic:true},
 {id:"3",country_code:"FR",cities:["Paris"],entry_date:"2026-03-01",exit_date:"2026-03-05",duration_days:5,purpose:"affaires",note:"Voyage professionnel",is_domestic:false}
];
assert.deepEqual(FILTERS.apply(trips,{country:"SN",year:"2026"}).map(x=>x.id),["1"]);
assert.deepEqual(FILTERS.apply(trips,FILTERS.EMPTY).map(x=>x.id),["1","2","3"]);
assert.equal(journal.filterLabel({country:"SN",year:"2026"}),"Sénégal · 2026");
assert.equal(journal.filterLabel({scope:"domestic"}),"Séjours nationaux");
assert.equal(journal.filterLabel(FILTERS.EMPTY),"Tous les voyages");
const projection=journal.viewTrip({...trips[0],
 email:"SECRET_EMAIL",passport:"SECRET_PASSPORT",phone:"SECRET_PHONE",
 storage_path:"SECRET_STORAGE_PATH",user_id:"SECRET_USER",document_number:"SECRET_DOCUMENT"},
 [{title:"Visite du marché",place:"Dakar",happened_on:"2026-04-03",document_number:"SECRET_DOC"}],
 ["https://example.invalid/photo.webp"]);
assert.deepEqual(Object.keys(projection).sort(),
 ["country","cities","entry","exit","duration","purpose","domestic","memory","activities","photos"].sort());
assert.ok(!JSON.stringify(projection).includes("SECRET_"));
assert.equal(projection.memory,"Mon souvenir de Dakar");
assert.equal(projection.activities[0].title,"Visite du marché");
assert.equal(journal.viewTrip(trips[1]).domestic,true);
assert.equal(journal.viewTrip(trips[1]).country,"Guinée");
const main=fs.readFileSync("travel/index.html","utf8");
const inline=main.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline);
assert.match(main,/id="printJournal"/);
assert.match(main,/src="\.\/printable-journal\.js"/);
assert.match(inline,/BEAM_PERSONAL_JOURNAL\.render\(tab\.document/);
assert.match(inline,/BEAM_DASHBOARD_FILTERS\.apply\(rows,filters\)/);
assert.match(inline,/\.createSignedUrl\(row\.storage_path,window\.BEAM_PERSONAL_JOURNAL\.SIGNED_SECONDS\)/);
assert.match(inline,/BEAM_VISUAL_CARDS\.trustedSignedUrl/);
assert.match(inline,/\.eq\("user_id",uid\)\.eq\("deleting",false\)/);
assert.match(inline,/\.from\("activities"\)\.select\("title,place,happened_on"\)/);
assert.match(inline,/\.from\("media"\)\.select\("id,storage_path"\)/);
assert.match(inline,/window\.BEAM_TRAVEL_PDF\.fetchRows\(S,uid\)/);
const printHandler=inline.slice(inline.indexOf('$("#printJournal").onclick'),inline.indexOf('$("#pdf").onclick'));
assert.ok(!/BEAM_TRAVEL_PDF\.render|travel_history_pdf/.test(printHandler),
 "printable journal must not render factual PDF");
const factualHandler=inline.slice(inline.indexOf('$("#pdf").onclick'),inline.indexOf("if(S)S.auth.onAuthStateChange"));
assert.ok(!/printJournal|BEAM_PERSONAL_JOURNAL|dashboardFilters/.test(factualHandler),
 "factual PDF must not depend on journal or dashboard filters");
assert.equal(PDF.VIEW,"travel_history_pdf");
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
const sw=fs.readFileSync("travel/sw.js","utf8");
assert.ok(sw.includes('"./printable-journal.js"'));
assert.ok(sw.includes("20261031-personal-journal"));
assert.ok(!sw.includes("storage/v1/object/sign")&&!sw.includes("signedUrl"));
assert.match(sw,/url\.origin === self\.location\.origin/);
assert.match(sw,/url\.search === ""/);
assert.match(sw,/SAFE_PATHS\.has\(url\.pathname\)/);
assert.ok(!/\.from\("media"\)\.remove|storage\.from\("media"\)\.remove/.test(printHandler));
const visual=fs.readFileSync("travel/visual-cards.js","utf8");
assert.ok(visual.includes("Séjour national"));
assert.ok(main.includes('<option value="">Tous les types</option>'));
assert.ok(main.includes('function countryCounts(){let m=new Map();const api=window.BEAM_DASHBOARD_FILTERS;'));
console.log("PASS separate private journal, filter snapshot, safe allowlist, signed-only URLs, no SW caching, factual PDF isolated");
