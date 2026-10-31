// Personal printable journal: NOT the factual Travel History PDF.
// Whitelisted presentation only. Never include identity documents, profile
// contact details, Auth email, storage paths, or untrusted HTML.
(function(root){
 "use strict";
 const NOTICE="Document personnel, non destiné aux démarches administratives";
 const MAX_PHOTOS_PER_TRIP=4,MAX_TOTAL_PHOTOS=40,SIGNED_SECONDS=300;
 const COUNTRIES=root?.BEAM_COUNTRIES||
   (typeof require==="function"?require("./countries.js"):null);
 const FILTERS=root?.BEAM_DASHBOARD_FILTERS||
   (typeof require==="function"?require("./dashboard-filters.js"):null);
 if(!COUNTRIES||!FILTERS)throw new Error("Référentiels du carnet indisponibles.");
 const PURPOSES=Object.freeze({tourisme:"Tourisme",affaires:"Affaires",etudes:"Études",famille:"Famille",sante:"Santé",transit:"Transit",autre:"Autre"});
 const clean=s=>typeof s==="string"?s.trim():"";
 const txt=(parent,tag,value,klass)=>{
  const el=parent.ownerDocument.createElement(tag);
  if(klass)el.className=klass;
  el.textContent=String(value??"");
  parent.appendChild(el);return el;
 };
 function date(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s??"")))return "—";
  const d=new Date(s+"T12:00:00Z");
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s)return "—";
  return s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4);
 }
 function viewTrip(trip,activities=[],photos=[]){
  if(!trip||!COUNTRIES.valid(trip.country_code))throw new Error("Pays du séjour inconnu.");
  const days=Number(trip.duration_days);
  return Object.freeze({
   country:COUNTRIES.NAMES[trip.country_code],
   cities:Array.isArray(trip.cities)?trip.cities.filter(c=>typeof c==="string"&&c.trim()).slice(0,15).join(", "):"",
   entry:date(trip.entry_date),exit:date(trip.exit_date),
   duration:Number.isInteger(days)&&days>0?days+" jour"+(days===1?"":"s"):"—",
   purpose:PURPOSES[trip.purpose]||"Autre",
   domestic:trip.is_domestic===true,
   memory:clean(trip.note),
   activities:(Array.isArray(activities)?activities:[]).slice(0,50).map(a=>Object.freeze({
    title:clean(a.title).slice(0,160),place:clean(a.place).slice(0,160),date:date(a.happened_on)
   })).filter(a=>a.title),
   photos:(Array.isArray(photos)?photos:[]).slice(0,MAX_PHOTOS_PER_TRIP)
     .filter(p=>typeof p==="string"&&p.startsWith("https://"))
  });
 }
 // Favorites, then owner's position, then date; existing media fields.
 function preferredMediaQuery(query){
  return query.order("is_favorite",{ascending:false})
   .order("position",{ascending:true})
   .order("created_at",{ascending:true})
   .limit(MAX_PHOTOS_PER_TRIP);
 }
 function filterLabel(input){
  const s=FILTERS.normalize(input),parts=[];
  if(s.country)parts.push(COUNTRIES.NAMES[s.country]||s.country);
  if(s.year)parts.push(s.year);
  if(s.purpose)parts.push(PURPOSES[s.purpose]||"Autre");
  if(s.scope)parts.push(s.scope==="domestic"?"Séjours nationaux":"Voyages à l’étranger");
  return parts.join(" · ")||"Tous les voyages";
 }
 const CSS=[
 "@page{size:A4;margin:28mm 15mm 25mm;@top-center{content:'Document personnel, non destiné aux démarches administratives';font:700 8pt Arial,sans-serif;color:#294d3d;border-bottom:1px solid #8cae9b;padding-bottom:2mm}@bottom-center{content:'Document personnel, non destiné aux démarches administratives';font:700 8pt Arial,sans-serif;color:#294d3d;border-top:1px solid #8cae9b;padding-top:2mm}}",
 "*{box-sizing:border-box}",
 "html,body{margin:0;padding:0;background:white;color:#1a3026;font:11pt/1.45 Arial,Helvetica,sans-serif}",
 "main{max-width:180mm;margin:auto}",
 ".page-head,.page-foot{position:fixed;left:0;right:0;color:#294d3d;font-weight:700;font-size:8.5pt;background:white}",
 ".page-head{top:-17mm;border-bottom:1px solid #8cae9b;padding:2mm 0}",
 ".page-foot{bottom:-13mm;border-top:1px solid #8cae9b;padding:2mm 0}",
 ".toolbar{display:flex;align-items:center;gap:10px;margin:12px 0 20px}",
 ".toolbar button{border:0;border-radius:25px;background:#174d3a;color:white;padding:12px 18px;min-height:44px;font-size:11pt;font-weight:bold}",
 ".cover{min-height:210mm;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;border-left:5mm solid #174d3a;padding:20mm 12mm;break-after:page}",
 ".cover .brand{color:#174d3a;letter-spacing:.15em;font-size:11pt;font-weight:bold}",
 "h1{font:normal 34pt/1.15 Georgia,serif;margin:12mm 0 6mm;overflow-wrap:anywhere}",
 "h2{font:normal 23pt/1.2 Georgia,serif;margin:0 0 5mm;overflow-wrap:anywhere}",
 ".cover .filters{font-size:15pt;overflow-wrap:anywhere;color:#416551}",
 ".notice{font-weight:bold;border:1px solid #97b6a3;padding:3mm 4mm;margin:8mm 0;max-width:100%}",
 ".journey{padding:4mm 0 8mm;break-before:page}",
 ".intro{font-size:9pt;text-transform:uppercase;letter-spacing:.1em;color:#4a6454}",
 ".facts{display:grid;grid-template-columns:1fr 1fr;gap:3mm 7mm;margin:4mm 0 7mm}",
 ".fact{min-width:0;overflow-wrap:anywhere;border-bottom:1px solid #d7e2d9;padding:2mm 0}",
 ".fact strong{display:block;font-size:8pt;color:#516c5a}",
 ".domestic{display:inline-block;border:1px solid #174d3a;border-radius:4mm;padding:1mm 3mm;font-size:9pt;font-weight:bold}",
 "h3{font:normal 16pt Georgia,serif;margin:6mm 0 2mm}",
 ".memory{white-space:pre-wrap;overflow-wrap:anywhere}",
 ".activity{break-inside:avoid;border-bottom:1px solid #e2e9e3;padding:2mm 0;overflow-wrap:anywhere}",
 ".activity small{color:#566e60}",
 ".photos{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}",
 ".photos figure{margin:0;min-width:0;break-inside:avoid}",
 ".photos img{display:block;width:100%;height:62mm;max-width:100%;object-fit:contain;border:1px solid #d5e0d7;background:#f4f6f4}",
 ".empty{color:#596d61}",
 ".photo-missing{color:#874d23;font-size:9.5pt;overflow-wrap:anywhere;border:1px dashed #b79b80;padding:3mm;margin:2mm 0}",
 "@media screen{body{padding:10px 12px;background:#e9efea}main{background:white;padding:18px;box-shadow:0 4px 20px #22392a33}.page-head,.page-foot{position:static;font-size:9pt;margin:8px 0}.cover{min-height:45vh}.journey{break-before:auto;border-top:2px solid #174d3a;margin-top:24px}.toolbar{flex-wrap:wrap}}",
 "@media print{.toolbar,.page-head,.page-foot{display:none!important}.cover{min-height:195mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}figure,img{break-inside:avoid}}",
 "@media(max-width:420px){h1{font-size:29pt}.facts{grid-template-columns:1fr}.photos{grid-template-columns:1fr}.photos img{height:50mm}}"
 ].join("\n");
 function render(doc,model){
  if(!doc?.createElement||!model||!Array.isArray(model.trips))throw new Error("Carnet indisponible.");
  const name=clean(model.name).replace(/\s+/g," ").slice(0,80);
  const list=model.trips.map(t=>viewTrip(t.trip,t.activities,t.photos));
  // Failed signatures must also be reported, not just <img> errors.
  const preflightFailures=model.trips.map(t=>{
   const n=Number(t.missingPhotos);
   return Number.isInteger(n)&&n>0?Math.min(n,MAX_PHOTOS_PER_TRIP):0;
  });
  const unavailableBeforeLoad=preflightFailures.reduce((sum,n)=>sum+n,0);
  doc.documentElement.lang="fr";
  const charset=doc.createElement("meta");charset.setAttribute("charset","utf-8");
  // window.open('') starts without a viewport meta: Android defaults to a
  // virtual 980px page and makes the print preview horizontally scrollable.
  const viewport=doc.createElement("meta");viewport.setAttribute("name","viewport");
  viewport.setAttribute("content","width=device-width,initial-scale=1");
  const ref=doc.createElement("meta");ref.setAttribute("name","referrer");ref.setAttribute("content","no-referrer");
  const title=doc.createElement("title");title.textContent="BEAM · Mon carnet de voyage";
  const style=doc.createElement("style");style.textContent=CSS;
  doc.head.replaceChildren(charset,viewport,ref,title,style);
  doc.body.replaceChildren();
  txt(doc.body,"div",NOTICE,"page-head");
  txt(doc.body,"div",NOTICE,"page-foot");
  const main=txt(doc.body,"main","");
  const toolbar=txt(main,"div","","toolbar");
  const btn=txt(toolbar,"button","Imprimer / Enregistrer en PDF");
  btn.type="button";btn.disabled=true;
  const status=txt(toolbar,"span","Chargement des photos…","load-status");
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  btn.addEventListener("click",()=>doc.defaultView?.print());
  const cover=txt(main,"section","","cover");
  txt(cover,"p","BEAM · CARNET PERSONNEL","brand");
  txt(cover,"h1",name?"Carnet de "+name:"Mon carnet de voyage");
  txt(cover,"p",filterLabel(model.filters),"filters");
  txt(cover,"p",list.length+" voyage"+(list.length===1?"":"s")+" dans ce carnet.");
  txt(cover,"p",NOTICE,"notice");
  if(!list.length)txt(main,"p","Aucun voyage ne correspond aux filtres sélectionnés.","empty");
  for(const [index,trip] of list.entries()){
   const page=txt(main,"section","","journey");
   txt(page,"p",trip.domestic?"Séjour national":"Voyage à l’étranger","intro");
   txt(page,"h2",trip.country);
   if(trip.domestic)txt(page,"span","Séjour national","domestic");
   const facts=txt(page,"div","","facts");
   for(const [key,value] of [["Ville(s)",trip.cities||"—"],["Entrée",trip.entry],
      ["Sortie",trip.exit],["Durée",trip.duration],["Motif",trip.purpose]]){
    const item=txt(facts,"div","","fact");
    txt(item,"strong",key);txt(item,"span",value);
   }
   txt(page,"h3","Mon souvenir");
   txt(page,"p",trip.memory||"Aucun souvenir renseigné.","memory");
   txt(page,"h3","Activités");
   if(!trip.activities.length)txt(page,"p","Aucune activité renseignée.","empty");
   for(const a of trip.activities){
    const row=txt(page,"div","","activity");
    txt(row,"strong",a.title);
    const details=[a.place,a.date==="—"?"":a.date].filter(Boolean).join(" · ");
    if(details)txt(row,"small",details);
   }
   txt(page,"h3","Photos du voyage");
   if(!trip.photos.length&&!preflightFailures[index])
    txt(page,"p","Aucune photo disponible pour l’impression.","empty");
   if(preflightFailures[index])
    txt(page,"p",preflightFailures[index]+" photo"+(preflightFailures[index]===1?"":"s")+
      " indisponible"+(preflightFailures[index]===1?"":"s")+" lors de la préparation.","photo-missing");
   const grid=txt(page,"div","","photos");
   for(const url of trip.photos){
    const figure=txt(grid,"figure","");
    const img=doc.createElement("img");
    img.alt="Photo privée du séjour";img.loading="eager";
    img.setAttribute("referrerpolicy","no-referrer");
    img.src=url;figure.appendChild(img);
   }
  }
  // img.complete can also mean a failed image: inspect naturalWidth.
  // Display clear placeholders for images unavailable after a 30-second limit.
  const images=[...doc.querySelectorAll("img")];
  const plural=n=>n===1?"1 photo n'a pas pu être chargée":n+" photos n'ont pas pu être chargées";
  const total=images.length+unavailableBeforeLoad;
  let loaded=0;
  function finish(failures){
   if(doc.defaultView?.closed)return;
   btn.disabled=false;
   status.textContent=failures
    ?"Prêt pour l’impression · "+plural(failures)+"."
    :"Prêt pour l’impression · "+loaded+" photo"+(loaded===1?"":"s")+" chargée"+(loaded===1?"":"s")+".";
  }
  function loadedImage(img){
   return new Promise(resolve=>{
    let settled=false;
    const success=()=>settle(img.naturalWidth>0);
    const failure=()=>settle(false);
    let timer;
    function settle(ok){
     if(settled)return;
     settled=true;
     clearTimeout(timer);
     img.removeEventListener("load",success);
     img.removeEventListener("error",failure);
     if(!ok){
      const figure=img.parentNode;
      img.remove();
      if(figure)txt(figure,"figcaption","Photo indisponible pour l’impression.","photo-missing");
     }
     resolve(ok);
    }
    img.addEventListener("load",success);
    img.addEventListener("error",failure);
    timer=setTimeout(()=>settle(false),30000);
    if(img.complete)settle(img.naturalWidth>0);
   });
  }
  if(!images.length)finish(unavailableBeforeLoad);
  else Promise.all(images.map(img=>loadedImage(img).then(ok=>{
   if(ok)loaded++;
   if(!doc.defaultView?.closed)status.textContent="Chargement des photos · "+loaded+" / "+total;
   return ok;
  }))).then(results=>finish(unavailableBeforeLoad+results.filter(ok=>!ok).length))
    .catch(()=>finish(total-loaded));
  return list.length;
 }
 const api=Object.freeze({NOTICE,MAX_PHOTOS_PER_TRIP,MAX_TOTAL_PHOTOS,SIGNED_SECONDS,preferredMediaQuery,filterLabel,viewTrip,render});
 if(root)root.BEAM_PERSONAL_JOURNAL=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
