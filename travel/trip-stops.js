// BTH travel stops: pure public formatting and safe private-list DOM helpers.
// No user data embedded in assets or service worker.
(function(root){
"use strict";
const COUNTRIES=root?.BEAM_COUNTRIES||(typeof require==="function"?require("./countries.js"):null);
const valid=code=>typeof code==="string"&&/^[A-Z]{2}$/.test(code)&&!!COUNTRIES?.NAMES?.[code];
const formatISO=iso=>typeof iso==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(iso)&&
 !Number.isNaN(Date.parse(iso+"T12:00:00Z"));
function date(iso){
 if(!formatISO(iso))return "—";
 return iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);
}
function days(from,to){
 if(!formatISO(from)||!formatISO(to))return 0;
 return Math.round((Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000)+1;
}
function short(iso,year=false){
 if(!formatISO(iso))return "—";
 return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",timeZone:"UTC",...(year?{year:"numeric"}:{})})
  .format(new Date(iso+"T12:00:00Z")).replace(/\u202f/g," ").trim();
}
function interval(from,to){
 const sameMonth=from?.slice(0,7)===to?.slice(0,7);
 const yearChange=from?.slice(0,4)!==to?.slice(0,4);
 return (sameMonth?String(Number(from.slice(8,10))):short(from,yearChange))+" → "+short(to,yearChange);
}
function byOrder(rows){
 return (Array.isArray(rows)?rows:[]).filter(s=>valid(s?.country_code))
  .slice().sort((a,b)=>(a.position||0)-(b.position||0)||
   String(a.entry_date).localeCompare(String(b.entry_date))||String(a.id).localeCompare(String(b.id)));
}
function country(code){return COUNTRIES?.NAMES?.[code]||code||"—";}
function cities(row){return (Array.isArray(row?.cities)?row.cities:[]).filter(c=>typeof c==="string"&&c.trim()).join(", ");}
function compact(row){return country(row.country_code)+" ("+interval(row.entry_date,row.exit_date)+")";}
function factual(row){
 const length=days(row.entry_date,row.exit_date);
 return "↳ "+country(row.country_code)+" · "+(cities(row)||"—")+" · "+date(row.entry_date)+
  " → "+date(row.exit_date)+" · "+length+" jour"+(length===1?"":"s")+" · étape";
}
function codes(trip){
 return [...new Set([trip?.country_code,...(trip?.stops||[]).map(s=>s.country_code)].filter(valid))];
}
function validate(input,trip,otherStops=[]){
 const code=input?.country_code,cityList=Array.isArray(input?.cities)?input.cities:[],
   from=input?.entry_date,to=input?.exit_date;
 if(!valid(code))return "Choisissez un pays dans la liste.";
 if(code===trip?.country_code)return "Le pays de l’étape doit être différent du pays du voyage.";
 if(cityList.length>10)return "Une étape peut comporter 10 villes maximum.";
 if(!formatISO(from)||!formatISO(to)||from>to)return "Vérifiez les dates de l’étape.";
 if(from<trip.entry_date||to>trip.exit_date)return "Les dates de l’étape doivent rester dans celles du voyage.";
 // Same rule as the database: a stage may begin the day another ends.
 const day=d=>Date.parse(d+"T00:00:00Z")/864e5,endEx=(a,b)=>a===b?day(b)+1:day(b);
 if(otherStops.some(s=>s.id!==input.id&&day(from)<endEx(s.entry_date,s.exit_date)&&day(s.entry_date)<endEx(from,to)))
  return "Les dates de cette étape chevauchent une autre étape.";
 if(otherStops.filter(s=>s.id!==input.id).length>=10)
  return "Ce voyage comporte déjà 10 étapes (maximum autorisé).";
 return "";
}
function renderList(target,trip,editable,onEdit,onRemove){
 if(!target)return;
 target.replaceChildren();
 const doc=target.ownerDocument,list=byOrder(trip?.stops);
 if(!list.length){const p=doc.createElement("p");p.className="detailEmpty";p.textContent="Aucune étape ajoutée.";target.append(p);return;}
 for(const stop of list){
  const item=doc.createElement("div");item.className="tripStopRow";
  const flag=doc.createElement("span");flag.className="tripStopFlag";flag.setAttribute("aria-hidden","true");
  flag.textContent=String.fromCodePoint(...stop.country_code.split("").map(ch=>127397+ch.charCodeAt(0)));
  const info=doc.createElement("div");info.className="tripStopInfo";
  const name=doc.createElement("strong");name.textContent=country(stop.country_code);
  const location=doc.createElement("span");location.textContent=(cities(stop)||"Ville non précisée")+
   " · "+date(stop.entry_date)+" → "+date(stop.exit_date)+
   " · "+days(stop.entry_date,stop.exit_date)+" jour"+
   (days(stop.entry_date,stop.exit_date)===1?"":"s");
  info.append(name,location);item.append(flag,info);
  if(editable){
   const buttons=doc.createElement("div");buttons.className="tripStopActions";
   for(const [label,action] of [["Modifier",()=>onEdit(stop)],["Supprimer",()=>onRemove(stop)]]){
    const b=doc.createElement("button");b.type="button";b.className="btn ghost";
    b.textContent=label;b.addEventListener("click",action);buttons.append(b);
   }
   item.append(buttons);
  }
  target.append(item);
 }
}
const api=Object.freeze({valid,country,cities,date,days,short,interval,byOrder,compact,factual,codes,validate,renderList});
if(root)root.BEAM_TRIP_STOPS=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
