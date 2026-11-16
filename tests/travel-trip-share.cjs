"use strict";
// Privacy-focused unit checks: only an explicit share allowlist may reach canvas.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const SHARE=require("../travel/trip-share.js");
const DETAIL=require("../travel/trip-detail.js");
assert.equal(SHARE.WIDTH,1080);
assert.equal(SHARE.HEIGHT,1350);
const trip={
 country_code:"FR",cities:["Paris"],entry_date:"2026-10-10",exit_date:"2026-10-20",
 duration_days:11,phone:"NEVER_PHONE_224",email:"NEVER_EMAIL",postal_address:"NEVER_ADDRESS",
 nationality:"NEVER_NATIONALITY",companions:"NEVER_COMPANIONS",note:"NEVER_PRIVATE_NOTE",
 miles:"NEVER_MILES",travel_history_pdf:"NEVER_EMBASSY"
};
const fields=SHARE.safeTrip(trip,"France","10 → 20 oct. 2026");
assert.deepEqual(fields,{country:"France",cities:"Paris",dates:"10 → 20 oct. 2026",days:11});
const rendered=[];
const ctx={
 fillStyle:"",strokeStyle:"",font:"",textAlign:"",
 fillRect(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
 fillText(...args){rendered.push(args[0])},measureText(t){return {width:String(t).length*22}}
};
const canvas={width:0,height:0,getContext(){return ctx}};
SHARE.draw(canvas,{...fields});
assert.equal(canvas.width,1080);
assert.equal(canvas.height,1350);
assert.ok(rendered.includes("France"));
assert.ok(rendered.some(x=>x.includes("Paris")));
assert.ok(rendered.some(x=>x.includes("J'y étais")));
for(const forbidden of ["NEVER_PHONE_224","NEVER_EMAIL","NEVER_ADDRESS","NEVER_NATIONALITY",
 "NEVER_COMPANIONS","NEVER_PRIVATE_NOTE","NEVER_MILES","NEVER_EMBASSY"]){
 assert.doesNotMatch(rendered.join(" "),new RegExp(forbidden),"Forbidden data reached the 1080x1350 drawing");
}
const html=fs.readFileSync("travel/index.html","utf8");
const sw=fs.readFileSync("travel/sw.js","utf8");
const css=fs.readFileSync("travel/trip-premium.css","utf8");
for(const id of ["detailShare","detailShareDialog","detailShareSend","detailShareSave",
 "detailSharePreview","detailGalleryCount","detailLightbox","detailCountryTitle",
 "detailStopsSection","detailActivitiesSection","detailNoteSection"]){
 assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(html,/navigator\.share\(\{files:\[detailShareFile\],title:"J'y étais"\}\)/);
assert.match(html,/SHARE\.safeTrip\(trip,countryName\(trip\.country_code\)/);
assert.match(html,/Math\.min\(3,detailPhotoRows\.length\)/);
assert.match(html,/detailPhotoRows\.slice\(0,2\)\.map\(/);
assert.match(html,/S\.from\("media"\)\.select\("id,storage_path,caption"\)\.eq\("user_id",user\.id\)\.eq\("trip_id",id\)/);
assert.match(css,/scroll-snap-type:x mandatory/);
assert.match(css,/aspect-ratio:100 \/ 56/);
assert.match(css,/#detailShareSend\[hidden\]/);
assert.ok(!sw.includes("cache.put("));
assert.ok(sw.includes("./trip-share.js")&&sw.includes("./trip-premium.css"));
assert.match(sw,/jyetais-v56-detail-share/);
assert.match(DETAIL.photos([{id:"one",url:"https://fixture.invalid/p.webp"}]),/photoTap/);
console.log("PASS private PNG share allowlist, 1080×1350, synchronous file share, snap gallery and offline shell");
