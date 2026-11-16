// J'y étais: country visuals are local assets; covers are owned signed URLs.
// Never send country codes to Unsplash, flag CDNs or any analytics/image service.
(function(root){
  "use strict";
  const COUNTRY_ART=Object.freeze(["FR","MA","GN","SA","TR","SN"]);
  const FR=root?.BEAM_FR_ACCORDS||(typeof require==="function"?require("./fr-accords.js"):null);
  const LIFE=root?.BEAM_TRIP_LIFECYCLE||(typeof require==="function"?require("./trip-lifecycle.js"):null);
  const COUNTRY_SET=new Set(COUNTRY_ART);
  // All ISO 3166-1 alpha-2 flags are bundled locally; use the same 249-code
  // catalogue as the printable journal, never a second manually curated list.
  const COUNTRIES=root?.BEAM_COUNTRIES||(typeof require==="function"?require("./countries.js"):null);
  const FLAG_CODES=Object.freeze([...COUNTRIES.ORDER]);
  const FLAG_SET=new Set(FLAG_CODES);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function esc(s){return String(s??"").replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch])}
  function codeOf(raw){
    const code=typeof raw==="string"?raw.trim().toUpperCase():"";
    return /^[A-Z]{2}$/.test(code) && COUNTRIES.valid(code)?code:"";
  }
  function countryArt(raw){
    const code=codeOf(raw);
    return COUNTRY_SET.has(code)?"./assets/countries/"+code.toLowerCase()+".svg":"";
  }
  function flag(raw){
    const code=codeOf(raw);
    return FLAG_SET.has(code)?"./assets/flags/"+code.toLowerCase()+".svg":"";
  }
  function markup(trip,countryLabel,purposeLabel,dateLabel){
    const code=codeOf(trip.country_code),art=countryArt(code),flagUrl=flag(code);
    const id=typeof trip.id==="string"&&UUID.test(trip.id)?trip.id:"";
    const cities=Array.isArray(trip.cities)?trip.cities.join(", "):"";
    const state=LIFE?.state(trip)||"ended",status=LIFE?.label(trip)||"";
    const isDay=trip.entry_date===trip.exit_date,days=Number(trip.duration_days);
    const daysLabel=isDay?"Excursion · 1 jour":Number.isInteger(days)&&days>=0?FR.count(days,"jour"):"—";
    const summary=[dateLabel,daysLabel,purposeLabel].filter(Boolean).map(esc)
      .join('<span class="journeySeparator" aria-hidden="true">|</span>');
    const stops=Array.isArray(trip.stops)?trip.stops:[];
    const extras=[];
    if(stops.length){
      const first=codeOf(stops[0].country_code);
      extras.push(FR.count(stops.length,"étape")+(first?" · "+(COUNTRIES.NAMES[first]||first):""));
    }
    if(typeof trip.companions==="string"&&trip.companions.trim())extras.push("Avec "+trip.companions.trim());
    if(typeof trip.airline==="string"&&trip.airline.trim())extras.push(trip.airline.trim());
    const infoIcon='<svg class="journeyMetaIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>';
    return '<article class="trip journeyTrip" data-id="'+esc(id)+'">'+
      '<div class="journeyMedia">'+
        (art?'<img class="journeyBackdrop" src="'+art+'" alt="" loading="lazy" decoding="async" width="800" height="450">':'')+
        '<span class="journeyFlagFallback"'+(art?' hidden':'')+'>'+
          (flagUrl?'<img src="'+flagUrl+'" alt="" loading="lazy" width="84" height="60">':'')+
        '</span>'+
        '<span class="journeyFlagLine">'+
          (flagUrl?'<img class="journeyFlag" src="'+flagUrl+'" alt="" loading="lazy" width="26" height="20">':'')+
          '<span class="journeyCode">'+esc(code||"—")+'</span>'+
        '</span>'+
        (status?'<span class="journeyStatus journeyStatus-'+state+'">'+esc(status)+'</span>':'')+
      '</div>'+
      '<div class="journeyContent">'+
        '<h3 class="journeyCountry">'+esc(countryLabel)+'</h3>'+
        '<p class="journeyCities">'+esc(cities)+'</p>'+
        '<p class="journeyFooter">'+summary+'</p>'+
        (trip.is_domestic?'<p class="journeyDomestic">Séjour national</p>':'')+
        (extras.length?'<div class="journeyExtras">'+extras.map(x=>
          '<span class="journeyExtra">'+infoIcon+'<span>'+esc(x)+'</span></span>').join("")+'</div>':'')+
        '<button type="button" class="tripOpen journeyLink" data-id="'+esc(id)+'" aria-label="Voir la fiche du voyage en '+esc(countryLabel)+'">Voir la fiche</button>'+
      '</div></article>';
  }
  // Strict allowed origin: the existing first-party Supabase project Storage URL.
  // A failed, expired, missing or unowned URL is never used.
  function trustedSignedUrl(raw,projectUrl){
    try{
      const project=new URL(projectUrl),signed=new URL(raw);
      return signed.protocol==="https:" && signed.origin===project.origin &&
        signed.pathname.startsWith("/storage/v1/object/sign/media/")?signed.href:"";
    }catch{return ""}
  }
  const api=Object.freeze({COUNTRY_ART,FLAG_CODES,codeOf,countryArt,flag,markup,trustedSignedUrl});
  if(root)root.BEAM_VISUAL_CARDS=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
