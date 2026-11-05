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
  const MAX_CAPTION=500;
  function captionValue(value) {
    return typeof value==="string" ? value.trim().slice(0,MAX_CAPTION) : "";
  }
  function photos(rows) {
    if (!rows.length) return '<p class="detailEmpty">Aucune photo pour ce voyage.</p>';
    return rows.map(row => {
      const id=esc(row.id),caption=captionValue(row.caption);
      return '<figure class="detailPhoto" data-media-id="' + id + '">' +
        (row.url ? '<img loading="lazy" alt="Photo privée du voyage" src="' + esc(row.url) + '">' :
          '<div class="detailPhotoMissing">Prévisualisation indisponible</div>') +
        (caption ? '<figcaption class="detailPhotoCaption">' + esc(caption) + '</figcaption>' : '') +
        '<button type="button" class="detailCaptionToggle" data-id="' + id +
          '" aria-expanded="false">' + (caption?'Modifier la note':'Ajouter une note') + '</button>' +
        '<form class="detailCaptionForm hidden" data-id="' + id + '">' +
          '<label>Note de la photo (facultatif)<textarea name="caption" rows="3" maxlength="500">' +
          esc(caption) + '</textarea></label>' +
          '<div class="detailCaptionActions"><small class="detailCaptionCount" aria-live="polite">' +
          caption.length + ' / 500</small><button type="submit" class="btn">Enregistrer</button>' +
          '<button type="button" class="btn ghost detailCaptionCancel">Annuler</button></div>' +
          '<p class="detailCaptionMessage" role="status" aria-live="polite"></p>' +
        '</form></figure>';
    }).join("");
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
  const api=Object.freeze({photos,captionValue,MAX_CAPTION,activities,validateActivity,dateFR});
  if(root)root.BEAM_TRIP_DETAIL=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
