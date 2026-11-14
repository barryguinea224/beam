// J'y étais — one-day trips and overlap proposals. Pure helpers, no network or personal state.
(function(root){
"use strict";
const COUNTRIES=root?.BEAM_COUNTRIES||(typeof require==="function"?require("./countries.js"):null);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
function validDate(value){
 if(typeof value!=="string"||!ISO.test(value))return false;
 const parsed=new Date(value+"T12:00:00Z");
 return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value;
}
function single(row){return validDate(row?.entry_date)&&row.entry_date===row.exit_date;}
function short(iso){
 if(!validDate(iso))return "—";
 return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})
  .format(new Date(iso+"T12:00:00Z")).replace(/\u202f/g," ").trim();
}
function modeFor(row){return single(row)?"day":"multi";}
function datesFor(mode,entry,exit){return {entry_date:entry,exit_date:mode==="day"?entry:exit};}
// PostgreSQL daterange is discrete: '[d,d]' canonicalizes to '[d,d+1)'.
// Multi-day trips use '[entry,exit)' (departure day is excluded).
function sqlInterval(row){
 const from=row?.entry_date,to=row?.exit_date;
 if(!validDate(from)||!validDate(to)||from>to)return null;
 const day=iso=>Date.parse(iso+"T00:00:00Z")/86400000;
 return {start:day(from),end:day(to)+(from===to?1:0)};
}
function sqlOverlaps(a,b){
 return a.start<b.end&&b.start<a.end;
}
function conflict(payload,loaded,excludedId=null){
 const request=sqlInterval(payload);
 if(!request)return null;
 const candidates=(Array.isArray(loaded)?loaded:[]).filter(t=>
  t?.id!==excludedId&&!t?.deleting&&t?.is_domestic!==true)
  .map(trip=>({trip,range:sqlInterval(trip)}))
  .filter(item=>item.range&&sqlOverlaps(request,item.range));
 // Prefer the parent containing the entered start; use another overlap otherwise.
 const chosen=candidates.find(item=>
  item.range.start<=request.start&&request.start<item.range.end)||candidates[0];
 if(!chosen)return null;
 const trip=chosen.trip,from=payload.entry_date,to=payload.exit_date;
 const date=from<trip.entry_date?trip.entry_date:from;
 // Keep the complete period only if the entered dates fall inside the parent's dates.
 // A partially overlapping period remains a one-day suggestion.
 const fullyContained=from>=trip.entry_date&&to<=trip.exit_date;
 const stopDates=fullyContained?
  {entry_date:from,exit_date:to}:{entry_date:date,exit_date:date};
 return {trip,date,kind:trip.country_code===payload.country_code?"activity":"stop",
  fullyContained,stopDates};
}
function message(match){
 if(!match)return "";
 const name=COUNTRIES?.NAMES?.[match.trip.country_code]||match.trip.country_code;
 return "Ce jour fait partie de votre voyage en "+name+" du "+short(match.trip.entry_date)+
  " au "+short(match.trip.exit_date)+".";
}
const api=Object.freeze({validDate,single,short,modeFor,datesFor,conflict,message});
if(root)root.BEAM_DAY_EXCURSIONS=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
