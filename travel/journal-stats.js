// Voyage international only in header statistics; full journal/map remain unchanged.
(function(root){
  "use strict";
  function summarize(rows){
    const eligible=rows.filter(t=>!t.is_domestic&&!t.deleting);
    const domestic=rows.filter(t=>t.is_domestic&&!t.deleting).length;
    return Object.freeze({
      trips:eligible.length,
      countries:new Set(eligible.map(t=>t.country_code)).size,
      days:eligible.reduce((n,t)=>n+(Number(t.duration_days)||0),0),
      domestic
    });
  }
  const api=Object.freeze({summarize});
  if(root)root.BEAM_JOURNAL_STATS=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
