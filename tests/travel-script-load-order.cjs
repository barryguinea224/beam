"use strict";
// Check the REAL script tags in travel/index.html, not the order in a test fixture.
// Classic scripts execute in document order: every browser-side dependency must
// already be defined by the time its consumer initializes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"..","travel","index.html"),"utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>/gi)].map(([,attrs])=>{
 const match=attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
 return {src:match?.[1]||"",attrs};
});
const names=scripts.map(s=>s.src);
const modules=names.filter(n=>n.startsWith("./")||n.startsWith("/travel/"))
 .map(n=>n.replace(/^\.?\/travel\//,"").replace(/^\.\//,""));
assert.ok(modules.length>=12,"all Travel History modules must load from the actual HTML");
assert.equal(new Set(modules).size,modules.length,"duplicate script tags may execute modules twice");

// Explicit browser-level edges for all current dependent modules. Update this
// contract when new modules are added. Keep them classic synchronous scripts.
const edges={
 "photo-upload.js":["photo-utils.js"],
 "country-picker.js":["countries.js"],
 "factual-pdf.js":["countries.js"],
 "visual-cards.js":["countries.js"],
 "factual-pdf-file.js":["factual-pdf.js"],
 "printable-journal.js":["countries.js","dashboard-filters.js","visual-cards.js"]
};
function verifyOrder(order){
 const indexOf=new Map(order.map((name,i)=>[name,i]));
 for(const [consumer,deps] of Object.entries(edges)){
  assert.ok(indexOf.has(consumer),"missing consumer: "+consumer);
  for(const dep of deps){
   assert.ok(indexOf.has(dep),"missing dependency: "+dep+" (required by "+consumer+")");
   assert.ok(indexOf.get(dep)<indexOf.get(consumer),
     consumer+" is loaded before "+dep+" in the real travel/index.html");
  }
 }
}
verifyOrder(modules);
// The assertion must genuinely detect a reversed order; don't let it be a
// cosmetic test that remains green when the source regression is restored.
const broken=modules.slice();
const i=broken.indexOf("dashboard-filters.js"),j=broken.indexOf("printable-journal.js");
[broken[i],broken[j]]=[broken[j],broken[i]];
assert.throws(()=>verifyOrder(broken),/printable-journal\.js is loaded before dashboard-filters\.js/);
for(const s of scripts){
 if(!s.src||(!s.src.startsWith("./")&&!s.src.startsWith("/travel/")))continue;
 assert.ok(!/\b(?:async|defer)\b/i.test(s.attrs),"load-order-sensitive module must be synchronous: "+s.src);
 assert.ok(!/\btype\s*=\s*["']module["']/i.test(s.attrs),"module scripts change execution order: "+s.src);
}
assert.ok(names.indexOf("./printable-journal.js")<names.length-1,
 "main inline application logic must run after private journal initialization");
const inline=scripts.findIndex(s=>!s.src&&/script/i.test(s.attrs)===false);
assert.ok(scripts.findIndex(s=>s.src==="./printable-journal.js")<scripts.length-1,
 "private journal cannot be the final inline application");
const journal=fs.readFileSync(path.join(__dirname,"..","travel","printable-journal.js"),"utf8");
assert.match(journal,/BEAM_DASHBOARD_FILTERS/, "the journal's filter dependency must remain explicitly checked");
assert.match(journal,/BEAM_COUNTRIES/, "the journal's country dependency must remain explicitly checked");
const sw=fs.readFileSync(path.join(__dirname,"..","travel","sw.js"),"utf8");
assert.match(sw,/beam-travel-shell-v1-20261031-journey-flags-249/);
assert.ok(sw.includes('"./printable-journal.js"')&&sw.includes('"./dashboard-filters.js"')&&sw.includes('"./visual-cards.js"'));
console.log("PASS real index.html script dependency graph and PWA shell version");
