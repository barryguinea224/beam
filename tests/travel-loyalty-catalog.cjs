"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const API=require("../travel/loyalty-programs.js");
assert.deepEqual(API.PROGRAMS.map(x=>x.code),["AF","EK","ET","SN","TK","AT","HC","KP"]);
const expectedHosts={AF:"login.airfrance.com",EK:"www.emirates.com",ET:"shebamiles.ethiopianairlines.com",
 SN:"www.brusselsairlines.com",TK:"www.turkishairlines.com",AT:"www.royalairmaroc.com",
 HC:"teranga.flyairsenegal.com",KP:"www.flyasky.com"};
for(const program of API.PROGRAMS){
 assert.ok(program.name&&program.airline&&program.alliance,"Catalogue requires all fields");
 const url=new URL(program.signupUrl);
 assert.equal(url.protocol,"https:");
 assert.equal(url.hostname,expectedHosts[program.code],"Only exact verified official airline hosts are allowed");
 assert.equal(url.username,"");assert.equal(url.password,"");
 assert.ok(!url.hash,"No fragment or user data in sign-up links");
 if(program.code==="AF")assert.equal(url.search,"?locale=fr%2Ffr&source=em","Exact Air France official sign-up link");
 else assert.ok(!url.search,"No tracking IDs or customer data");
}
assert.match(API.BY_CODE.HC.signupNote,/pas actuellement actif/);
for(const good of ["AB12","4821","AB12-4821","A".repeat(30)])assert.ok(API.formatNumber(good));
for(const bad of ["123","A B2","!",'A'.repeat(31),"ABC/123","AB_123","abc\n12"," 4821"])assert.ok(!API.formatNumber(bad));
assert.equal(API.maskNumber("AB12-4821"),"•••• 4821");
assert.equal(API.maskNumber("AB12"),"•••• AB12");
assert.equal(API.airlineProgram("ÉTHIOPIAN AIRLINES",["ET"])?.code,"ET");
assert.equal(API.airlineProgram("Brüssels Airlines",["SN"])?.code,"SN");
assert.equal(API.airlineProgram("  AIR SÉNÉGAL ",["HC"])?.code,"HC");
assert.equal(API.airlineProgram("Ethiopian Airlines",["AF"]),null,"No cross-program hint");
assert.equal(API.airlineProgram("Totally different airline",["ET"]),null);
const main=fs.readFileSync("travel/index.html","utf8");
const inline=main.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline);
for(const key of ["loyaltyPanel","loyaltyOwned","loyaltyAvailable","loyaltyNumber","loyaltyDeleteConfirm","detailLoyaltyHint"])
 assert.ok(main.includes('id="'+key+'"'),"Missing "+key);
assert.match(main,/BEAM_LOYALTY_UI\?\.init/);
assert.match(main,/LOYALTY\?\.hintFor/);
assert.match(main,/J.y étais n'enregistre jamais vos mots de passe/);
assert.match(main,/Ethiopian, Brussels Airlines et Turkish Airlines sont dans Star Alliance/);
assert.doesNotMatch(main,/<input[^>]+type="password"/i,"No loyalty password field");
const ui=fs.readFileSync("travel/loyalty-ui.js","utf8");
new vm.Script(ui);
assert.doesNotMatch(ui,/\.innerHTML\s*=/);
assert.match(ui,/\.eq\("user_id",uid\)/,"Owner-scoped reads/writes");
assert.match(ui,/navigator\.clipboard\.writeText/,"Explicit copy action");
assert.doesNotMatch(ui,/\bconfirm\(|window\.confirm|localStorage|sessionStorage/);
for(const p of ["travel/factual-pdf.js","travel/factual-pdf-file.js","travel/printable-journal.js","travel/family-booklet.js"]){
 const source=fs.readFileSync(p,"utf8");
 assert.ok(!source.includes("loyalty_memberships")&&!source.includes("member_number"),
  "No loyalty member numbers in export: "+p);
}
const sw=fs.readFileSync("travel/sw.js","utf8");
assert.match(sw,/jyetais-v40-settings/);
for(const file of ["loyalty-programs.js","loyalty-ui.js","loyalty.css"])
 assert.ok(sw.includes('"./'+file+'"'),"Only public code/CSS in cache");
assert.ok(!sw.includes('"./loyalty-memberships.json"')&&!sw.includes("loyalty_memberships"),"Never cache memberships");
console.log("PASS loyalty: 8 airline-only official links, strict format, text mask, normalized airline matching, private UI and PDF isolation");
