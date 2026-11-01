"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const journal=require("../travel/printable-journal.js");
const FILTERS=require("../travel/dashboard-filters.js");
const PDF=require("../travel/factual-pdf.js");
const NOTICE="Document personnel, non destiné aux démarches administratives";
assert.equal(journal.NOTICE,"");
assert.ok(!fs.readFileSync("travel/printable-journal.js","utf8").includes(NOTICE));
assert.equal(journal.MAX_PHOTOS_PER_TRIP,4);
assert.equal(journal.SIGNED_SECONDS,300,"slow mobile connections need five-minute photo signatures");
const calls=[],query={
 order(field,options){calls.push(["order",field,options.ascending]);return this},
 limit(n){calls.push(["limit",n]);return this}
};
assert.equal(journal.preferredMediaQuery(query),query);
assert.deepEqual(calls,[
 ["order","is_favorite",false],
 ["order","position",true],
 ["order","created_at",true],
 ["limit",4]
],"four print photos must favor favorites, then owner position, then creation date");
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
 email:"SECRET_EMAIL",passport:"SECRET_PASSPORT",phone:"SECRET_PHONE",postal_address:"SECRET_POSTAL_ADDRESS",
 storage_path:"SECRET_STORAGE_PATH",user_id:"SECRET_USER",document_number:"SECRET_DOCUMENT"},
 [{title:"Visite du marché",place:"Dakar",happened_on:"2026-04-03",document_number:"SECRET_DOC"}],
 ["https://example.invalid/photo.webp"]);
assert.deepEqual(Object.keys(projection).sort(),
 ["code","country","cities","entry","exit","entryISO","exitISO","duration","days","purpose","domestic","memory","activities","photos"].sort());
assert.ok(!JSON.stringify(projection).includes("SECRET_"));
assert.equal(projection.memory,"Mon souvenir de Dakar");
assert.equal(projection.activities[0].title,"Visite du marché");
assert.equal(journal.viewTrip(trips[1]).domestic,true);
assert.equal(journal.viewTrip(trips[1]).country,"Guinée");
assert.equal(journal.period(trips.map(t=>journal.viewTrip(t))),"2025 – 2026");
assert.equal(journal.period([journal.viewTrip(trips[0])]),"2026");
assert.equal(journal.titleForName("Elhadj Barry"),"Carnet d'Elhadj Barry");
assert.equal(journal.titleForName("Alpha Barry"),"Carnet d'Alpha Barry");
assert.equal(journal.titleForName("Hélène"),"Carnet d'Hélène");
assert.equal(journal.titleForName("Barry"),"Carnet de Barry");
for(const name of ["Youssouf","Yaya","Yacouba","Yÿoussouf"])
 assert.equal(journal.titleForName(name),"Carnet de "+name);
for(const name of ["Elhadj","Aminata","Ousmane"])
 assert.equal(journal.titleForName(name),"Carnet d'"+name);
assert.equal(journal.titleForName(""),"Mon carnet de voyage");
const album=fs.readFileSync("travel/printable-journal.js","utf8");
for(const marker of ["Mon année en voyages","photo-mosaic","activity-timeline",
 "ink-saver","Économie d’encre","atlas-visited","Carnet généré le"]){
 assert.ok(album.includes(marker),"visual album element missing: "+marker);
}
assert.match(album,/@page\{size:A4/, "A4 must be explicitly forced");
assert.ok(!album.includes("@top-center")&&!album.includes("@bottom-center"));
assert.ok(!/\.innerHTML\s*=|document\.write\s*\(/.test(album),
 "journal must insert only DOM text and controlled local SVG paths");
assert.match(album,/doc\.createElementNS/);
assert.match(album,/map\(yearbook,model\.mapSvgText/);
assert.match(album,/limitReached/, "exhaustion of photo quota must be announced");
assert.match(album,/fitAtlasToVisited\(svg\)/, "visited countries map must zoom");
assert.match(album,/svg\.setAttribute\("viewBox",\[x,y,bw,bh\]/,
 "atlas viewBox must be derived from visited bounds");
assert.match(album,/model\.trips\.find\(t=>typeof t\.favoritePhoto/,
 "album cover must prefer a favorite from any selected trip");
assert.match(album,/list\.find\(t=>t\.photos\.length\)/,
 "album cover must fall back to any available signed photo");
assert.match(album,/trip\.photos\.length>=2\|\|trip\.memory\.length>500\|\|trip\.activities\.length>8/,
 "short trips must be compact, rich trips may span two pages");
assert.match(album,/height:35mm/, "travel without photographs must have a short ribbon");
assert.match(album,/trip\.cities\.split\(","\)\[0\]/, "timeline needs the first city");
assert.ok(album.includes('"jour"+(summaryDays===1?"":"s")'),
 "number of days must be singular when value is one");
const source=fs.readFileSync("travel/printable-journal.js","utf8");
assert.match(source,/img\.naturalWidth>0/, "complete=true is not proof of successful photo loading");
assert.match(source,/photos n'ont pas pu être chargées/, "missing photo count must be visible");
assert.match(source,/img\.remove\(\)/, "broken photo must be replaced by a printable placeholder");
assert.match(source,/setTimeout\(\(\)=>settle\(false\),30000\)/, "slow mobile photo wait must be bounded");
assert.match(source,/initialFailed\+results\.filter\(x=>!x\)\.length/,
 "the warning must include both signing errors and failed image loads");
const main=fs.readFileSync("travel/index.html","utf8");
const inline=main.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline);
assert.match(main,/id="printJournal"/);
assert.match(main,/src="\.\/printable-journal\.js"/);
assert.match(main,/src="\.\/family-booklet\.js"/);
assert.match(inline,/BEAM_FAMILY_BOOKLET\.render\(tab\.document/);
assert.match(inline,/BEAM_DASHBOARD_FILTERS\.apply\(rows,filters\)/);
assert.match(inline,/\.createSignedUrl\(row\.storage_path,window\.BEAM_PERSONAL_JOURNAL\.SIGNED_SECONDS\)/);
assert.match(inline,/BEAM_VISUAL_CARDS\.trustedSignedUrl/);
assert.match(inline,/\.eq\("user_id",uid\)\.eq\("deleting",false\)/);
assert.match(inline,/\.from\("activities"\)\.select\("title,place,happened_on"\)/);
assert.match(inline,/\.from\("media"\)\.select\("id,storage_path,is_favorite"\)/);
assert.match(inline,/if\(row\.is_favorite&&!favoritePhoto\)favoritePhoto=safe/);
assert.match(inline,/BEAM_PERSONAL_JOURNAL\?\.titleForName\?\.\(name\)/,
 "dashboard may consult album but cannot require it");
assert.match(inline,/function travelDashboardTitle\(input\)/,
 "dashboard title fallback must exist independently");
assert.match(inline,/heading\.textContent=clean\|\|"Voyageur"/,
 "the profile heading now shows the actual declared name with no booklet prefix");
assert.match(inline,/\$\("#travelerAvatar"\)\.textContent=travelerInitials\(clean\)/,
 "initials-only avatar must use the already-loaded profile; not a photo");
assert.match(inline,/setDashboardTitle\(data\.display_name\)/,"saved full name must update the responsive dashboard title");
assert.match(inline,/function setDashboardTitle\(name\)/,"name rendering must use the shared no-truncation helper");
assert.match(inline,/window\.BEAM_FAMILY_BOOKLET\?\.render/,
 "missing optional album must disable printing without crashing the dashboard");
assert.match(inline,/BEAM_FAMILY_BOOKLET\.preferredMediaQuery\(/,
 "family booklet must query ten ordered private photos independently of journal four-photo quota");
assert.match(inline,/BEAM_FAMILY_BOOKLET\.preparePhotos\(pack,window\)/,
 "family booklet must resample trusted signed images only in browser RAM before print");
assert.match(inline,/pack\[position\]=\{trip,activities:activityResult\.data\|\|\[\],photos,favoritePhoto,missingPhotos\}/,
 "failed photo signatures must reach the private print status");
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
assert.ok(sw.includes('"./printable-journal.js"')&&sw.includes('"./family-booklet.js"'));
assert.match(sw,/beam-travel-shell-v1-20261101-family-a5-portrait-ten-photos-1500px-v6/,"cache revision must match the rebased booklet release");
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
