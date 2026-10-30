// BEAM Travel History: country visuals are local assets; covers are owned signed URLs.
// Never send country codes to Unsplash, flag CDNs or any analytics/image service.
(function(root){
  "use strict";
  const COUNTRY_ART=Object.freeze(["FR","MA","GN","SA","TR","SN"]);
  const COUNTRY_SET=new Set(COUNTRY_ART);
  // Only icons actually vendored in travel/assets/flags. Other ISO countries
  // still show the accessible country label and ISO code, without 404 requests.
  const FLAG_CODES=Object.freeze(["GN","FR","MA","SN","SA","TR","ML","CI","SL","BE","AE","CN","CA","US","GB","DE","IT","ES","PT","DZ","CD","CG","SG","BH","MT","GF","GP","RE","MQ","GH"]);
  const FLAG_SET=new Set(FLAG_CODES);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function esc(s){return String(s??"").replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch])}
  function codeOf(raw){
    const code=typeof raw==="string"?raw.trim().toUpperCase():"";
    return /^[A-Z]{2}$/.test(code) && root?.BEAM_COUNTRIES?.valid(code)?code:"";
  }
  function countryArt(raw){
    const code=codeOf(raw);
    return COUNTRY_SET.has(code)?"./assets/countries/"+code.toLowerCase()+".webp":"";
  }
  function flag(raw){
    const code=codeOf(raw);
    return FLAG_SET.has(code)?"./assets/flags/"+code.toLowerCase()+".svg":"";
  }
  function markup(trip,countryLabel,purposeLabel,dateLabel){
    const code=codeOf(trip.country_code),image=countryArt(code),icon=flag(code);
    const id=typeof trip.id==="string"&&UUID.test(trip.id)?trip.id:"";
    const country=esc(countryLabel),cities=esc((trip.cities||[]).join(", "));
    const dates=esc(dateLabel),purpose=esc(purposeLabel);
    const days=Number(trip.duration_days);
    const safeDays=Number.isInteger(days)&&days>=0?days:"—";
    // Decorative media is always public, local and anonymous; private cover URLs
    // are inserted LATER by the authenticated session, never serialized in markup.
    return '<article class="trip journeyTrip"><button type="button" class="tripOpen" data-id="'+esc(id)+
     '" aria-label="Voir la fiche du voyage à '+cities+'">'+
     (image?'<img class="journeyBackdrop" src="'+image+'" alt="" loading="lazy" decoding="async" width="800" height="340">':'')+
     '<span class="journeyShade" aria-hidden="true"></span>'+
     '<span class="journeyContent">'+
       '<span class="journeyFlagLine">'+
         (icon?'<img class="journeyFlag" src="'+icon+'" alt="" loading="lazy" width="26" height="20">':'')+
         '<span class="journeyCode">'+esc(code||"—")+'</span>'+
         (trip.is_domestic?'<span class="journeyDomestic">Voyage intérieur</span>':'')+
       '</span>'+
       '<span class="journeyCountry">'+country+'</span>'+
       '<span class="journeyCities">'+cities+'</span>'+
       '<span class="journeyFooter">'+dates+' · '+safeDays+' jours · '+purpose+'</span>'+
       '<span class="journeyLink">Voir la fiche →</span>'+
     '</span></button></article>';
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
