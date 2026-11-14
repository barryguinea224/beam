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
function conflict(payload,loaded,excludedId=null){
 const from=payload?.entry_date,to=payload?.exit_date;
 if(!validDate(from)||!validDate(to)||from>to)return null;
 const candidates=(Array.isArray(loaded)?loaded:[]).filter(t=>
  t?.id!==excludedId && !t?.deleting && t?.is_domestic!==true &&
  validDate(t?.entry_date)&&validDate(t?.exit_date)&&
  from<=t.exit_date && t.entry_date<=to);
 // If more than one trip was loaded, prefer one containing the start date.
 const parent=candidates.find(t=>t.entry_date<=from&&from<=t.exit_date)||candidates[0];
 if(!parent)return null;
 const date=from<parent.entry_date?parent.entry_date:from;
 return {trip:parent,date,kind:parent.country_code===payload.country_code?"activity":"stop"};
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
