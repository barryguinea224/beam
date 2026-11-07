// Public BTH duration math; dates are UTC date-only values, never local-midnight.
(function(root){
"use strict";
function addDays(iso,offset){
 if(typeof iso!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return "";
 const d=new Date(iso+"T12:00:00Z");
 if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==iso)return "";
 d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10);
}
function stamp(iso,includeYear=false){
 const d=new Date(iso+"T12:00:00Z");
 return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",timeZone:"UTC",...(includeYear?{year:"numeric"}:{})}).format(d)
  .replace(/\u202f/g," ").replace(/\s+/g," ").trim();
}
function format(iso,duration=1){
 if(!addDays(iso,0))return "";
 const days=Number(duration);
 if(!Number.isInteger(days)||days<1||days>30)return "";
 if(days===1)return stamp(iso);
 const end=addDays(iso,days-1);
 const sameMonth=iso.slice(0,7)===end.slice(0,7);
 const crossYear=iso.slice(0,4)!==end.slice(0,4);
 const start=sameMonth?String(Number(iso.slice(8,10))):stamp(iso,crossYear);
 return start+" → "+stamp(end,crossYear)+" · "+days+" jours";
}
function validate(date,duration,trip){
 const days=Number(duration);
 if(!Number.isInteger(days)||days<1||days>30)return "La durée doit être comprise entre 1 et 30 jours.";
 if(!date)return "";
 if(!addDays(date,0)||!trip||date<trip.entry_date||date>trip.exit_date)
  return "La date doit être comprise entre l’entrée et la sortie du voyage.";
 if(addDays(date,days-1)>trip.exit_date)
  return "La durée dépasse la date de fin du voyage. Réduisez-la ou choisissez une date plus tôt.";
 return "";
}
// UI state lives only in the native form field. No local/session storage.
let trip=null,uiReady=false;
function dom(){return root?.document||null}
function readControls(){
 const input=dom()?.getElementById("activityDurationOther");
 return input?Number(input.value):1;
}
function paint(){
 const doc=dom(),input=doc?.getElementById("activityDurationOther"),date=doc?.getElementById("activityDate"),
  preview=doc?.getElementById("activityDurationPreview");
 if(!input||!date||!preview)return;
 const days=Number(input.value);
 for(const b of doc.querySelectorAll("#activityDurationChoices [data-duration]"))
  b.setAttribute("aria-pressed",String(Number(b.dataset.duration)===days));
 const err=validate(date.value,days,trip);
 preview.textContent=err||(!date.value?"Choisissez une date pour afficher la période.":format(date.value,days));
 preview.dataset.invalid=String(!!err);
 input.setCustomValidity(err||"");
}
function resetControls(value=null){
 trip=value;
 const input=dom()?.getElementById("activityDurationOther");
 if(input)input.value="1";
 paint();
}
function initControls(){
 if(uiReady||!dom())return;
 const doc=dom(),input=doc.getElementById("activityDurationOther"),date=doc.getElementById("activityDate"),
  group=doc.getElementById("activityDurationChoices");
 if(!input||!date||!group)return;
 uiReady=true;
 group.addEventListener("click",e=>{
  const button=e.target.closest?.("button[data-duration]");
  if(!button||!group.contains(button))return;
  input.value=button.dataset.duration;paint();input.focus();
 });
 input.addEventListener("input",paint);
 date.addEventListener("change",paint);
 paint();
}
const api=Object.freeze({addDays,format,validate,initControls,resetControls,readControls});
if(root){root.BEAM_ACTIVITY_DURATIONS=api;initControls();}
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
