// J'y étais · private trip detail: simple, escaped presentation helpers.
// No public photo URLs or document data are ever created by this module.
(function (root) {
  "use strict";
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  function dateFR(value) {
    if (!value) return "";
    const date = new Date(value + "T12:00:00");
    return Number.isNaN(date.getTime()) ? "" :
      date.toLocaleDateString("fr-FR", {day:"numeric",month:"long",year:"numeric"});
  }
  const DURATIONS=root?.BEAM_ACTIVITY_DURATIONS||(typeof require==="function"?require("./activity-durations.js"):null);
  const MAX_CAPTION=500;
  const captionValue=value=>typeof value==="string"?value.trim().slice(0,MAX_CAPTION):"";
  function badges(row,stay={}){
    const flags=[
      [stay.coverMediaId===row.id,"★","Couverture"],
      [!!stay.airline&&stay.airlineMediaId===row.id,"✈","Vol"],
      [!!stay.hotel&&stay.hotelMediaId===row.id,"🏨","Hôtel"]
    ].filter(item=>item[0]);
    return flags.length?'<span class="photoRoles" aria-hidden="true">'+
      flags.map(([,symbol,label])=>'<span class="photoRole" title="'+esc(label)+'">'+symbol+'</span>').join("")+
      '</span>':"";
  }
  function photos(rows,stay={}) {
    if (!rows.length) return '<p class="detailEmpty">Aucune photo pour ce voyage.</p>';
    const items=rows.map(row=>{
      const caption=captionValue(row.caption);
      return '<figure class="detailPhoto" data-media-id="'+esc(row.id)+'">'+
        '<button type="button" class="photoTap" data-id="'+esc(row.id)+'" aria-label="Voir la photo en plein écran">'+
        (row.url?'<img loading="lazy" alt="Photo privée du voyage" src="'+esc(row.url)+'">':
          '<span class="detailPhotoMissing">Prévisualisation indisponible</span>')+
        badges(row,stay)+'</button>'+
        (caption?'<figcaption class="photoOneLine">'+esc(caption)+'</figcaption>':"")+'</figure>';
    }).join("");
    return items;
  }
  // Date-only values must not drift across time zones.
  function validDate(value){
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+"T12:00:00Z");
    return !Number.isNaN(+date)&&date.toISOString().slice(0,10)===value;
  }
  function sortedActivities(rows){
    return (Array.isArray(rows)?rows:[]).slice().sort((a,b)=>{
      const ad=validDate(a?.happened_on)?a.happened_on:null;
      const bd=validDate(b?.happened_on)?b.happened_on:null;
      if(ad===null&&bd!==null)return 1;
      if(bd===null&&ad!==null)return -1;
      if(ad&&bd&&ad!==bd)return ad.localeCompare(bd);
      return 0; // stable input order for same date / undated rows
    });
  }
  function souvenirDateLine(from,to){
    if(!validDate(from)||!validDate(to))return "";
    const full=iso=>new Intl.DateTimeFormat("fr-FR",
      {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})
      .format(new Date(iso+"T12:00:00Z")).replace(/\u202f/g," ");
    let period=full(from);
    if(from!==to){
      if(from.slice(0,7)===to.slice(0,7))period=String(Number(from.slice(8,10)))+" au "+full(to);
      else period=full(from)+" au "+full(to);
    }
    return "Écrit pour le voyage du "+period;
  }
  function dateBadge(iso){
    if(!validDate(iso))return '<span class="detailActivityDate detailActivityUndated" aria-label="Sans date">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '+
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
      '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Z"/>'+
      '<circle cx="12" cy="10" r="2.5"/></svg></span>';
    const date=new Date(iso+"T12:00:00Z");
    const month=new Intl.DateTimeFormat("fr-FR",{month:"short",timeZone:"UTC"})
      .format(date).replace(/\.$/,"").replace(/\u202f/g," ");
    const full=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date);
    return '<time class="detailActivityDate" datetime="'+esc(iso)+'" aria-label="'+esc(full)+'">'+
      '<span class="detailActivityDay">'+Number(iso.slice(8,10))+'</span>'+
      '<span class="detailActivityMonth">'+esc(month)+'</span></time>';
  }
  function activities(rows,editable=true,options={}) {
    const ordered=sortedActivities(rows);
    if (!ordered.length) return '<p class="detailEmpty">Aucune activité pour le moment.</p>';
    // A thumbnail is NEVER inferred from other trip photos. Its caller must
    // provide an explicitly linked, owner-scoped, trusted signed URL per activity.
    const signed=options?.signedPhotoByActivity||{};
    return '<ul class="detailActivityList detailTimeline">'+ordered.map(row=>{
      const duration=Number(row.duration_days)||1;
      const metadata=[row.place?esc(row.place):"",duration>=2?esc(duration+" jours"):""].filter(Boolean);
      const candidate=options?.offline?"":signed[row.id];
      const safeUrl=typeof candidate==="string"&&options?.supabaseUrl&&
        root?.BEAM_VISUAL_CARDS?.trustedSignedUrl?
        root.BEAM_VISUAL_CARDS.trustedSignedUrl(candidate,options.supabaseUrl):"";
      return '<li class="detailActivity">'+dateBadge(row.happened_on)+
        '<div class="detailActivityText"><strong>'+esc(row.title)+'</strong>'+
        (metadata.length?'<p class="detailActivityMeta">'+metadata.join(' · ')+'</p>':"")+'</div>'+
        (safeUrl?'<img class="detailActivityThumb" loading="lazy" referrerpolicy="no-referrer"'+
          ' alt="Photo privée du moment" src="'+esc(safeUrl)+'">':"")+
        (editable?'<button type="button" class="btn ghost detailRemoveActivity" data-id="'+esc(row.id)+
          '" aria-label="Supprimer l’activité '+esc(row.title)+'">Retirer</button>':"")+
        '</li>';
    }).join("")+'</ul>';
  }
  function validateActivity({title,place,happened_on,duration_days=1}, trip) {
    const cleanTitle = String(title ?? "").trim();
    const cleanPlace = String(place ?? "").trim();
    const date = String(happened_on ?? "").trim();
    if (!cleanTitle || cleanTitle.length > 160) return {error:"Saisissez un titre de 160 caractères maximum."};
    if (cleanPlace.length > 160) return {error:"Le lieu est limité à 160 caractères."};
    const days=Number(duration_days);
    const durationError=DURATIONS?.validate(date,days,trip);
    if(durationError)return {error:durationError};
    if(!DURATIONS&&(!Number.isInteger(days)||days<1||days>30))return {error:"Durée invalide."};
    return {value:{title:cleanTitle,place:cleanPlace || null,happened_on:date || null,duration_days:days,kind:"lieu"}};
  }
  const api=Object.freeze({photos,badges,captionValue,MAX_CAPTION,activities,sortedActivities,souvenirDateLine,validateActivity,dateFR});
  if(root)root.BEAM_TRIP_DETAIL=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
