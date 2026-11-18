"use strict";
// Pure P0 album contracts with fictional content only.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ALBUM=require("../travel/trip-album.js");
const HTML=fs.readFileSync("travel/index.html","utf8");
const CSS=fs.readFileSync("travel/trip-album.css","utf8");
const MIGRATION=fs.readFileSync("travel/supabase/migrations/2026111810000_trip_album_p0.sql","utf8");
const SHARE=fs.readFileSync("travel/trip-share.js","utf8");
const OFF=fs.readFileSync("travel/offline-store.js","utf8");
const SW=fs.readFileSync("travel/sw.js","utf8");
const title=ALBUM.title;
assert.equal(title("  Le Japon, enfin.  ","Japon"),"Le Japon, enfin.");
assert.equal(title("","Japon"),"Japon");
assert.equal(title(null,"France"),"France");
assert.equal(title("X".repeat(61),"France"),"France");
assert.equal(ALBUM.featured([],[]).length,0,"Zero photos => zero moments");
const trip={cities:["Kyoto","Tokyo"],duration_days:11,stops:[{country_code:"JP",cities:["Tokyo"]}]};
assert.match(ALBUM.statsHTML(trip,0),/11 jours/);
assert.match(ALBUM.statsHTML(trip,0),/2 villes/);
assert.match(ALBUM.statsHTML(trip,0),/0 photos/);
assert.doesNotMatch(ALBUM.statsHTML(trip,0,true),/>0 photos</);
const one=[{id:"photo-a",width:700,height:1200,activity_id:null}];
assert.equal(ALBUM.featured([{id:"activity-a",title:"Visite"}],one).length,0,
 "One photo, no linked moment => beautiful cover only");
const mosaic=ALBUM.mosaicHTML(one,true);
assert.match(mosaic,/albumTile-portrait/);
assert.match(mosaic,/data-album-photo-id="photo-a"/);
assert.match(mosaic,/Toucher pour les options/);
const photos=[
 {id:"p",activity_id:"a2",width:800,height:1400},
 {id:"l",activity_id:"a1",width:1600,height:900},
 {id:"s",activity_id:null,width:1000,height:1000}
];
assert.equal(ALBUM.orientation(photos[0]),"portrait");
assert.equal(ALBUM.orientation(photos[1]),"landscape");
assert.equal(ALBUM.orientation(photos[2]),"square");
const acts=[
 {id:"a2",title:"Lever de soleil",place:"Mont Fuji",happened_on:"2026-10-12"},
 {id:"a1",title:"Shinjuku",place:"Tokyo",happened_on:"2026-10-10"},
 {id:"a3",title:"Jour sans photo",place:"Osaka",happened_on:"2026-10-13"}
];
assert.deepEqual(ALBUM.featured(acts,photos).map(x=>x.activity.id),["a1","a2"],
 "Moments photo-linked, ordered by date");
assert.doesNotMatch(ALBUM.featuredHTML(acts,photos),/Jour sans photo/);
assert.match(ALBUM.featuredHTML(acts,photos),/albumMomentPhoto/);
assert.match(ALBUM.featuredHTML(acts,photos),/albumMomentPhoto-portrait/);
assert.equal(ALBUM.featured(Array.from({length:7},(_,i)=>({id:"a"+i,happened_on:"2026-10-"+String(i+1).padStart(2,"0")})),
 Array.from({length:7},(_,i)=>({id:"p"+i,activity_id:"a"+i}))).length,5);
const malicious=ALBUM.featuredHTML([{id:"x",title:'<img src=x onerror=alert(1)>',place:"<script>"}],
 [{id:"p",activity_id:"x"}]);
assert.doesNotMatch(malicious,/<img src=x|<script>/);
assert.match(malicious,/&lt;img/);
assert.match(ALBUM.mosaicHTML(photos),/albumTile-landscape/);
assert.match(ALBUM.mosaicHTML(photos),/albumTile-portrait/);
assert.match(ALBUM.routeHTML(trip,"Japon"),/Japon/);
assert.match(ALBUM.routeHTML(trip,"Japon"),/Kyoto/);
assert.match(CSS,/min\(62svh,540px\)/);
assert.match(CSS,/linear-gradient/);
assert.match(CSS,/albumTile-landscape/);
assert.match(CSS,/albumTile-portrait/);
assert.match(CSS,/min-height:48px/);
assert.match(HTML,/id="detailSlideshowOpen"[^>]*>.*Revivre/);
assert.doesNotMatch(HTML,/id="detailSlideshowOpen"[^>]*\\sdisabled(?:\\s|>)/,"Revivre must never start disabled");
assert.match(HTML,/button.hidden=!hasPhotos/,"No photo: Revivre hidden");
assert.match(HTML,/button.classList.toggle\\("hidden",!hasPhotos\\)/,"Hidden survives album flex CSS");
assert.match(HTML,/button.disabled=false/,"Revivre remains enabled");
assert.match(HTML,/if\\(count===1\\)void detailOpenLightbox\\(0,\\$\\("#detailSlideshowOpen"\\)\\)/,"One photo: existing viewer");
assert.match(HTML,/else if\\(count>=2\\)SLIDESHOW.open\\(\\)/,"Two or more photos: existing slideshow");
assert.match(HTML,/id="photoUsage"[^>]*>0 \\/ 15 photos enregistrées/);
assert.match(HTML,/id="detailNoPhotoAdd"/);
assert.match(HTML,/id="detailTimelineDisclosure"/);
assert.match(HTML,/id="detailFeaturedSection"/);
assert.match(HTML,/id="detailPelliculeSection"/);
assert.match(HTML,/id="photoMomentToggle"/);
assert.match(HTML,/id="tripPersonalTitle" name="title" maxlength="60"/);
assert.match(HTML,/\.update\(\{activity_id:selected\}\)/);
assert.match(HTML,/S\.from\("media"\)\.select\("id,storage_path,caption,activity_id,width,height"\)/);
assert.match(MIGRATION,/foreign key\(activity_id,trip_id,user_id\)/);
assert.match(MIGRATION,/on delete set null\(activity_id\)/);
assert.match(MIGRATION,/security invoker set search_path=''/);
assert.match(MIGRATION,/char_length\(title\)<=60/);
assert.doesNotMatch(MIGRATION,/enforce_media_photo_quota/);
assert.doesNotMatch(MIGRATION,/travel_history_pdf/);
assert.match(SHARE,/function safeTrip\(/);
assert.doesNotMatch(SHARE,/trip\?\.title/);
assert.match(OFF,/title:safeText\(x\?\.title,60\)/);
assert.doesNotMatch(OFF,/photo_url:|storage_path:|signedUrl:/);
assert.match(SW,/\.\/trip-album\.js/);
assert.match(SW,/\.\/trip-album\.css/);
new vm.Script(ALBUM.featuredHTML.toString());
console.log("PASS album P0: 4 states, privacy, featured/mosaic, SQL invariant and UX");
