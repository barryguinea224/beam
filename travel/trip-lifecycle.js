// J'y étais : status is derived in the browser, never persisted or sent.
(function(root){
 "use strict";
 function today(now=new Date()){const d=now instanceof Date?now:new Date(now);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
 function state(t,day=today()){return !t?.entry_date?"ended":t.entry_date>day?"upcoming":t.exit_date&&t.exit_date>=day?"ongoing":"ended"}
 function label(t,day=today()){return ({upcoming:"À venir",ongoing:"En cours"})[state(t,day)]||""}
 function started(t,day=today()){return !!t?.entry_date&&t.entry_date<=day}
 function completed(t,day=today()){return !!t?.exit_date&&t.exit_date<day}
 function calendarDays(a,b){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||""))return 0;
  const n=(Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000;
  return Number.isFinite(n)?Math.max(0,Math.floor(n)+1):0;
 }
 function elapsedDays(t,day=today()){
  if(!started(t,day))return 0;
  const n=Number(t.duration_days),full=Number.isFinite(n)&&n>=0?n:calendarDays(t.entry_date,t.exit_date);
  return t.exit_date?Math.min(full,calendarDays(t.entry_date,t.exit_date<day?t.exit_date:day)):full;
 }
 function stops(t){return Array.isArray(t?.stops)?t.stops:[]}
 const uniq=codes=>[...new Set(codes.filter(Boolean))];
 function visitedCodes(t,day=today()){
  return !started(t,day)?[]:uniq([t.country_code,...stops(t).filter(s=>s.entry_date&&s.entry_date<=day).map(s=>s.country_code)]);
 }
 function plannedCodes(t,day=today()){
  return !t?[]:!started(t,day)?uniq([t.country_code,...stops(t).map(s=>s.country_code)]):uniq(stops(t).filter(s=>s.entry_date>day).map(s=>s.country_code));
 }
 const api=Object.freeze({today,state,label,started,completed,calendarDays,elapsedDays,visitedCodes,plannedCodes});
 if(root)root.BEAM_TRIP_LIFECYCLE=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
