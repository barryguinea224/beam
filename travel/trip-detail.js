// BEAM Travel History · private trip detail: simple, escaped presentation helpers.
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
  function photos(rows,stay={}) {
    if (!rows.length) return '<p class="detailEmpty">Aucune photo pour ce voyage.</p>';
    const canEdit=stay.canEdit===true;
    const buttons=row=>!canEdit ? "" : '<div class="detailPhotoActions">' +
      (stay.airline ? '<button type="button" class="btn ghost stayPhotoChoice" data-stay-role="airline" data-id="'+esc(row.id)+'">'+
        (stay.airlineMediaId===row.id?'Retirer la photo du vol':'Utiliser comme photo du vol')+'</button>':"") +
      (stay.hotel ? '<button type="button" class="btn ghost stayPhotoChoice" data-stay-role="hotel" data-id="'+esc(row.id)+'">'+
        (stay.hotelMediaId===row.id?'Retirer la photo de l’hôtel':'Utiliser comme photo de l’hôtel')+'</button>':"") +
      '</div>';
    const items=rows.map(row=>'<figure class="detailPhoto">' +
      (row.url ? '<img loading="lazy" alt="Photo privée du voyage" src="'+esc(row.url)+'">' :
        '<div class="detailPhotoMissing">Prévisualisation indisponible</div>') +
      buttons(row) + '</figure>').join("");
    return items+(canEdit&&(stay.airline||stay.hotel)?
      '<p class="detailPhotoAdvice">Ne photographiez jamais votre carte d’embarquement ni votre confirmation de réservation : elles contiennent des numéros personnels.</p>':"");
  }
  function activities(rows) {
    if (!rows.length) return '<p class="detailEmpty">Aucune activité pour le moment.</p>';
    return '<ul class="detailActivityList">' + rows.map(row => {
      const meta = [row.place && esc(row.place),row.happened_on && esc(dateFR(row.happened_on))].filter(Boolean);
      return '<li class="detailActivity"><div class="detailActivityText"><strong>' + esc(row.title) +
        '</strong>' + (meta.length ? '<p>' + meta.join(" · ") + '</p>' : '') +
        '</div><button type="button" class="btn ghost detailRemoveActivity" data-id="' + esc(row.id) +
        '" aria-label="Supprimer l’activité ' + esc(row.title) + '">Retirer</button></li>';
    }).join("") + '</ul>';
  }
  function validateActivity({title,place,happened_on}, trip) {
    const cleanTitle = String(title ?? "").trim();
    const cleanPlace = String(place ?? "").trim();
    const date = String(happened_on ?? "").trim();
    if (!cleanTitle || cleanTitle.length > 160) return {error:"Saisissez un titre de 160 caractères maximum."};
    if (cleanPlace.length > 160) return {error:"Le lieu est limité à 160 caractères."};
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < trip.entry_date || date > trip.exit_date)) {
      return {error:"La date doit être comprise entre l’entrée et la sortie du voyage."};
    }
    return {value:{title:cleanTitle,place:cleanPlace || null,happened_on:date || null,kind:"lieu"}};
  }
  const api=Object.freeze({photos,activities,validateActivity,dateFR});
  if(root)root.BEAM_TRIP_DETAIL=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
