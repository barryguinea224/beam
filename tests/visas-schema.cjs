"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {
 validateEntry,buildSite,renderDestination,renderHome,modeFor,
 isStale,needsReview,parseDate,esc,todayUTC,DISCLAIMER
}=require("../scripts/build-visas.cjs");
const root=path.resolve(__dirname,"..");
const travelBuilder=require("../scripts/build-travel-config.cjs");
// Synthetic, nonfunctional PUBLIC placeholder constructed only during tests.
const travelFixtureEnv={
 NETLIFY:"true",CONTEXT:"deploy-preview",
 BEAM_TRAVEL_STAGING_PUBLIC_KEY:["sb","publishable","ci_fixture_only"].join("_")
};
const travelBuildBaseline=travelBuilder.render(travelFixtureEnv);
const input=JSON.parse(fs.readFileSync(path.join(root,"visas/data/france.json"),"utf8"));
const deep=value=>JSON.parse(JSON.stringify(value));
const today=todayUTC();
function bad(modify,match) {
 const obj=deep(input);modify(obj);
 assert.throws(()=>validateEntry(obj,"france",{today,mode:"preview"}),match);
}
// Required-field contract (including each nested array type and metadata).
for(const name of ["destination","drapeau","statut","verifie_le","types_visa"]){
 bad(o=>delete o[name],/champ obligatoire manquant/);
}
for(const name of ["type","autorite_competente","lieu_depot","conditions_demandeur","documents","frais","delai_indicatif","sources"]){
 bad(o=>delete o.types_visa[0][name],/champ obligatoire manquant/);
}
bad(o=>delete o.types_visa[0].autorite_competente.pays,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].lieu_depot.adresse,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].lieu_depot.rendez_vous_url,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].conditions_demandeur.public_cible,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].documents[0].note,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].frais.verifie_le,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].delai_indicatif.verifie_le,/champ obligatoire manquant/);
bad(o=>delete o.types_visa[0].sources[0].url,/champ obligatoire manquant/);
bad(o=>o.types_visa=[],/au moins un type/);
bad(o=>o.types_visa[0].documents=[],/au moins un document/);
bad(o=>o.types_visa[0].sources=[],/au moins une source/);
bad(o=>o.types_visa[0].documents[0].statut="inconnu",/obligatoire ou selon_le_cas/);
bad(o=>o.types_visa[0].lieu_depot.categorie="annuaire_quelconque",/type de lieu invalide/);
bad(o=>o.types_visa[0].conditions_demandeur.autres_cas="",/texte prudent obligatoire/);
bad(o=>o.destination=" ",/non vide/);
bad(o=>o.une_faute_de_frappe=true,/champ inconnu/);
for(const url of ["http://www.france-visas.gouv.fr/","//www.france-visas.gouv.fr/","javascript:alert(1)","https://person:pass@www.france-visas.gouv.fr/","https://example.com/a b"]){
 bad(o=>o.types_visa[0].sources[0].url=url,/HTTPS|URL/);
}
bad(o=>o.types_visa[0].lieu_depot.rendez_vous_url="http://example.com/prise-rdv",/HTTPS/);
const future=new Date(Date.parse(today+"T00:00:00Z")+86400000).toISOString().slice(0,10);
for(const setter of [
 o=>o.verifie_le=future,
 o=>o.types_visa[0].frais.verifie_le=future,
 o=>o.types_visa[0].delai_indicatif.verifie_le=future,
])bad(setter,/date future interdite/);
bad(o=>o.verifie_le="2026-02-30",/date calendaire invalide/);
bad(o=>o.verifie_le="2026/11/02",/format AAAA-MM-JJ/);
assert.throws(()=>validateEntry(input,"../france",{today}),/nom de fichier dangereux/);
assert.equal(modeFor(["--production"],{}),"production");
assert.equal(modeFor(["--check"],{}),"check");
assert.equal(modeFor(["--check"],{CONTEXT:"production"}),"production");
assert.equal(modeFor(["--preview"],{}),"preview");
assert.equal(modeFor(["--preview"],{CONTEXT:"production"}),"production",
 "a preview flag cannot bypass Netlify production strictness");
assert.throws(()=>modeFor(["--preview","--production"],{}),/modes contradictoires/);
assert.doesNotThrow(()=>validateEntry(input,"france",{today,mode:"preview"}),
 "an explicitly labeled sample is valid input for preview and CI check");
const stillExample=deep(input);stillExample.statut="publie";
assert.throws(()=>validateEntry(stillExample,"france",{today,mode:"check"}),/EXEMPLE/,
 "published status with unfinished example text must fail strict validation");

// Only synthetic validation data here, NEVER a published visa claim or page.
const mock=deep(input);
mock.statut="publie";mock.verifie_le=today;
const v=mock.types_visa[0];
v.type="Type de test";
v.autorite_competente={nom:"Institution fictive de test",ville:"Ville de test",pays:"Pays de test"};
v.lieu_depot={categorie:"ambassade",nom:"Lieu fictif",adresse:"Adresse fictive",rendez_vous_url:"https://www.france-visas.gouv.fr/"};
v.conditions_demandeur.public_cible="Personne fictive de test";
v.documents[0]={libelle:"Pièce fictive de test",statut:"obligatoire",note:"Ceci ne doit pas être publié"};
v.frais={texte:"Montant fictif de test",verifie_le:today};
v.delai_indicatif={texte:"Délai fictif de test",verifie_le:today};
assert.doesNotThrow(()=>validateEntry(mock,"france",{today,mode:"production"}));
assert.equal(isStale("2000-01-01",today),true);
assert.equal(isStale(today,today),false);
assert.equal(isStale(today,today),false);
const staleFees=deep(mock);staleFees.types_visa[0].frais.verifie_le="2000-01-01";
assert.equal(needsReview(staleFees,today),true,
 "a stale fee verification must trigger the warning even when the overall fiche is recent");
assert.ok(renderDestination(staleFees,"france",today).includes("Informations à revérifier"));
assert.ok(renderHome([{slug:"france",entry:staleFees}],today).includes("Informations à revérifier"));
assert.ok(renderDestination(input,"france",today).includes("Informations à revérifier"));
assert.ok(!renderDestination(mock,"france",today).includes("Informations à revérifier"));
assert.ok(renderHome([{slug:"france",entry:input}],today).includes("Informations à revérifier"));

// Render safe text (even malicious editor content is escaped).
const hostile=deep(input);
hostile.destination='<img src=x onerror="alert(1)">';
const html=renderDestination(hostile,"france",today);
assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
assert.ok(!html.includes('<img src=x onerror='));
assert.ok(html.includes(DISCLAIMER.replace(/'/g,"&#39;")) || html.includes("Seule l'ambassade décide."));
assert.ok(html.includes("224622095630"));
assert.ok(html.includes("/travel/"));
assert.ok(html.includes('class="button primary"'));
assert.ok(!/<script\b/i.test(html));
assert.ok(!/<iframe\b/i.test(html));
assert.ok(!/<form\b/i.test(html));
assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
assert.ok(esc("&<>\"'") === "&amp;&lt;&gt;&quot;&#39;");

// The guide may be incomplete: Netlify production must still deploy BTH.
// Strict CI (--check) rejects *any* invalid schema/date/URL, even if the
// production renderer could have omitted the invalid entry.
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"beam-visa-build-"));
const log={warnings:[],messages:[],warn(value){this.warnings.push(value)},log(value){this.messages.push(value)}};
const guideRoot=path.join(scratch,"visas");
const sub=path.join(guideRoot,"data");
const travelConfig=path.join(scratch,"travel/config.js");
try{
 fs.mkdirSync(sub,{recursive:true});
 fs.mkdirSync(path.dirname(travelConfig),{recursive:true});
 fs.writeFileSync(travelConfig,"// independent BTH fixture — must remain unchanged\n");
 const originalTravel=fs.readFileSync(travelConfig,"utf8");
 const assertTravelUnaffected=()=>{
   assert.equal(fs.readFileSync(travelConfig,"utf8"),originalTravel,
     "the guide must never alter the travel output");
   assert.equal(travelBuilder.render(travelFixtureEnv),travelBuildBaseline,
     "build-travel-config.cjs must render the same output regardless of visa data");
 };

 // Preview: the labeled example stays available for review, with a visible disclaimer.
 fs.writeFileSync(path.join(sub,"france.json"),JSON.stringify(input));
 const preview=buildSite({root:scratch,mode:"preview",today,logger:log});
 assert.equal(preview.html,2);
 const home=fs.readFileSync(path.join(guideRoot,"index.html"),"utf8");
 const detail=fs.readFileSync(path.join(guideRoot,"france/index.html"),"utf8");
 for(const page of [home,detail]){
  assert.match(page,/EXEMPLE — NON VÉRIFIÉ/);
  assert.match(page,/Seule l&#39;ambassade décide/);
  assert.match(page,/href="\/visas\/style.css"/);
  assert.doesNotMatch(page,/<script\b|<iframe\b|<img[^>]+src="https?:/i);
  assert.ok(!page.includes("google-analytics")&&!page.includes("gtag("));
 }
 assert.match(detail,/wa\.me\/224622095630\?text=/);
 assert.match(detail,/France/);
 assert.match(detail,/href="\/travel\/"/);

 // Strict validation includes the example, but does not publish or modify files.
 const checked=buildSite({root:scratch,mode:"check",today,logger:log});
 assert.equal(checked.html,0);
 assert.equal(checked.files,1);
 assert.ok(fs.existsSync(path.join(guideRoot,"france/index.html")));

 // Production: exclude demo, remove previous preview page and show a usable
 // empty guide rather than ever failing a deploy of beamguinee.com or BTH.
 const prod=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(prod.html,1,"the fallback home is the only production page");
 assert.equal(prod.published,0);
 assert.deepEqual(prod.excluded.map(x=>x.filename),["france.json"]);
 assert.ok(prod.excluded[0].reason.includes("EXEMPLE"));
 assert.ok(log.warnings.some(x=>x.includes("france.json")&&x.includes("exclue")));
 assert.ok(log.messages.some(x=>x.includes("france.json")),"exclusions listed in production log");
 assert.equal(fs.existsSync(path.join(guideRoot,"france/index.html")),false,
  "no stale preview France page may survive a production build");
 const emptyHome=fs.readFileSync(path.join(guideRoot,"index.html"),"utf8");
 assert.match(emptyHome,/Guide en préparation/);
 assert.match(emptyHome,/Seule l&#39;ambassade décide/);
 assert.match(emptyHome,/wa\.me\/224622095630\?text=/);
 assert.match(emptyHome,/Être accompagné par BEAM/);
 assert.doesNotMatch(emptyHome,/href="\/visas\/france\/"/);
 assert.match(emptyHome,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.equal(fs.existsSync(path.join(guideRoot,"sitemap.xml")),false,
  "the guide does not currently generate a sitemap with excluded destinations");
 assertTravelUnaffected();

 // An invalid URL, date or schema must be a hard failure in strict CI mode,
 // regardless of other valid or example files.
 const invalid=deep(mock);
 invalid.types_visa[0].sources[0].url="http://not-allowed.example/";
 fs.writeFileSync(path.join(sub,"maroc.json"),JSON.stringify(invalid));
 assert.throws(()=>buildSite({root:scratch,mode:"check",today,logger:log}),/HTTPS/);
 const strictProcess=spawnSync(process.execPath,[
  "-e", "require(process.argv[1]).buildSite({root:process.argv[2],mode:'check'});",
  path.join(root,"scripts/build-visas.cjs"),scratch
 ],{encoding:"utf8"});
 assert.notEqual(strictProcess.status,0,
  "the strict CI command must return nonzero when one fiche is invalid");
 assert.match(strictProcess.stderr,/HTTPS/);

 // Prove *each* invalid category breaks the exact strict CI execution,
 // while production safely skips it without touching the BTH output.
 for(const [label,mutate,pattern] of [
  ["future date",o=>{o.verifie_le=future},/date future interdite/],
  ["missing schema field",o=>{delete o.types_visa[0].frais},/champ obligatoire manquant/]
 ]){
  const invalidCase=deep(mock);
  mutate(invalidCase);
  fs.writeFileSync(path.join(sub,"maroc.json"),JSON.stringify(invalidCase));
  assert.throws(()=>buildSite({root:scratch,mode:"check",today,logger:log}),pattern,label);
  const strict=spawnSync(process.execPath,[
   "-e", "require(process.argv[1]).buildSite({root:process.argv[2],mode:'check'});",
   path.join(root,"scripts/build-visas.cjs"),scratch
  ],{encoding:"utf8"});
  assert.notEqual(strict.status,0,label+" must cause the real CI validator to fail");
  assert.match(strict.stderr,pattern,label+" diagnostic");
  const tolerated=buildSite({root:scratch,mode:"production",today,logger:log});
  assert.equal(tolerated.published,0,label+" must not publish an invalid fiche");
  assert.deepEqual(tolerated.excluded.map(x=>x.filename),["france.json","maroc.json"]);
  assert.ok(fs.readFileSync(path.join(guideRoot,"index.html"),"utf8").includes("Guide en préparation"));
  assertTravelUnaffected();
 }
 fs.writeFileSync(path.join(sub,"maroc.json"),JSON.stringify(invalid));

 const prodInvalid=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(prodInvalid.published,0);
 assert.deepEqual(prodInvalid.excluded.map(x=>x.filename),["france.json","maroc.json"]);
 assert.ok(log.warnings.some(x=>x.includes("maroc.json")&&x.includes("HTTPS")));
 assert.ok(fs.readFileSync(path.join(guideRoot,"index.html"),"utf8").includes("Guide en préparation"));
 assertTravelUnaffected();

 // Even invalid JSON syntax cannot fail production.
 fs.writeFileSync(path.join(sub,"maroc.json"),'{"types_visa": ');
 assert.throws(()=>buildSite({root:scratch,mode:"check",today,logger:log}),/JSON|SyntaxError/);
 const badJson=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(badJson.excluded.length,2);
 assert.equal(badJson.published,0);
 assertTravelUnaffected();

 // With a valid published fiche, it is included; an example or broken file
 // stays excluded. No unverified destination may be on the home page.
 fs.writeFileSync(path.join(sub,"maroc.json"),JSON.stringify(mock));
 const mixed=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(mixed.published,1);
 assert.deepEqual(mixed.excluded.map(x=>x.filename),["france.json"]);
 const mixedHome=fs.readFileSync(path.join(guideRoot,"index.html"),"utf8");
 assert.match(mixedHome,/href="\/visas\/maroc\/"/);
 assert.doesNotMatch(mixedHome,/href="\/visas\/france\/"/);
 assert.ok(fs.existsSync(path.join(guideRoot,"maroc/index.html")));
 assert.ok(!fs.existsSync(path.join(guideRoot,"france/index.html")));

 // If an already-published fiche goes invalid, it must lose its old
 // generated page rather than keep stale requirements online.
 fs.writeFileSync(path.join(sub,"maroc.json"),"{ invalid");
 const reverted=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(reverted.published,0);
 assert.equal(fs.existsSync(path.join(guideRoot,"maroc/index.html")),false);
 assert.match(fs.readFileSync(path.join(guideRoot,"index.html"),"utf8"),/Guide en préparation/);
 assertTravelUnaffected();

 // Removing a source JSON also removes a previously generated page.
 fs.writeFileSync(path.join(sub,"maroc.json"),JSON.stringify(mock));
 buildSite({root:scratch,mode:"production",today,logger:log});
 assert.ok(fs.existsSync(path.join(guideRoot,"maroc/index.html")));
 fs.unlinkSync(path.join(sub,"maroc.json"));
 const removedSource=buildSite({root:scratch,mode:"production",today,logger:log});
 assert.equal(removedSource.published,0);
 assert.ok(!fs.existsSync(path.join(guideRoot,"maroc/index.html")),
   "a destination removed from the JSON directory must not remain online");
 assert.match(fs.readFileSync(path.join(guideRoot,"index.html"),"utf8"),/Guide en préparation/);
 assertTravelUnaffected();
}finally{fs.rmSync(scratch,{recursive:true,force:true})}
const sw=fs.readFileSync(path.join(root,"travel/sw.js"),"utf8");
assert.ok(sw.includes('const SCOPE_PATH = "/travel/"'));
assert.doesNotMatch(sw,/["']\.?\/?visas\//i,"BTH service worker must never cache the public visa guide");
const netlify=fs.readFileSync(path.join(root,"netlify.toml"),"utf8");
assert.match(netlify,/node scripts\/build-travel-config\.cjs && node scripts\/build-visas\.cjs/);
const css=fs.readFileSync(path.join(root,"visas/style.css"),"utf8");
assert.doesNotMatch(css,/@import|https?:\/\/|url\(/i,"No external font/image/resource in visa CSS");
console.log("PASS visa strict CI rejection; production excludes invalid/demo, cleans stale pages, prepares empty home, leaves BTH build untouched");
