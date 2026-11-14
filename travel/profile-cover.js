// Deterministic cover priority, with NO external fetches or private URL persistence.
(function(root){
 "use strict";
 const LIFE=root?.BEAM_TRIP_LIFECYCLE||(typeof require==="function"?require("./trip-lifecycle.js"):null);
 const VISUAL=root?.BEAM_VISUAL_CARDS||(typeof require==="function"?require("./visual-cards.js"):null);
 function decide(profile,trips,photos,today,owner){
  const owned=(photos||[]).filter(m=>m&&m.user_id===owner&&typeof m.id==="string"&&typeof m.storage_path==="string");
  const selected=profile?.cover_media_id&&owned.find(m=>m.id===profile.cover_media_id);
  if(selected)return {source:"manual",photo:selected,countryCode:""};
  const completed=(trips||[]).filter(t=>t&&!t.deleting&&t.exit_date&&
   (LIFE?LIFE.completed(t,today):t.exit_date<today))
   .sort((a,b)=>String(b.exit_date).localeCompare(String(a.exit_date))||
     String(b.entry_date).localeCompare(String(a.entry_date))||String(a.id).localeCompare(String(b.id)));
  const ownedByTrip=new Map();
  for(const m of owned){if(!ownedByTrip.has(m.trip_id))ownedByTrip.set(m.trip_id,[]);ownedByTrip.get(m.trip_id).push(m)}
  for(const list of ownedByTrip.values())list.sort((a,b)=>{
   const ap=Number.isFinite(Number(a.position))?Number(a.position):Number.MAX_SAFE_INTEGER;
   const bp=Number.isFinite(Number(b.position))?Number(b.position):Number.MAX_SAFE_INTEGER;
   return ap-bp||String(a.created_at||"").localeCompare(String(b.created_at||""))||
     String(a.id).localeCompare(String(b.id));
  });
  for(const trip of completed){
   const images=ownedByTrip.get(trip.id)||[];
   const favorite=images.find(m=>m.is_favorite===true);
   if(favorite)return {source:"favorite",photo:favorite,countryCode:trip.country_code};
   if(images[0])return {source:"recent",photo:images[0],countryCode:trip.country_code};
  }
  const code=completed[0]?.country_code||"";
  if(code&&VISUAL?.countryArt(code))return {source:"country",photo:null,countryCode:code,url:VISUAL.countryArt(code)};
  return {source:"solid",photo:null,countryCode:"",url:""};
 }
 function safeUrl(url,project){return VISUAL?.trustedSignedUrl(url,project)||""}
 const api=Object.freeze({decide,safeUrl});
 if(root)root.BEAM_PROFILE_COVER=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
