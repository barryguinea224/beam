"use strict";
// Contract + actual Chromium rendering for PUBLIC BTH legal pages.
// No auth, backend, cookies, tracking or external resources are needed.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const http=require("node:http");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../travel");
const app=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const pages=[
 {file:"confidentialite.html",name:"Notice de confidentialité",
  headings:["Qui sommes-nous ?","Quelles données conservons-nous ?","Pourquoi ?",
    "Qui peut voir vos données ?","Où sont-elles stockées ?","Combien de temps ?",
    "Vos droits","Âge minimum"],
  evidence:["BTH est un service de BEAM, basé à Conakry (Guinée)",
    "aucune donnée de passeport, de visa ou de pièce d'identité",
    "s'affichent grâce à des liens temporaires qui expirent après 5 minutes",
    "Supabase","Resend","Netlify","12 mois","7 jours au maximum",
    "après un avertissement envoyé sur WhatsApp",
    "18 ans et plus"]},
 {file:"conditions.html",name:"Conditions d’utilisation",
  headings:["1. Le service","2. Création du compte","3. Prix et paiement",
    "4. Fin de l'accès","5. Remboursement","6. L'historique de voyages (PDF)",
    "7. Vos contenus","8. Continuité du service","9. Responsabilité",
    "10. Droit applicable"],
  evidence:["300 000 GNF","500 000 GNF","Orange Money",
    "aucun renouvellement automatique","lecture seule",
    "Satisfait ou remboursé pendant 7 jours",
    "n'est pas un document officiel","propriétaire",
    "au moins 60 jours à l'avance",
    "mois payés et non utilisés vous seront remboursés","droit guinéen"]}
];
const css=fs.readFileSync(path.join(root,"legal.css"),"utf8");
assert.match(css,/#174d3a/);
assert.match(css,/#f7f5ef/);
assert.match(css,/Georgia/);
for(const info of pages){
 const h=fs.readFileSync(path.join(root,info.file),"utf8");
 assert.match(h,/^<!doctype html>/i,"standalone valid HTML: "+info.file);
 assert.match(h,/<html lang="fr">/);
 assert.match(h,/<meta name="viewport"/);
 assert.match(h,/<link rel="stylesheet" href="\.\/legal\.css">/);
 assert.match(h,/Dernière mise à jour : novembre 2026/);
 assert.match(h,/https:\/\/wa\.me\/224622095630/);
 assert.match(h,/<article aria-label=/);
 assert.match(h,/<main id="contenu">/);
 assert.match(h,/<footer>/);
 assert.doesNotMatch(h,/<script\b|supabase\.co|storage\/v1|access_token|localStorage|sessionStorage|fetch\(/i,
   "legal page must not initialize a session or network request");
 assert.doesNotMatch(h,/Messages WhatsApp|Première réponse \(personne qui écrit après la publicité\)/,
   "commercial message templates are not part of the two legal texts");
 for(const title of info.headings)assert.ok(h.includes(">"+title+"</h2>"),"missing original section: "+title);
 for(const phrase of info.evidence)assert.ok(h.includes(phrase),"missing source legal statement: "+phrase);
 const sections=(h.match(/<section aria-labelledby=/g)||[]).length;
 assert.equal(sections,info.headings.length,"all headings must be semantic sections");
 assert.match(h,/<a class="back" href="\.\/">← Retour au carnet<\/a>/);
 assert.ok(h.includes('href="./conditions.html"')&&h.includes('href="./confidentialite.html"'));
}
const auth=app.slice(app.indexOf('<section id="auth"'),app.indexOf('<main id="app"'));
const account=app.slice(app.indexOf('<section id="myAccount"'),app.indexOf('</div></div></main>'));
for(const [scope,html] of [["connexion",auth],["mon-compte",account]]){
 assert.match(html,/class="legalLinks legalLinks(?:Auth|Account)"/,"legal links missing in "+scope);
 for(const page of pages){
  assert.ok(html.includes('href="./'+page.file+'"'),scope+" link missing: "+page.file);
 }
 assert.match(html,/aria-label="Informations légales"/);
}
assert.ok(account.indexOf("legalLinksAccount")>account.indexOf('id="accountSession"'),
 "terms and privacy should be available after the account controls");
assert.match(sw,/beam-travel-shell-v1-20261102-legal-pages-v15/);
for(const file of ["confidentialite.html","conditions.html","legal.css"])
 assert.ok(sw.includes('"./'+file+'"'),"public legal shell asset not audited: "+file);
assert.doesNotMatch(sw,/cache\.put\(/,"PWA must still forbid runtime private cache writes");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
 ".js":"application/javascript; charset=utf-8",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
async function main(){
 const host=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/travel/")){res.writeHead(404);res.end();return}
  const tail=pathname.slice("/travel/".length)||"index.html";
  const file=path.resolve(root,tail);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{
   const data=await fsp.readFile(file);
   res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream",
     "cache-control":"no-store","x-content-type-options":"nosniff"});
   res.end(data);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(done=>host.listen(0,"127.0.0.1",done));
 const base="http://127.0.0.1:"+host.address().port+"/travel/";
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390,1024]){
   const context=await browser.newContext({viewport:{width,height:780},
     isMobile:width<=390,hasTouch:width<=390,serviceWorkers:"block"});
   const p=await context.newPage(), unexpected=[];
   p.on("request",r=>{if(!r.url().startsWith(base))unexpected.push(r.url())});
   p.on("pageerror",e=>unexpected.push("JS error: "+String(e)));
   try{
    for(const info of pages){
     const response=await p.goto(base+info.file,{waitUntil:"load"});
     assert.equal(response.status(),200,"public page served without auth: "+info.file);
     assert.equal(await p.locator("h1").innerText(),info.name);
     assert.equal(await p.locator("article section").count(),info.headings.length);
     const values=await p.evaluate(()=>{
      const doc=document.documentElement;
      const nav=document.querySelector("footer nav");
      return{
       scrollWidth:doc.scrollWidth,innerWidth:window.innerWidth,
       font:getComputedStyle(document.querySelector("h1")).fontFamily,
       background:getComputedStyle(document.body).backgroundColor,
       linkCount:nav.querySelectorAll("a").length,
       external:document.querySelectorAll('script,iframe,form').length,
       hasMain:!!document.querySelector("main article"),
       allHeadings:[...document.querySelectorAll("article h2")].map(e=>e.textContent.trim())
      };
     });
     assert.ok(values.scrollWidth<=values.innerWidth+1,
       "horizontal overflow at "+width+"px on "+info.file+": "+JSON.stringify(values));
     assert.match(values.font,/Georgia/);
     assert.equal(values.background,"rgb(247, 245, 239)");
     assert.equal(values.external,0);
     assert.equal(values.linkCount,3);
     assert.equal(values.hasMain,true);
     assert.deepEqual(values.allHeadings,info.headings);
     assert.deepEqual(unexpected,[],"legal page must be self-contained");
     console.log("PASS "+info.file+" public and readable "+width+"px");
    }
    // Follow actual links without an account. Both documents remain navigable.
    await p.locator('footer a[href="./confidentialite.html"]').click();
    await p.waitForURL(base+"confidentialite.html");
    assert.equal(await p.locator("h1").innerText(),"Notice de confidentialité");
    await p.locator('footer a[href="./conditions.html"]').click();
    await p.waitForURL(base+"conditions.html");
    assert.equal(await p.locator("h1").innerText(),"Conditions d’utilisation");
    await p.locator("header a.back").click();
    await p.waitForURL(base);
    // Link targets in the real login screen, without depending on a real Supabase session.
    assert.equal(await p.locator('#auth nav.legalLinks a[href="./confidentialite.html"]').count(),1);
    assert.equal(await p.locator('#auth nav.legalLinks a[href="./conditions.html"]').count(),1);
    assert.equal(await p.locator('#myAccount nav.legalLinks a[href="./confidentialite.html"]').count(),1);
    assert.equal(await p.locator('#myAccount nav.legalLinks a[href="./conditions.html"]').count(),1);
   }finally{await context.close()}
  }
 }finally{
  await browser.close();
  await new Promise(done=>host.close(done));
 }
 console.log("PASS BTH legal terms/privacy: static source assertions, mobile/desktop, login/account and public navigation");
}
main().catch(e=>{console.error(e);process.exitCode=1});
