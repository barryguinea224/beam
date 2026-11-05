"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const guide=require("../travel/visa-guide.js");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"travel/index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"travel/sw.js"),"utf8");
const sample=[
 {code_pays:"CA",slug:"canada",destination:"Canada"},
 {code_pays:"FR",slug:"france",destination:"France"}
];
function node(){
 const doc={createElement(tag){assert.equal(tag,"a");return {href:"",textContent:"",tagName:"A"}}};
 return {ownerDocument:doc,hidden:true,textContent:"",children:[],
  append(el){this.children.push(el)},replaceChildren(){this.textContent="";this.children=[]}};
}
function response(payload=sample){return {ok:true,json:async()=>payload}}
async function main(){
 assert.equal(guide.INDEX_URL,"/visas/fiches.json");
 assert.equal(guide.validFiches(sample),true);
 assert.equal(guide.validFiches([{code_pays:"FR",slug:"france",destination:"France",user_id:"private"}]),false);
 for(const invalid of [null,{},[null],[{code_pays:"ZZ",slug:"../../bad",destination:"X"}],
  [{code_pays:"fr",slug:"france",destination:"France"}],
  [{code_pays:"FR",slug:"../france",destination:"France"}],
  [{code_pays:"FR",slug:"france",destination:""}]]){
  assert.equal(guide.validFiches(invalid),false);
 }
 const calls=[];
 const fetchFn=(url,opts)=>{calls.push({url,opts});return Promise.resolve(response());};
 const france=node();
 assert.equal(await guide.showForCountry("FR",france,{fetchFn}),true);
 assert.equal(france.hidden,false);
 assert.equal(france.textContent,"Préparer un nouveau visa ? Voir la fiche ");
 assert.deepEqual(france.children.map(x=>[x.tagName,x.href,x.textContent]),
  [["A","/visas/france/","France"]]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"/visas/fiches.json",
  "request URL must never encode traveler country, trip, user or session");
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.cache,"no-store");
 assert.equal(calls[0].opts.credentials,"omit");
 assert.equal(calls[0].opts.referrerPolicy,"no-referrer");
 assert.equal(calls[0].opts.mode,"same-origin");
 assert.equal(calls[0].opts.redirect,"error");
 assert.ok(calls[0].opts.signal);

 const none=node();
 assert.equal(await guide.showForCountry("GN",none,{fetchFn}),false);
 assert.equal(none.hidden,true);
 assert.equal(none.children.length,0);
 const before=calls.length;
 assert.equal(await guide.showForCountry("France",none,{fetchFn}),false);
 assert.equal(calls.length,before,"invalid country code makes no network request");

 for(const broken of [
  async()=>{throw Error("offline")},
  async()=>({ok:false,status:404}),
  async()=>({ok:true,json:async()=>{throw SyntaxError("invalid JSON")}}),
  async()=>response([{code_pays:"FR",slug:"france",destination:"France",privateTrip:"x"}]),
  async()=>response({invalid:true}),
  async()=>response([])
 ]){
  const el=node();
  assert.equal(await guide.showForCountry("FR",el,{fetchFn:broken}),false);
  assert.equal(el.hidden,true);
  assert.equal(el.children.length,0,"failure must remain silent");
 }
 const slow=node();
 assert.equal(await guide.showForCountry("FR",slow,{
  fetchFn:()=>new Promise(()=>{}),timeoutMs:8
 }),false,"a stalled request must time out");
 assert.equal(slow.hidden,true);
 let finish;
 const pending=new Promise(resolve=>{finish=resolve});
 const stale=node();
 const old=guide.showForCountry("FR",stale,{fetchFn:()=>pending,timeoutMs:200});
 guide.hide(stale); // Same user closed the modal before the response arrived.
 finish(response());
 assert.equal(await old,false);
 assert.equal(stale.hidden,true);
 assert.equal(stale.children.length,0,"late response must not re-open a closed link");

 // Genuine static anchors, no target=_blank, no inline onclick and no PII.
 assert.match(html,/<a id="dashboardVisaGuide" href="\/visas\/">Guide des visas<\/a>/);
 assert.match(html,/<p id="detailVisaGuide" class="detailVisaGuide" hidden><\/p>/);
 assert.match(html,/<script src="\.\/visa-guide\.js"><\/script>/);
 assert.match(html,/BEAM_VISA_GUIDE\?\.showForCountry\(trip\.country_code,\$\("#detailVisaGuide"\)\)/);
 assert.match(html,/BEAM_VISA_GUIDE\?\.hide\(\$\("#detailVisaGuide"\)\)/);
 // External identité link: no PII, tracking, script or new-tab target.
 const account=html.match(/<div id="accountOverlay"[\s\S]*?<div id="modal"/)?.[0] || "";
 assert.match(account,/<a href="https:\/\/ididentite\.com\/" rel="noopener">Mes informations d'identité → identité<\/a>/);
 const identityAnchors=[...account.matchAll(/<a\b[^>]*href="https:\/\/ididentite\.com\/"[^>]*>/g)];
 assert.equal(identityAnchors.length,1,"identity shortcut only inside Mon compte");
 for(const [opening] of identityAnchors){
  assert.match(opening,/rel="noopener"/);
  assert.doesNotMatch(opening,/target=|onclick=|onmousedown=/i);
  assert.doesNotMatch(opening,/\?|#/);
 }
 assert.match(sw,/photo-actions-v26/);
 assert.match(sw,/if \(url\.origin !== self\.location\.origin\) return;/);
 const precache=sw.match(/const PUBLIC_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
 assert.doesNotMatch(precache,/ididentite\.com/,"the worker must never pre-cache identité");
 assert.match(sw,/"\.\/visa-guide\.js"/,"new helper must be an audited public shell asset");
 assert.match(sw,/if \(url\.pathname\.startsWith\("\/visas\/"\)\) return;/);
 assert.doesNotMatch(sw,/["\']\.\/visas\//,
  "worker public shell must never pre-cache visa pages or public index");
 console.log("PASS BTH -> visas: France link, unlisted country, silent failures, no-store, deadline, stale guard and SW isolation");
}
main().catch(error=>{console.error(error);process.exitCode=1});
