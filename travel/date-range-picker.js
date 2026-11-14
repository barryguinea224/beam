/* Calendrier de période — composant local, sans requête ni dépendance. */
(function(root){
 "use strict";
 const MONTHS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
 const SHORT=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
 const DAYS=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
 const pad=n=>String(n).padStart(2,"0");
 const iso=(year,month,day)=>String(year).padStart(4,"0")+"-"+pad(month+1)+"-"+pad(day);
 const parse=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return null;
  const parts=value.split("-").map(Number),d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  if(d.getUTCFullYear()!==parts[0]||d.getUTCMonth()!==parts[1]-1||d.getUTCDate()!==parts[2])return null;
  return d;
 };
 const dateIso=d=>iso(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
 const shift=(value,days)=>{
  const d=parse(value);if(!d)return "";
  d.setUTCDate(d.getUTCDate()+days);return dateIso(d);
 };
 const daysInMonth=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
 function maxAllowed(now=new Date()){
  const year=now.getFullYear()+2,month=now.getMonth();
  return iso(year,month,Math.min(now.getDate(),daysInMonth(year,month)));
 }
 const shortDate=value=>{
  const d=parse(value);
  return d?d.getUTCDate()+" "+SHORT[d.getUTCMonth()]+" "+d.getUTCFullYear():"";
 };
 const longDate=value=>{
  const d=parse(value);
  return d?DAYS[(d.getUTCDay()+6)%7]+" "+d.getUTCDate()+" "+MONTHS[d.getUTCMonth()]+" "+d.getUTCFullYear():"";
 };
 const duration=(a,b)=>Math.round((parse(b)-parse(a))/86400000)+1;
 const occupied=(date,row)=>{
  const a=row?.entry_date,b=row?.exit_date;
  return !!parse(a)&&!!parse(b)&&a<=b&&date>=a&&(a===b?date===a:date<b);
 };
 function nextSelection(mode,entry,exit,date){
  if(!parse(date))return {entry,exit};
  if(mode==="day")return {entry:date,exit:date};
  if(!entry||exit)return {entry:date,exit:""};
  return date<entry?{entry:date,exit:""}:{entry,exit:date};
 }
 function summary(mode,entry,exit){
  if(!entry)return mode==="day"?"Choisissez une date.":"Choisissez votre arrivée, puis votre départ.";
  if(mode==="day")return "Le "+shortDate(entry);
  if(!exit)return "Arrivée le "+shortDate(entry)+" · Choisissez le départ.";
  return "Du "+shortDate(entry)+" au "+shortDate(exit)+" · "+duration(entry,exit)+" jours";
 }
 function mount({container,entryInput,exitInput,mode="multi",min="",max="",existing=[],excludeId=null}){
  if(!container||!entryInput||!exitInput)throw Error("Le calendrier requiert deux champs de dates.");
  const globalMax=maxAllowed();
  const state={mode:mode==="day"?"day":"multi",entry:"",exit:"",min:"",max:globalMax,
   existing:[],excludeId,year:0,month:0};
  container.classList.add("drp");
  container.innerHTML=
   '<p class="drp-summary" aria-live="polite" aria-atomic="true"></p>'+
   '<div class="drp-toolbar"><button type="button" class="drp-prev" aria-label="Mois précédent">‹</button>'+
   '<div class="drp-selects"><label><span class="drp-sr">Mois</span><select class="drp-month" aria-label="Mois"></select></label>'+
   '<label><span class="drp-sr">Année</span><select class="drp-year" aria-label="Année"></select></label></div>'+
   '<button type="button" class="drp-next" aria-label="Mois suivant">›</button></div>'+
   '<div class="drp-scroll" tabindex="0" aria-label="Jours du calendrier, défilement horizontal possible sur petit écran">'+
   '<div class="drp-weekdays" aria-hidden="true"></div>'+
   '<div class="drp-days" role="group" aria-label="Sélectionner les dates"></div></div>'+
   '<div class="drp-bottom"><span class="drp-legend">● Voyages déjà enregistrés (indicatif)</span>'+
   '<button type="button" class="drp-clear">Effacer</button></div>';
  const q=s=>container.querySelector(s);
  const yearSel=q(".drp-year"),monthSel=q(".drp-month"),grid=q(".drp-days");
  for(let m=0;m<12;m++)monthSel.add(new Option(MONTHS[m],String(m)));
  for(const day of DAYS){
   const cell=document.createElement("span");cell.textContent=day.slice(0,2);
   cell.setAttribute("title",day);q(".drp-weekdays").append(cell);
  }
  const firstMonth=date=>{const d=parse(date);return d?d.getUTCFullYear()*12+d.getUTCMonth():0;};
  const monthNum=()=>state.year*12+state.month;
  function navigate(year,month){
   const target=year*12+month;
   if(target<firstMonth(state.min)||target>firstMonth(state.max))return;
   state.year=year;state.month=month;render();
  }
  function years(){
   const start=parse(state.min)?.getUTCFullYear()||1900;
   const end=parse(state.max).getUTCFullYear();
   yearSel.replaceChildren();
   for(let y=start;y<=end;y++)yearSel.add(new Option(String(y),String(y)));
  }
  function render(){
   q(".drp-summary").textContent=summary(state.mode,state.entry,state.exit);
   q(".drp-legend").hidden=!state.existing.length;
   yearSel.value=String(state.year);monthSel.value=String(state.month);
   for(const opt of monthSel.options){
    const n=state.year*12+Number(opt.value);
    opt.disabled=n<firstMonth(state.min)||n>firstMonth(state.max);
   }
   q(".drp-prev").disabled=monthNum()<=firstMonth(state.min);
   q(".drp-next").disabled=monthNum()>=firstMonth(state.max);
   grid.replaceChildren();
   const first=new Date(Date.UTC(state.year,state.month,1));
   const offset=(first.getUTCDay()+6)%7,number=daysInMonth(state.year,state.month);
   for(let n=0;n<offset;n++){
    const placeholder=document.createElement("span");placeholder.className="drp-blank";grid.append(placeholder);
   }
   for(let day=1;day<=number;day++){
    const value=iso(state.year,state.month,day);
    const selected=state.mode==="day"?value===state.entry:
     !!state.entry&&value>=state.entry&&(state.exit?value<=state.exit:value===state.entry);
    const start=value===state.entry,end=!!state.exit&&value===state.exit;
    const booked=state.existing.some(row=>row?.id!==state.excludeId&&occupied(value,row));
    const button=document.createElement("button");
    button.type="button";button.textContent=String(day);
    button.className="drp-day"+
     (selected?" drp-selected":"")+(start?" drp-start":"")+(end?" drp-end":"")+
     (booked?" drp-booked":"");
    button.dataset.date=value;
    button.setAttribute("aria-label",longDate(value)+(booked?", voyage déjà enregistré":""));
    button.setAttribute("aria-pressed",String(selected));
    button.disabled=value<state.min||value>state.max;
    if(value===dateIso(new Date(Date.UTC(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()))))
     button.setAttribute("aria-current","date");
    grid.append(button);
   }
  }
  function write(){
   const changed=entryInput.value!==state.entry||exitInput.value!==state.exit;
   entryInput.value=state.entry;exitInput.value=state.exit;
   if(changed){
    entryInput.dispatchEvent(new Event("change",{bubbles:true}));
    exitInput.dispatchEvent(new Event("change",{bubbles:true}));
   }
  }
  function showDate(value){
   const d=parse(value);if(!d)return;
   state.year=d.getUTCFullYear();state.month=d.getUTCMonth();
  }
  function select(date){
   if(!parse(date)||date<state.min||date>state.max)return false;
   const next=nextSelection(state.mode,state.entry,state.exit,date);
   state.entry=next.entry;state.exit=next.exit;
   write();render();return true;
  }
  function focus(date=state.entry){
   const btn=grid.querySelector('[data-date="'+date+'"]:not(:disabled)')||grid.querySelector(".drp-day:not(:disabled)");
   (btn||yearSel).focus();
  }
  function sync(){
   state.entry=parse(entryInput.value)?entryInput.value:"";
   state.exit=parse(exitInput.value)?exitInput.value:"";
   if(state.mode==="day"&&state.entry)state.exit=state.entry;
   if(state.entry&&(state.entry<state.min||state.entry>state.max)){state.entry="";state.exit="";}
   if(state.exit&&(state.exit<state.entry||state.exit>state.max))state.exit="";
   const today=new Date(),todayIso=iso(today.getFullYear(),today.getMonth(),today.getDate());
   showDate(state.entry||(state.min!=="1900-01-01"?state.min:todayIso));
   if(monthNum()<firstMonth(state.min))showDate(state.min);
   if(monthNum()>firstMonth(state.max))showDate(state.max);
   write();render();
  }
  function setBounds({min:lower="",max:upper=""}={}){
   state.min=parse(lower)?lower:"1900-01-01";
   state.max=parse(upper)&&upper<globalMax?upper:globalMax;
   years();sync();
  }
  function setMode(value){
   const previous=state.mode;state.mode=value==="day"?"day":"multi";
   if(state.mode==="day"&&state.entry)state.exit=state.entry;
   if(previous==="day"&&state.mode==="multi"&&state.entry===state.exit)state.exit="";
   write();render();
  }
  function setExisting(rows=[],excluded=null){
   state.existing=Array.isArray(rows)?rows.filter(row=>parse(row?.entry_date)&&parse(row?.exit_date)):[];
   state.excludeId=excluded;render();
  }
  function clear(){
   state.entry="";state.exit="";write();render();
  }
  q(".drp-clear").addEventListener("click",clear);
  q(".drp-prev").addEventListener("click",()=>navigate(state.year,state.month-1));
  q(".drp-next").addEventListener("click",()=>navigate(state.year,state.month+1));
  monthSel.addEventListener("change",()=>navigate(state.year,Number(monthSel.value)));
  yearSel.addEventListener("change",()=>{
   const year=Number(yearSel.value);
   let month=state.month;
   while(month>0&&year*12+month>firstMonth(state.max))month--;
   while(month<11&&year*12+month<firstMonth(state.min))month++;
   navigate(year,month);
  });
  grid.addEventListener("click",e=>{
   const btn=e.target.closest("button[data-date]");if(btn&&!btn.disabled)select(btn.dataset.date);
  });
  grid.addEventListener("keydown",e=>{
   const btn=e.target.closest("button[data-date]");
   if(!btn)return;
   const offsets={ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7};
   let target=offsets[e.key]===undefined?"":shift(btn.dataset.date,offsets[e.key]);
   if(e.key==="Home"||e.key==="End"){
    const d=parse(btn.dataset.date),weekday=(d.getUTCDay()+6)%7;
    target=shift(btn.dataset.date,e.key==="Home"?-weekday:6-weekday);
   }
   if(e.key==="PageDown"||e.key==="PageUp"){
    const d=parse(btn.dataset.date),move=e.key==="PageDown"?1:-1;
    const ym=d.getUTCFullYear()*12+d.getUTCMonth()+move;
    const y=Math.floor(ym/12),m=((ym%12)+12)%12;
    target=iso(y,m,Math.min(d.getUTCDate(),daysInMonth(y,m)));
   }
   if(!target)return;
   e.preventDefault();
   if(target<state.min||target>state.max)return;
   showDate(target);render();focus(target);
  });
  setBounds({min,max});setExisting(existing,excludeId);
  return Object.freeze({select,clear,sync,setMode,setBounds,setExisting,focus,
   state:()=>({mode:state.mode,entry:state.entry,exit:state.exit,month:state.month,year:state.year,min:state.min,max:state.max})});
 }
 const api=Object.freeze({mount,maxAllowed,shortDate,longDate,nextSelection,summary,occupied,parse});
 root.BEAM_DATE_RANGE_PICKER=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
