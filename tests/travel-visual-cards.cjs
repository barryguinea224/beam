"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve("travel");
const ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root,"countries.js"),"utf8"),ctx);
vm.runInContext(fs.readFileSync(path.join(root,"visual-cards.js"),"utf8"),ctx);
const CARD=ctx.window.BEAM_VISUAL_CARDS;
const COUNTRIES=ctx.window.BEAM_COUNTRIES;
assert.equal(CARD.COUNTRY_ART.length,6);
assert.equal(CARD.FLAG_CODES.length,30);
assert.equal(new Set(CARD.FLAG_CODES).size,30);
for(const code of CARD.COUNTRY_ART){
 const p=path.join(root,"assets","countries",code.toLowerCase()+".webp");
 assert.ok(fs.existsSync(p),"Missing BEAM-local country WebP: "+code);
 const stat=fs.statSync(p);
 assert.ok(stat.size>300&&stat.size<=40960,"Country WebP exceeds 40KB "+code);
 const binary=fs.readFileSync(p);
 assert.equal(binary.toString("ascii",0,4),"RIFF");
 assert.equal(binary.toString("ascii",8,12),"WEBP");
 assert.equal(CARD.countryArt(code),"./assets/countries/"+code.toLowerCase()+".webp");
}
for(const code of CARD.FLAG_CODES){
 assert.ok(COUNTRIES.valid(code));
 const p=path.join(root,"assets","flags",code.toLowerCase()+".svg");
 assert.ok(fs.existsSync(p),"Missing BEAM-local flag "+code);
 const txt=fs.readFileSync(p,"utf8");
 assert.match(txt,/<svg\b/);
 assert.ok(!/<script|<foreignObject|\sonload=/i.test(txt),"Suspicious SVG: "+code);
 assert.equal(CARD.flag(code),"./assets/flags/"+code.toLowerCase()+".svg");
}
assert.ok(fs.existsSync(path.join(root,"assets","flags","LICENSE")));
const credit=fs.readFileSync(path.join(root,"assets","CREDITS.md"),"utf8");
assert.match(credit,/MIT/);assert.match(credit,/40 Ko/);
assert.equal(CARD.flag("NZ"),"","No network request for an unbundled flag");
assert.equal(CARD.countryArt("NZ"),"","No network request for missing destination art");
assert.equal(CARD.flag("ZZ"),"");assert.equal(CARD.countryArt("ZZ"),"");
assert.equal(CARD.countryArt("FR"),"./assets/countries/fr.webp");
assert.equal(CARD.flag("FR"),"./assets/flags/fr.svg");
const id="60000000-0000-4000-8000-000000000001";
const trip={id,country_code:"FR",cities:["Paris",'<img src=x onerror=alert(1)>'],
 entry_date:"2026-06-01",exit_date:"2026-06-10",duration_days:10,purpose:"tourisme",is_domestic:false,
 cover_media_id:"70000000-0000-4000-8000-000000000001"};
const html=CARD.markup(trip,"France","Tourisme","1 → 10 juin 2026");
assert.ok(html.includes('class="tripOpen'));
assert.ok(html.includes('loading="lazy"'));
assert.ok(html.includes('src="./assets/flags/fr.svg"'));
assert.ok(html.includes('src="./assets/countries/fr.webp"'));
assert.ok(html.includes("France"));
assert.ok(html.includes("Tourisme"));
assert.ok(!html.includes('src=x onerror'),"Untrusted cities must be escaped");
assert.ok(!html.includes("70000000-0000-4000-8000-000000000001"),
  "Private cover ID should not appear in the public HTML");
const fallback=CARD.markup({...trip,country_code:"NZ",cities:["Auckland"]},"Nouvelle-Zélande","Tourisme","juin 2026");
assert.ok(!fallback.includes("journeyBackdrop"),"Unsupported country uses CSS fallback");
assert.ok(!fallback.includes("journeyFlag"),"Unsupported flag uses ISO code only");
assert.ok(fallback.includes("NZ"));
const SUPABASE="https://my-stage.supabase.co";
assert.equal(CARD.trustedSignedUrl("https://my-stage.supabase.co/storage/v1/object/sign/media/uid/path.webp?token=TEST",SUPABASE),
 "https://my-stage.supabase.co/storage/v1/object/sign/media/uid/path.webp?token=TEST");
for(const url of [
 "https://evil.example/storage/v1/object/sign/media/uid/x.webp",
 "http://my-stage.supabase.co/storage/v1/object/sign/media/uid/x.webp",
 "https://my-stage.supabase.co/storage/v1/object/public/media/uid/x.webp",
 "data:image/png;base64,AA==","javascript:alert(1)"
])assert.equal(CARD.trustedSignedUrl(url,SUPABASE),"","Untrusted signed URL: "+url);
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const js=index.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js);new vm.Script(js);
assert.ok(index.includes('src="./visual-cards.js"'));
assert.ok(index.includes('href="./visual-cards.css"'));
assert.ok(js.includes('window.BEAM_VISUAL_CARDS.markup('));
assert.ok(js.includes('IntersectionObserver'));
assert.ok(js.includes('.eq("id",coverId).eq("trip_id",tripId).eq("user_id",uid)'));
assert.ok(js.includes('createSignedUrl(row.storage_path,300)'));
assert.ok(js.includes('trustedSignedUrl(signed.signedUrl,C.supabaseUrl)'));
assert.ok(js.includes('S.from("trips").update({cover_media_id:selected})'));
assert.ok(js.includes('if(trip?.cover_media_id===row.id){trip.cover_media_id=null;render()}'));
assert.ok(!js.includes('https://images.unsplash.com'));
assert.ok(!js.includes('flagcdn'));
const css=fs.readFileSync(path.join(root,"visual-cards.css"),"utf8");
assert.ok(!/url\s*\(/i.test(css),"Card CSS must never fetch third-party backgrounds");
const pdf=fs.readFileSync(path.join(root,"factual-pdf.js"),"utf8");
assert.ok(!/cover_media_id|storage_path|photo/.test(pdf.split("const FIELDS=")[1].split(";")[0]));
console.log("PASS visual cards: local SVG/WebP, 40KB, strict signed URL host, escaped HTML, owner media query, unchanged factual PDF");
