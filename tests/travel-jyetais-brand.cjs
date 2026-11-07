"use strict";
// Public brand contract: legacy labels are forbidden; internal APIs stay untouched.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const app=read("travel/index.html");
const home=read("index.html");
const sw=read("travel/sw.js");
const pdfHtml=read("travel/factual-pdf.js");
const manifest=JSON.parse(read("travel/manifest.webmanifest"));
const code=fs.readdirSync(path.join(root,"travel")).filter(name=>/\.(?:js|html)$/.test(name))
 .map(name=>"travel/"+name);
const published=[...code,"index.html","scripts/build-visas.cjs"];
for(const file of published){
 const text=read(file);
 assert.doesNotMatch(text,/BEAM Travel History|\bBTH\b/i,
   "Retired label in publicly served/generating file: "+file);
}
// Exceptions are technical-only, never user labels, and must retain their names:
// BEAM_TRAVEL_CONFIG, BEAM_TRAVEL_PDF, BEAM_FAMILY_BOOKLET,
// BEAM_PERSONAL_JOURNAL, BEAM_CLEAR_PUBLIC_SHELL, beam-travel-shell-*,
// Supabase schema/function/table names, existing client storage keys.
assert.match(app,/window\.BEAM_TRAVEL_CONFIG/);
assert.match(app,/BEAM_FAMILY_BOOKLET/);
assert.match(sw,/beam-travel-shell-v1-20261107-jyetais-v39-settings/);
assert.match(sw,/BEAM_CLEAR_PUBLIC_SHELL/);
assert.match(app,/<img class="jyBrandLogo jyAuthLogo" src="\.\/assets\/brand\/jyetais-logo\.svg"/);
assert.match(app,/<img class="jyBrandLogo jyHeaderLogo" src="\.\/assets\/brand\/jyetais-logo\.svg"/);
assert.match(app,/<link rel="icon" type="image\/svg\+xml" href="\/travel\/assets\/brand\/jyetais-icon\.svg">/);
assert.match(app,/rel="apple-touch-icon" href="\/travel\/assets\/brand\/icon-192\.png"/);
assert.match(app,/J&#39;y étais by BEAM/);
assert.match(app,/document\.title="J'y étais"/);
assert.match(home,/J&#39;y étais/);
assert.match(read("scripts/build-visas.cjs"),/J&#39;y étais/);
assert.equal(manifest.id,"/travel/");
assert.equal(manifest.name,"J'y étais");
assert.equal(manifest.short_name,"J'y étais");
assert.equal(manifest.start_url,"/travel/");
assert.equal(manifest.scope,"/travel/");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.icons.length,3);
for(const [file,size,purpose] of [
 ["icon-192.png",192,"any"],["icon-512.png",512,"any"],["icon-maskable-512.png",512,"maskable"]
]){
 const url="/travel/assets/brand/"+file;
 const entry=manifest.icons.find(icon=>icon.src===url);
 assert.ok(entry,"Manifest icon missing: "+file);
 assert.equal(entry.sizes,size+"x"+size);
 assert.equal(entry.type,"image/png");
 assert.equal(entry.purpose,purpose);
 const bytes=fs.readFileSync(path.join(root,"travel/assets/brand",file));
 assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.equal(bytes.readUInt32BE(16),size);
 assert.equal(bytes.readUInt32BE(20),size);
 assert.ok(sw.includes('"./assets/brand/'+file+'"'),"Not precached: "+file);
}
for(const file of ["jyetais-logo.svg","jyetais-icon.svg"]){
 assert.match(read("travel/assets/brand/"+file),/<svg\b/);
 assert.ok(sw.includes('"./assets/brand/'+file+'"'),"Not precached: "+file);
}
const mail=read("travel/supabase/EMAIL_TEMPLATE_JYETAIS.md");
assert.ok(mail.includes("{{ .Token }}"));
assert.ok(mail.includes("staging")&&mail.includes("production"));
assert.doesNotMatch(mail,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN/);
for(const file of ["travel/confidentialite.html","travel/conditions.html"]){
 const text=read(file);
 assert.ok(text.includes("J&#39;y étais by BEAM"),"Legal footer signature: "+file);
}
assert.match(read("travel/printable-journal.js"),/el\(closing,"p","brand-signature","J'y étais"\)/);
assert.match(read("travel/family-booklet.js"),/J'y étais by BEAM/);
// Both factual PDF paths must be branded J'y étais but never BEAM.
assert.match(pdfHtml,/J'y étais — Historique de voyages/);
const FILE=require("../travel/factual-pdf-file.js");
const bytes=Buffer.from(FILE.make({
 displayName:"Voyageur fictif",generatedAt:new Date("2026-11-07T09:00:00Z")
},[{country_code:"SN",cities:["Dakar"],entry_date:"2026-01-01",
 exit_date:"2026-01-02",duration_days:2,purpose:"tourisme"}]));
const raw=bytes.toString("latin1");
assert.match(raw,/\/Title \(J'y étais - Historique de voyages\)/);
assert.match(raw,/\/Creator \(J'y étais\)/);
assert.match(raw,/\/Producer \(J'y étais\)/);
assert.match(raw,/\/Info \d+ 0 R/);
assert.doesNotMatch(raw,/BEAM|jyetais-logo|\/Subtype \/Image/);
console.log("PASS J'y étais: public labels, PWA icons + cache, legal footer, email, factual PDF metadata without BEAM");
