"use strict";
// Source allowlist is tested independently from browser IndexedDB persistence.
const assert=require("node:assert/strict");
const OFF=require("../travel/offline-store.js");
const uid="11111111-1111-4111-8111-111111111111";
const tripId="22222222-2222-4222-8222-222222222222";
const secret="TOKEN_PRIVATE_PHOTO_SIGNED_URL_1049";
const snap=OFF.project(uid,{
 display_name:"Voyageuse Fictive",
 home_city:"Conakry",
 country_of_residence:"GN",
 email:secret,phone:secret,postal_address:secret,nationality:secret,
 access_token:secret,session:secret,photo_url:"https://signed.invalid/?token="+secret
},[
 {id:tripId,country_code:"FR",cities:["Paris"],entry_date:"2026-01-03",
  exit_date:"2026-01-07",duration_days:5,purpose:"tourisme",
  airline:"Compagnie fictive",hotel:"Hôtel fictif",companions:"Amie fictive",
  status:"ended",is_domestic:false,phone:secret,postal_address:secret,
  nationality:secret,access_token:secret,session:secret,cover_media_id:secret,
  storage_path:secret,signedUrl:"https://storage.invalid?token="+secret,
  photo_url:"https://storage.invalid",note:secret,passport:secret,
  stops:[{id:"33333333-3333-4333-8333-333333333333",
   country_code:"BE",cities:["Bruxelles"],entry_date:"2026-01-04",exit_date:"2026-01-05",
   phone:secret,photo_url:secret}]}
],[
 {id:"44444444-4444-4444-8444-444444444444",trip_id:tripId,
  title:"Visite du musée",place:"Quartier fictif",happened_on:"2026-01-04",
  duration_days:1,email:secret,metadata:secret},
 {id:"55555555-5555-4555-8555-555555555555",
  trip_id:"99999999-9999-4999-8999-999999999999",title:"Other owner"}
],Date.UTC(2026,10,14,12));
assert.deepEqual(Object.keys(snap).sort(),["activities","key","ownerId","profile","trips","updatedAt"].sort());
assert.deepEqual(Object.keys(snap.profile).sort(),[
 "display_name","home_city","country_of_residence"].sort());
assert.deepEqual(snap.profile,{display_name:"Voyageuse Fictive",
 home_city:"Conakry",country_of_residence:"GN"});
// The projector reads precisely two ASCII uppercase letters; it never
// normalizes an invalid value into an allowed one.
for(const invalid of ["gn","G", "GNA","G1"," FR","FR ","éN","",null,10]){
 const row=OFF.project(uid,{display_name:"Test",home_city:"A".repeat(120),
  country_of_residence:invalid},[],[]);
 assert.equal(row.profile.country_of_residence,"","Invalid country must become empty");
 assert.equal(row.profile.home_city.length,80);
}
assert.equal(OFF.project(uid,{home_city:"https://signed.invalid/private",
 country_of_residence:"FR"},[],[]).profile.home_city,"",
 "Profile city must reject signed URLs");
assert.deepEqual(OFF.project(uid,"Old client",[],[]).profile,{
 display_name:"Old client",home_city:"",country_of_residence:""
},"Previous callers must remain compatible");
assert.deepEqual(Object.keys(snap.trips[0]).sort(),
 ["id","country_code","cities","entry_date","exit_date","duration_days",
  "purpose","airline","hotel","companions","status","is_domestic","stops"].sort());
assert.deepEqual(Object.keys(snap.trips[0].stops[0]).sort(),
 ["id","country_code","cities","entry_date","exit_date","position"].sort());
assert.deepEqual(Object.keys(snap.activities[0]).sort(),
 ["id","trip_id","title","place","happened_on","duration_days"].sort());
assert.equal(snap.activities.length,1,"Only activities within this user's trips");
const text=JSON.stringify(snap);
for(const sensitive of [secret,"phone","postal_address","nationality","email","token","session",
 "signedUrl","storage_path","photo_url","note","passport","metadata"]){
 assert.ok(!text.includes(sensitive),"Forbidden IndexedDB content: "+sensitive);
}
const now=Date.UTC(2026,10,14,12);
assert.equal(OFF.fresh({updatedAt:new Date(now-30*864e5).toISOString()},now),true);
assert.equal(OFF.fresh({updatedAt:new Date(now-30*864e5-1).toISOString()},now),false);
assert.equal(OFF.fresh({updatedAt:new Date(now+3600e3).toISOString()},now),false);
assert.equal(OFF.DB_NAME,"jyetais-offline");
console.log("PASS strict allowlist: journeys and name/city/ISO residence only; 30-day expiry, no email/contact/token/photo/PDF");
