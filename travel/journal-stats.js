// Voyage international only in header statistics; full journal/map remain unchanged.
(function(root){
  "use strict";
  const LIFE=root?.BEAM_TRIP_LIFECYCLE||(typeof require==="function"?require("./trip-lifecycle.js"):null);
  function summarize(rows,asOf=LIFE.today()){
    const eligible=rows.filter(t=>!t.is_domestic&&!t.deleting&&LIFE.started(t,asOf));
    const domestic=rows.filter(t=>t.is_domestic&&!t.deleting&&LIFE.started(t,asOf)).length;
    return Object.freeze({
      trips:eligible.length,
      countries:new Set(eligible.flatMap(t=>LIFE.visitedCodes(t,asOf))).size,
      days:eligible.reduce((n,t)=>n+LIFE.elapsedDays(t,asOf),0),
      domestic
    });
  }
  const api=Object.freeze({summarize});
  if(root)root.BEAM_JOURNAL_STATS=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
