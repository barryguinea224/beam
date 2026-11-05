"use strict";
// Real-source contract: private stay images, explicit print queries, no brand assets.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const PDF=require("../travel/factual-pdf.js");
const JOURNAL=require("../travel/printable-journal.js");
const app=fs.readFileSync("travel/index.html","utf8");
const schema=fs.readFileSync("travel/supabase/schema.sql","utf8");
const migration=fs.readFileSync("travel/supabase/migrations/20261105070000_trips_stay_media.sql","utf8");
const booklet=fs.readFileSync("travel/family-booklet.js","utf8");
const journal=fs.readFileSync("travel/printable-journal.js","utf8");
const sw=fs.readFileSync("travel/sw.js","utf8");
const from=app.indexOf('$("#printJournal").onclick=async()=>');
const until=app.indexOf('$("#pdf").onclick=async()=>',from);
assert.ok(from>0&&until>from,"personal and factual print handlers must stay separate");
const print=app.slice(from,until);
const trips=[...print.matchAll(/S\.from\("trips"\)\s*\.select\("([^"]+)"\)/g)];
assert.equal(trips.length,1,"one explicitly projected trips query");
assert.deepEqual(trips[0][1].split(","),[
 "id","country_code","cities","entry_date","exit_date","duration_days","purpose",
 "is_domestic","note","airline","hotel","airline_media_id","hotel_media_id"
],"the REAL personal booklet query must load selected stay image IDs");
const media=[...print.matchAll(/S\.from\("media"\)\.select\("([^"]+)"\)/g)];
assert.equal(media.length,1);
assert.deepEqual(media[0][1].split(","),["id","storage_path","is_favorite","caption"]);
assert.ok(print.includes('.eq("trip_id",trip.id).eq("user_id",uid)'));
assert.ok(print.includes("byId.get(trip.airline_media_id)"));
assert.ok(print.includes("byId.get(trip.hotel_media_id)"));
assert.ok(print.includes("airlinePhoto,hotelPhoto,missingPhotos"));
assert.ok(booklet.includes("airlinePhoto:data.airlinePhoto,hotelPhoto:data.hotelPhoto"));
assert.ok(journal.includes("airlinePhoto:t.airlinePhoto,hotelPhoto:t.hotelPhoto"));
assert.ok(booklet.includes("p.airlinePhoto,p.hotelPhoto"),"memory-only image optimizer must handle both roles");
for(const role of ["airline","hotel"]){
 const asset=path.join("travel/assets","stay-"+role+".svg");
 const svg=fs.readFileSync(asset,"utf8");
 assert.ok(Buffer.byteLength(svg)<5*1024,role+" image must be under 5 KB");
 assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
 assert.doesNotMatch(svg,/<\s*(text|image|foreignObject|script)\b/i,
  "illustrations must be original vector drawings, without text or images");
 assert.doesNotMatch(svg,/Air France|Emirates|Ibis|Hilton|Marriott|Qatar|Lufthansa|Turkish/i);
 assert.ok(sw.includes('"./assets/stay-'+role+'.svg"'),"public artwork must be pre-cached");
 assert.ok(schema.includes(role+"_media_id uuid"));
 assert.ok(schema.includes("trips_"+role+"_same_trip_owner"));
 assert.ok(migration.includes("trips_"+role+"_same_trip_owner"));
 assert.ok(app.includes('data-stay-role'),"photo selection controls must be present");
}
assert.ok(sw.includes("loyalty-v31"),"cache revision");
assert.doesNotMatch(sw,/cache\.put\(/,"no runtime caching of private signed images");
const factual=schema.split("create view public.travel_history_pdf")[1]?.split(";")[0];
assert.ok(factual);
assert.doesNotMatch(factual,/airline_media_id|hotel_media_id/);
assert.deepEqual(PDF.FIELDS,["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
const dummy={country_code:"FR",cities:["Paris"],entry_date:"2026-01-01",
 exit_date:"2026-01-03",duration_days:3,purpose:"tourisme",
 airline:"Compagnie fictive",hotel:"Hôtel fictif"};
const trip=JOURNAL.viewTrip(dummy,[],[],{
 airlinePhoto:"https://signed.invalid/owner/trip/plane.webp",
 hotelPhoto:"https://signed.invalid/owner/trip/hotel.webp"
});
assert.ok(trip.airlinePhoto.includes("plane.webp"));
assert.ok(trip.hotelPhoto.includes("hotel.webp"));
assert.equal(JOURNAL.viewTrip(dummy).airlinePhoto,"");
assert.ok(app.includes('S.from("trips").update({[field]:selected})'));
const inline=app.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);
new vm.Script(inline,{filename:"travel/index.html"});
console.log("PASS stay media: real queries, same-owner FK, SVG brand hygiene, v24 and six-field PDF");
