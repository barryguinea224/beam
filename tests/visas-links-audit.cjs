"use strict";
// Audits generated public pages. Run only AFTER CONTEXT=production has rendered
// the six checked fiches. No client data, secret, browser JS or persistent output.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const BASE="https://beamguinee.com";
const slugs=["canada","chine","france","maroc","royaume-uni","turquie"];
const pages=["index.html","travel/index.html","acteurs.html","merci.html",
 "visas/index.html","visas/404.html","visas/secrets/index.html",...slugs.map(s=>"visas/"+s+"/index.html")];
const rootFile=rel=>path.join(ROOT,rel);
const read=rel=>fs.readFileSync(rootFile(rel),"utf8");
const attr=(attrs,name)=>{
 const match=attrs.match(new RegExp("(?:^|\\s)"+name+"\\s*=\\s*([\"'])(.*?)\\1","i"));
 return match?match[2]:null;
};
const anchors=(html)=>[...html.matchAll(/<a\b([^>]*?)>/gi)]
 .map(m=>({href:attr(m[1],"href"),label:m[1]})).filter(x=>x.href!==null);
const ids=html=>new Set([...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)]
 .map(m=>m[2]));
const htmlCache=new Map();
const getHtml=p=>{
 if(!htmlCache.has(p))htmlCache.set(p,read(p));
 return htmlCache.get(p);
};
// The general JS suite runs before the static generator. Do not create
// untracked HTML/JSON files in that suite; the dedicated visa CI step
// enforces production generation before running this complete audit.
if(!fs.existsSync(rootFile("visas/index.html"))){
 if(process.argv.includes("--external"))
  throw new Error("Generate the six visas first: CONTEXT=production node scripts/build-visas.cjs");
 console.log("SKIP generated visa links: dedicated visas-static CI audits after production build");
 process.exit(0);
}
const errors=[],links=[];
for(const src of pages){
 assert.ok(fs.existsSync(rootFile(src)),"Missing audit page "+src);
 const body=getHtml(src),pathname=src.endsWith("/index.html")
  ? "/"+src.slice(0,-"index.html".length):"/"+src;
 for(const {href} of anchors(body)){
  if(/^(?:mailto:|tel:|sms:)/i.test(href))continue;
  if(/^(?:javascript:|data:)/i.test(href)){errors.push(src+": unsafe href "+href);continue}
  let u;
  try{u=new URL(href,BASE+pathname)}catch(e){errors.push(src+": invalid href "+href);continue}
  if(!["https:","http:"].includes(u.protocol)){errors.push(src+": unsupported href "+href);continue}
  if(u.origin!==BASE)continue;
  let rawPath;
  try{rawPath=decodeURIComponent(u.pathname)}catch{errors.push(src+": bad path "+href);continue}
  const p=path.resolve(ROOT,"."+rawPath);
  if(p!==ROOT&&!p.startsWith(ROOT+path.sep)){errors.push(src+": escaped root "+href);continue}
  const target=fs.existsSync(p)&&fs.statSync(p).isDirectory()
   ? path.join(p,"index.html"):p;
  const targetRelative=path.relative(ROOT,target).replace(/\\/g,"/");
  links.push({from:src,to:targetRelative,hash:u.hash});
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()){
   errors.push(src+": missing "+href+" → "+targetRelative);
   continue;
  }
  if(u.hash){
   const fragment=decodeURIComponent(u.hash.slice(1));
   if(fragment && /html?$/i.test(target) && !ids(getHtml(targetRelative)).has(fragment))
    errors.push(src+": missing anchor #"+fragment+" in "+targetRelative);
  }
 }
}
console.log("INTERNAL LINKS: "+links.length+" audited across "+pages.length+" pages");
for(const error of errors)console.error("BROKEN: "+error);
if(errors.length)process.exitCode=1;
else console.log("PASS: all same-origin HTML links and fragments resolve in generated output");

async function runExternalAudit(){
 // Every external link actually present in generated sheets, plus all
 // appointment and official-source URLs from the six untouched JSON files.
 const all=new Map();
 const include=(url,country,type)=>{
  if(!url||!/^https?:\/\//i.test(url))return;
  if(!all.has(url))all.set(url,{url,countries:new Set(),categories:new Set()});
  all.get(url).countries.add(country);
  all.get(url).categories.add(type);
 };
 for(const slug of slugs){
  const data=JSON.parse(read("visas/data/"+slug+".json"));
  for(const type of data.types_visa){
   include(type.lieu_depot.rendez_vous_url,slug,"rendez-vous");
   for(const source of type.sources)include(source.url,slug,"source officielle");
  }
  const rendered=getHtml("visas/"+slug+"/index.html");
  for(const {href} of anchors(rendered)){
   try{const u=new URL(href,BASE+"/visas/"+slug+"/");
    if(u.origin!==BASE)include(u.href,slug,"autre lien externe");
   }catch{}
  }
 }
 async function request(url,method){
  const response=await fetch(url,{
   method,redirect:"follow",signal:AbortSignal.timeout(9000),
   headers:{"User-Agent":"Mozilla/5.0 (compatible; BEAM-LinkCheck/1.0)",
    "Accept":"text/html,application/pdf,*/*"}
  });
  const status=response.status,final=response.url;
  try{await response.body?.cancel()}catch{}
  return {status,final};
 }
 async function probe(row){
  let result,detail="";
  try{
   result=await request(row.url,"HEAD");
   if(result.status>=400)result=await request(row.url,"GET");
  }catch(error){
   detail=String(error.cause?.code||error.code||error.name||error.message);
   try{result=await request(row.url,"GET");detail=""}
   catch(other){detail=String(other.cause?.code||other.code||other.name||other.message)}
  }
  const code=result?.status;
  const state=!result?"NON_RÉPONDANT":code>=200&&code<400?"OK":
   [401,403,429].includes(code)?"ACCÈS_AUTOMATISÉ_BLOQUÉ":
   [404,410].includes(code)?"LIEN_INTROUVABLE":
   code>=500?"ERREUR_SERVEUR":"RÉPONSE_"+code;
  return {url:row.url,countries:[...row.countries],categories:[...row.categories],
   status:code||null,state,finalUrl:result?.final||null,detail};
 }
 const items=[...all.values()];
 const outputs=new Array(items.length);
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(5,items.length)},async()=>{
  for(;;){const i=cursor++;if(i>=items.length)break;outputs[i]=await probe(items[i])}
 }));
 const outDir=rootFile("test-artifacts/visas-link-audit");
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,"external.json"),
  JSON.stringify({checkedAt:new Date().toISOString(),results:outputs},null,2)+"\n");
 console.log("EXTERNAL LINKS: "+outputs.length+" unique endpoints checked");
 for(const x of outputs){
  console.log(x.state+" "+(x.status||"—")+" "+x.categories.join("/")+
   " "+x.countries.join(",")+" "+x.url+(x.detail?" ["+x.detail+"]":""));
  if(x.state!=="OK")console.log("::warning::Visa external link "+x.state+
   " "+x.url+" ("+(x.status||x.detail)+")");
 }
 const summary=process.env.GITHUB_STEP_SUMMARY;
 if(summary)fs.appendFileSync(summary,
  "\n### Contrôle des liens externes des six fiches visas\n"+
  "| État | HTTP | Catégorie | Pays | URL |\n|---|---:|---|---|---|\n"+
  outputs.map(x=>"| "+x.state+" | "+(x.status||"—")+" | "+
   x.categories.join(", ")+" | "+x.countries.join(", ")+" | "+
   x.url.replace(/\|/g,"%7C")+" |").join("\n")+"\n");
}
if(process.argv.includes("--external")){
 runExternalAudit().catch(error=>{console.error(error);process.exitCode=1});
}
