// Presentation only. Server authorization is enforced in PostgreSQL RLS.
(function(root){
"use strict";
function isoDay(date=new Date()){return date.toISOString().slice(0,10)}
function state(value,today=isoDay()){
 const date=typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
 const valid=!!date&&Number.isFinite(Date.parse(date+"T00:00:00Z"))&&
   new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date;
 if(!valid)return Object.freeze({date:null,canWrite:false,warning:false,expired:false,missing:true,daysLeft:null});
 const daysLeft=Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
 return Object.freeze({date,canWrite:daysLeft>=0,warning:daysLeft>=0&&daysLeft<=30,
   expired:daysLeft<0,missing:false,daysLeft});
}
function formatDate(iso){
 if(!state(iso,iso).date)return "date inconnue";
 return new Intl.DateTimeFormat("fr-FR",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"})
   .format(new Date(iso+"T12:00:00Z"));
}
const api=Object.freeze({state,formatDate,isoDay});
if(root)root.BEAM_TRAVEL_ACCESS=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
