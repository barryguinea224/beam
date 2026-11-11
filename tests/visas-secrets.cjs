"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {validateSecrets,renderSecrets,buildSite,esc,todayUTC}=require("../scripts/build-visas.cjs");

const root=path.resolve(__dirname,"..");
const source=JSON.parse(fs.readFileSync(path.join(root,"visas/data/secrets.json"),"utf8"));
const clone=value=>JSON.parse(JSON.stringify(value));
const today=todayUTC();

assert.equal(source.titre,"Les secrets des voyageurs intelligents");
assert.equal(source.introduction,
 "Les petites habitudes qui évitent les grands problèmes, du dossier visa jusqu'au retour à Conakry.");
assert.equal(source.verifie_le,"2026-11-11");
assert.equal(source.chapitres.length,8);
assert.deepEqual(source.chapitres.map(x=>x.conseils.length),[3,5,3,3,4,4,4,2]);
assert.doesNotThrow(()=>validateSecrets(source,{today}));

function invalid(change,regex){
 const entry=clone(source);
 change(entry);
 assert.throws(()=>validateSecrets(entry,{today}),regex);
}
invalid(o=>delete o.titre,/champ obligatoire/);
invalid(o=>o.introduction=" ",/texte non vide/);
invalid(o=>o.chapitres=[],/au moins un chapitre/);
invalid(o=>o.chapitres[0].titre="",/texte non vide/);
invalid(o=>o.chapitres[0].conseils=[],/au moins un conseil/);
invalid(o=>o.chapitres[0].conseils[0]="",/texte non vide/);
invalid(o=>o.chapitres[0].conseils[0]=" Texte ",/espaces superflus/);
invalid(o=>o.verifie_le="2026-02-30",/date calendaire invalide/);
invalid(o=>o.verifie_le="2026/11/11",/format AAAA-MM-JJ/);
invalid(o=>o.unknown=true,/champ inconnu/);
invalid(o=>o.chapitres[0].unexpected="secret",/champ inconnu/);
const future=new Date(Date.parse(today+"T00:00:00Z")+86400000).toISOString().slice(0,10);
invalid(o=>o.verifie_le=future,/date future interdite/);

const escaped=clone(source);
escaped.chapitres[0].conseils[0]='<script>alert("unsafe")</script>';
assert.ok(renderSecrets(escaped).includes("&lt;script&gt;"));
assert.doesNotMatch(renderSecrets(escaped),/<script\b/i);

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"beam-visas-secrets-"));
const directory=path.join(scratch,"visas");
const data=path.join(directory,"data");
try{
 fs.mkdirSync(data,{recursive:true});
 fs.copyFileSync(path.join(root,"visas/data/secrets.json"),path.join(data,"secrets.json"));
 fs.copyFileSync(path.join(root,"visas/style.css"),path.join(directory,"style.css"));

 const check=buildSite({root:scratch,mode:"check",today});
 assert.equal(check.published,0,"secrets must never count as a country");
 assert.equal(check.files,0,"only country JSON files count as fiches");
 assert.equal(fs.existsSync(path.join(directory,"secrets/index.html")),false,
  "strict check must not write HTML");

 for(const mode of ["preview","production"]){
  const built=buildSite({root:scratch,mode,today});
  assert.equal(built.published,0,"secrets must not become a country");
  assert.equal(built.excluded.length,0);
  const guide=fs.readFileSync(path.join(directory,"index.html"),"utf8");
  const html=fs.readFileSync(path.join(directory,"secrets/index.html"),"utf8");
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,"fiches.json"),"utf8"));
  assert.deepEqual(manifest,[],"secrets must never enter the country listing");
  assert.ok(guide.includes('<a href="/visas/secrets/">Les secrets des voyageurs intelligents</a>'),
   "Guide home must have the secrets card");
  assert.ok(html.includes('<link rel="stylesheet" href="/visas/style.css">'));
  assert.ok(html.includes("BEAM_VISAS_GENERATED"));
  assert.ok(html.includes('<h1>'+esc(source.titre)+'</h1>'));
  assert.ok(html.includes('<p class="lead">'+esc(source.introduction)+'</p>'));
  assert.equal((html.match(/class="secrets-chapter"/g)||[]).length,8);
  for(const [index,chapter] of source.chapitres.entries()){
   assert.ok(html.includes((index+1)+". "+esc(chapter.titre)),"chapter "+(index+1));
   for(const conseil of chapter.conseils)
    assert.ok(html.includes('<li>'+esc(conseil)+'</li>'),"unchanged advice: "+conseil);
  }
  assert.ok(html.includes("Informations indicatives · BEAM n&#39;est pas affilié aux ambassades"));
  assert.ok(html.includes("https://wa.me/224622095630?text="));
  assert.ok(html.includes("Vérifié par BEAM le 11/11/2026. Les règles changent : confirmez toujours auprès de l&#39;ambassade ou de la compagnie."));
  assert.doesNotMatch(html,/<script\b|<iframe\b|\sonclick\s*=|\sonload\s*=/i);
 }
 const account=fs.readFileSync(path.join(root,"travel/index.html"),"utf8");
 const links=account.match(/<section id="accountLinks"[\s\S]*?<\/section>/)?.[0]||"";
 assert.match(links,/<a href="\/visas\/secrets\/"><span>Les secrets des voyageurs intelligents<\/span>/);
 assert.equal((links.match(/<a /g)||[]).length,3,"the new guide link belongs among existing account links");
 const sw=fs.readFileSync(path.join(root,"travel/sw.js"),"utf8");
 assert.match(sw,/jyetais-v40-settings/);
 assert.match(sw,/if \(url\.pathname\.startsWith\("\/visas\/"\)\) return;/);
 const netlify=fs.readFileSync(path.join(root,"netlify.toml"),"utf8");
 assert.ok(netlify.includes('from = "/visas/data/*"'),
  "raw advice JSON must remain blocked by existing redirect");

 // Invalid editorial data is a CI error; production cannot serve stale HTML.
 fs.writeFileSync(path.join(data,"secrets.json"),'{"titre":""}');
 assert.throws(()=>buildSite({root:scratch,mode:"check",today}),/texte non vide|champ obligatoire/);
 const production=buildSite({root:scratch,mode:"production",today,logger:{warn(){},log(){}}});
 assert.equal(production.published,0);
 assert.equal(fs.existsSync(path.join(directory,"secrets/index.html")),false);
 assert.ok(!fs.readFileSync(path.join(directory,"index.html"),"utf8").includes('href="/visas/secrets/"'));
}finally{
 fs.rmSync(scratch,{recursive:true,force:true});
}
console.log("PASS travel secrets: exact source text, strict JSON/date check, production and preview, links, no JS, no country counting, safe invalid fallback");
