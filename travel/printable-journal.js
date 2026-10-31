// BEAM Travel History — personal visual album. NOT the factual/official PDF.
// Only explicit trip memories and authorized signed photographs enter this DOM.
// No HTML interpolation, Auth email, identity document or stored signed URL.
(function(root){
 "use strict";
 const NOTICE="Document personnel, non destiné aux démarches administratives";
 const MAX_PHOTOS_PER_TRIP=4,MAX_TOTAL_PHOTOS=40,SIGNED_SECONDS=300;
 const COUNTRIES=root?.BEAM_COUNTRIES||(typeof require==="function"?require("./countries.js"):null);
 const FILTERS=root?.BEAM_DASHBOARD_FILTERS||(typeof require==="function"?require("./dashboard-filters.js"):null);
 if(!COUNTRIES||!FILTERS)throw new Error("Référentiels du carnet indisponibles.");
 const PURPOSES=Object.freeze({tourisme:"Tourisme",affaires:"Affaires",etudes:"Études",famille:"Famille",sante:"Santé",transit:"Transit",autre:"Autre"});
 const FLAGS=new Set("ae be bh ca cd cg ci cn de dz es fr gb gf gh gn gp it ma ml mq mt pt re sa sg sl sn tr us".split(" "));
 const clean=s=>typeof s==="string"?s.trim():"";
 // H muet requires lexical knowledge: use a small list of known given names
 // rather than eliding every H (including aspirated H).
 const H_MUET=/^(?:hélène|hélèna|henri|henry|hugo|hugues|hadrien|habib|hamid|hicham|hassan|hiba|houda)(?:\b|$)/i;
 function titleForName(input){
  const name=clean(input).replace(/\s+/g," ").slice(0,80);
  if(!name)return "Mon carnet de voyage";
  const elide=/^[aàâäeéèêëiîïoôöuùûüyÿœæ]/i.test(name)||H_MUET.test(name);
  return "Carnet "+(elide?"d'":"de ")+name;
 }
 const el=(parent,tag,klass,text)=>{
  const item=parent.ownerDocument.createElement(tag);
  if(klass)item.className=klass;
  if(text!==undefined)item.textContent=String(text??"");
  parent.appendChild(item);return item;
 };
 const svgEl=(doc,tag)=>doc.createElementNS("http://www.w3.org/2000/svg",tag);
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
   code:trip.country_code,country:COUNTRIES.NAMES[trip.country_code],
   cities:Array.isArray(trip.cities)?trip.cities.filter(c=>typeof c==="string"&&c.trim()).slice(0,15).join(", "):"",
   entry:date(trip.entry_date),exit:date(trip.exit_date),
   entryISO:clean(trip.entry_date),exitISO:clean(trip.exit_date),
   duration:Number.isInteger(days)&&days>0?days+" jour"+(days===1?"":"s"):"—",
   days:Number.isInteger(days)&&days>0?days:0,
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
 function period(trips){
  const years=trips.map(t=>t.entryISO.slice(0,4)).filter(x=>/^\d{4}$/.test(x)).sort();
  return !years.length?"Mes voyages":years[0]===years[years.length-1]?years[0]:years[0]+" – "+years[years.length-1];
 }
 function flag(parent,code){
  const wrap=el(parent,"span","album-flag");
  if(FLAGS.has(code.toLowerCase())){
   const img=el(wrap,"img");
   img.alt="";img.width=30;img.height=20;
   img.src="/travel/assets/flags/"+code.toLowerCase()+".svg";
   img.setAttribute("referrerpolicy","no-referrer");
  }else el(wrap,"span","album-iso",code);
  return wrap;
 }
 // Reconstruct ONLY checked geometry paths from the repository's local static SVG.
 // No innerHTML, foreignObject, event handlers, styles, links or remote resources.
 function map(parent,raw,visited){
  const container=el(parent,"div","atlas");
  const doc=parent.ownerDocument;
  let count=0;
  if(typeof raw==="string"&&raw.length<250000&&doc.defaultView?.DOMParser){
   const parsed=new doc.defaultView.DOMParser().parseFromString(raw,"image/svg+xml");
   const rootSvg=parsed.documentElement;
   if(rootSvg.localName==="svg"){
    const svg=svgEl(doc,"svg");
    svg.setAttribute("viewBox","0 0 1000 445");
    svg.setAttribute("role","img");svg.setAttribute("aria-label","Carte des pays visités");
    for(const original of rootSvg.querySelectorAll("path[data-country]")){
     const code=original.getAttribute("data-country")||"";
     const d=original.getAttribute("d")||"";
     if(!/^[A-Z]{2}$/.test(code)||!COUNTRIES.valid(code)||d.length>25000||
      !/^[a-zA-Z0-9,.\s+\-]+$/.test(d))continue;
     const shape=svgEl(doc,"path");
     shape.setAttribute("d",d);shape.setAttribute("data-country",code);
     if(visited.has(code))shape.setAttribute("class","atlas-visited");
     svg.appendChild(shape);count++;
    }
    if(count){
     container.appendChild(svg);
     fitAtlasToVisited(svg);
    }
   }
  }
  if(!count)el(container,"p","atlas-fallback","Mes destinations à travers le monde");
  return container;
 }
 // The same visited-path bounds strategy as fitMapToVisited in the app.
 // Use a stable landscape aspect ratio so Guinea + Senegal stay legible on A4.
 function fitAtlasToVisited(svg){
  const paths=[...svg.querySelectorAll("path.atlas-visited")];
  if(!paths.length)return;
  const bounds=[];
  for(const path of paths){
   try{
    const b=path.getBBox();
    if([b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0)
     bounds.push(b);
   }catch{} // disconnected SVG / old browser: retain full-map fallback
  }
  if(!bounds.length)return;
  const left=Math.min(...bounds.map(b=>b.x));
  const top=Math.min(...bounds.map(b=>b.y));
  const right=Math.max(...bounds.map(b=>b.x+b.width));
  const bottom=Math.max(...bounds.map(b=>b.y+b.height));
  const w=Math.max(right-left,35),h=Math.max(bottom-top,20);
  const pad=Math.max(w,h)*0.45;
  const aspect=1000/445;
  let bw=Math.max(90,w+2*pad),bh=Math.max(55,h+2*pad);
  if(bw/bh<aspect)bw=bh*aspect;
  else bh=bw/aspect;
  // Don't crop the visited bounding box, even when a region reaches a border.
  bw=Math.min(1000,bw);bh=Math.min(445,bh);
  const x=Math.max(0,Math.min(1000-bw,(left+right-bw)/2));
  const y=Math.max(0,Math.min(445-bh,(top+bottom-bh)/2));
  svg.setAttribute("viewBox",[x,y,bw,bh].map(v=>Number(v.toFixed(2))).join(" "));
 }
 const CSS=[
  "@page{size:A4;margin:27mm 14mm 26mm;@top-center{content:'Document personnel, non destiné aux démarches administratives';font:600 8pt Arial,sans-serif;color:#254e3c;border-bottom:1px solid #bdcfc1;padding-bottom:2mm}@bottom-center{content:'Document personnel, non destiné aux démarches administratives';font:600 8pt Arial,sans-serif;color:#254e3c;border-top:1px solid #bdcfc1;padding-top:2mm}@bottom-right{content:counter(page);font:700 8pt Arial,sans-serif;color:#254e3c}}",
  "*{box-sizing:border-box}",
  "html,body{margin:0;background:#fff;color:#173328;font:11pt/1.5 system-ui,-apple-system,Arial,sans-serif}",
  "main{max-width:182mm;margin:auto;min-width:0}",
  ".screen-head,.screen-foot{position:fixed;z-index:5;left:0;right:0;text-align:center;background:#f9fcf8;color:#355745;font:600 11px/1.5 system-ui;padding:6px 10px;border-bottom:1px solid #d6e4da}",
  ".screen-head{top:0}.screen-foot{bottom:0;border-top:1px solid #d6e4da;border-bottom:0}",
  ".toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px auto;padding:12px;border:1px solid #d4e1d6;border-radius:12px;background:#fff}",
  ".toolbar button{border:0;border-radius:999px;background:#174d3a;color:#fff;padding:12px 18px;min-height:44px;font-weight:800;cursor:pointer}",
  ".toolbar label{display:flex;gap:7px;align-items:center;cursor:pointer;font-size:10pt}",
  ".toolbar input{width:18px;height:18px;accent-color:#174d3a}",
  ".load-status{font-size:9pt;color:#53685c;flex-basis:100%}",
  ".sheet-page{position:relative;min-width:0;break-before:page;page-break-before:always;padding:0 0 3mm;overflow-wrap:anywhere}",
  ".sheet-page:first-of-type{break-before:auto;page-break-before:auto}",
  ".eyebrow{font:800 9pt/1.4 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#32664d}",
  "h1,h2,h3{font-family:Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:-.025em;overflow-wrap:anywhere}",
  "h1{font-size:35pt;line-height:1.13;margin:7mm 0 4mm}",
  "h2{font-size:26pt;line-height:1.2;margin:3mm 0 4mm}",
  "h3{font-size:16pt;line-height:1.3;margin:3mm 0}",
  ".cover{min-height:201mm;display:flex;flex-direction:column;justify-content:space-between;padding:0 0 8mm}",
  ".cover-art{min-height:112mm;position:relative;overflow:hidden;border-radius:6mm;background:radial-gradient(circle at 70% 25%,#c9d8b4 0,transparent 30%),linear-gradient(125deg,#204d3c 0,#3c7665 47%,#b2c7b6 100%)}",
  ".cover-art img{width:100%;height:112mm;object-fit:cover;display:block}",
  ".cover-art::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,39,30,.6),transparent 55%);pointer-events:none}",
  ".cover-mark{position:absolute;left:8mm;bottom:8mm;z-index:2;color:#fff;font-size:10pt;font-weight:800;letter-spacing:.12em}",
  ".cover-label{padding-top:5mm}",
  ".cover-period{font-size:17pt;color:#406753;margin:2mm 0 5mm}",
  ".flag-strip{display:flex;gap:5mm;flex-wrap:wrap;align-items:center;margin:3mm 0}",
  ".album-flag{display:inline-flex;justify-content:center;align-items:center;min-width:32px;height:25px;border:1px solid #d8e2da;border-radius:5px;background:#fff;overflow:hidden}",
  ".album-flag img{width:30px;height:21px;object-fit:cover}",
  ".album-iso{font:800 9pt system-ui;color:#285842}",
  ".cover-caption{font-size:10pt;color:#5d7063}",
  ".cover-notice{font-size:8pt;color:#4d6558}",
  ".summary{min-height:198mm;padding:2mm 0 5mm}",
  ".summary-title{display:flex;align-items:center;justify-content:space-between;gap:5mm;flex-wrap:wrap}",
  ".summary-kicker{font-size:9pt;color:#587164}",
  ".atlas{border-radius:5mm;min-height:65mm;margin:5mm 0;background:#edf2eb;padding:4mm;overflow:hidden}",
  ".atlas svg{display:block;width:100%;height:auto;max-height:83mm}",
  ".atlas path{fill:#cbd7cc;stroke:#fff;stroke-width:1;vector-effect:non-scaling-stroke}",
  ".atlas path.atlas-visited{fill:#15835a;stroke:#165036;stroke-width:1.25}",
  ".atlas-fallback{padding:20mm 5mm;text-align:center;font-family:Georgia,serif;color:#496a56}",
  ".metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;margin:5mm 0 2mm}",
  ".metric{min-width:0;border-radius:3mm;background:#e8f1e9;padding:4mm 3mm}",
  ".metric strong{font:700 23pt Georgia,serif;display:block;color:#174d3a}",
  ".metric span{display:block;font-size:8pt;line-height:1.3}",
  ".domestic-summary{font:600 10pt system-ui;color:#3e6a50;margin:2mm 0 5mm}",
  ".timeline{display:grid;gap:2.5mm;margin:5mm 0}",
  ".timeline-row{border-left:2px solid #8cb29d;padding:2mm 1mm 2mm 3mm;display:flex;align-items:center;gap:3mm;break-inside:avoid}",
  ".timeline-row .album-flag{flex-shrink:0}",
  ".timeline-detail{min-width:0;flex:1;display:flex;flex-direction:column}",
  ".timeline-country{font-weight:800;font-size:9.5pt}",
  ".timeline-city{font-size:8pt;color:#526e5c;overflow-wrap:anywhere}",
  ".timeline-meta{font-size:8pt;color:#4e6859;text-align:right;white-space:normal;flex:0 1 37%}",
  ".timeline-row span{min-width:0;font-size:9pt}.timeline-date{color:#5e7567;white-space:nowrap;font-size:8pt}",
  ".trip-hero{min-height:197mm;padding:0 0 5mm}",
  ".trip-banner{display:flex;align-items:center;justify-content:space-between;gap:6mm;background:#e5f0e7;border-radius:5mm;padding:6mm;margin-bottom:4mm}",
  ".trip-banner h2{margin:2mm 0;font-size:29pt}",
  ".trip-line{font-size:10pt;color:#496c57;margin:0}",
  ".pills{display:flex;gap:2mm;flex-wrap:wrap;margin:4mm 0 7mm}",
  ".pill{font:700 9pt system-ui;border-radius:999px;padding:2mm 4mm;border:1px solid #afcab8;background:#f1f7f2;color:#27583f}",
  ".photo-mosaic{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;min-width:0}",
  ".photo-mosaic figure{margin:0;border-radius:3mm;overflow:hidden;break-inside:avoid;min-width:0;background:#ecf1e9}",
  ".photo-mosaic figure:first-child{grid-column:1/-1}",
  ".photo-mosaic img{display:block;width:100%;height:46mm;object-fit:cover}",
  ".photo-mosaic figure:first-child img{height:99mm}",
  ".photo-mosaic .photo-missing{margin:0}",
  ".photo-placeholder{height:35mm;border-radius:4mm;background:linear-gradient(120deg,#e4efe5,#f1f6ed);display:flex;align-items:center;gap:5mm;padding:5mm;color:#1c563d;font:500 19pt Georgia,serif}",
  ".photo-placeholder .album-flag{width:44px;height:33px;flex-shrink:0}",
  ".photo-placeholder .album-flag img{width:42px;height:28px}",
  ".trip-story{padding:4mm 0 7mm}",
  ".trip-story-inline{min-height:0;padding-top:5mm}",
  ".trip-compact{min-height:0}",
  ".trip-compact .photo-mosaic figure:first-child img{height:78mm}",
  ".trip-compact .photo-placeholder{height:35mm}",
  ".trip-compact .quote{font-size:12pt;line-height:1.45;margin:3mm 0 5mm}",
  ".trip-compact .quote::before{font-size:24pt;padding-top:3mm}",
  ".story-heading{display:flex;align-items:center;gap:3mm;padding-bottom:3mm;border-bottom:1px solid #d5e3d7}",
  ".quote{font:italic 14pt/1.65 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #3c8160;padding:3mm 0 3mm 7mm;margin:5mm 0 7mm;background:#f5f8f3}",
  ".quote::before{content:'“';font-size:31pt;line-height:0.6;color:#609377;display:block;padding-top:5mm}",
  ".activity-timeline{list-style:none;padding:0 0 0 3mm;margin:3mm 0;border-left:2px solid #9fc3ad}",
  ".activity-timeline li{position:relative;padding:2mm 0 3mm 6mm;break-inside:avoid;overflow-wrap:anywhere}",
  ".activity-timeline li::before{content:'';position:absolute;left:-4.7mm;top:5mm;width:3mm;height:3mm;border-radius:50%;background:#2e7654}",
  ".activity-timeline strong{display:block;font-size:10pt}",
  ".activity-timeline small{display:block;font-size:9pt;color:#5d7668}",
  ".empty{font-size:10pt;color:#6a7d70}",
  ".photo-missing{color:#86582d;font-size:9pt;padding:2mm;border:1px dashed #bca68d}",
  ".closing{min-height:180mm;display:flex;flex-direction:column;justify-content:center;text-align:center;border-top:4mm solid #174d3a}",
  ".closing p{font:12pt/1.6 Georgia,serif;color:#4a6a55}",
  "@media screen{body{background:#e7eee8;padding:38px 12px 55px}main{max-width:740px}.sheet-page{background:#fff;margin:0 auto 18px;padding:22px 24px;box-shadow:0 7px 30px #28433324;border-radius:8px;min-height:0;break-before:auto}.cover{min-height:700px}.summary{min-height:660px}.trip-hero{min-height:0}.trip-story{min-height:0}.toolbar{max-width:740px}}",
  "@media print{body{background:#fff!important;padding:0!important}.screen-head,.screen-foot,.toolbar{display:none!important}main{max-width:100%}.sheet-page{box-shadow:none!important;border-radius:0!important;margin:0!important;padding:0!important;break-before:page}.cover{min-height:196mm}.summary{min-height:190mm}.trip-hero{min-height:0}.trip-story{min-height:0}.trip-story-inline{break-before:auto!important;page-break-before:auto!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}",
  ".ink-saver .cover-art,.ink-saver .photo-placeholder,.ink-saver .trip-banner,.ink-saver .metric,.ink-saver .quote,.ink-saver .pill,.ink-saver .atlas{background:#fff!important}",
  ".ink-saver .cover-art,.ink-saver .trip-banner,.ink-saver .metric,.ink-saver .atlas{border:1px solid #b8c8bc}",
  ".ink-saver .atlas path.atlas-visited{fill:#5d7568}",
  "@media(max-width:420px){body{padding-left:5px;padding-right:5px}.sheet-page{padding:14px}.cover{min-height:570px}.summary,.trip-hero,.trip-story{min-height:0}.cover-art,.cover-art img{min-height:0;height:210px}.cover-art{min-height:210px}h1{font-size:28pt}.trip-banner h2{font-size:23pt}.trip-banner{padding:4mm}.metric strong{font-size:19pt}.metric span{font-size:7pt}.timeline-row{flex-wrap:wrap}.timeline-meta{flex-basis:100%;text-align:left;padding-left:40px}.photo-mosaic img{height:24mm}.photo-mosaic figure:first-child img{height:60mm}.trip-compact .photo-mosaic figure:first-child img{height:60mm}}"
 ].join("\n");
 function render(doc,model){
  if(!doc?.createElement||!model||!Array.isArray(model.trips))throw new Error("Carnet indisponible.");
  const name=clean(model.name).replace(/\s+/g," ").slice(0,80);
  const list=model.trips.map(t=>viewTrip(t.trip,t.activities,t.photos));
  const failed=model.trips.map(t=>{
   const n=Number(t.missingPhotos);
   return Number.isInteger(n)&&n>0?Math.min(n,MAX_PHOTOS_PER_TRIP):0;
  });
  const initialFailed=failed.reduce((sum,n)=>sum+n,0);
  const countries=[...new Set(list.map(t=>t.code))];
  const summary=list.filter(t=>!t.domestic);
  const summaryCountries=new Set(summary.map(t=>t.code)).size;
  const summaryDays=summary.reduce((n,t)=>n+t.days,0);
  const domestic=list.filter(t=>t.domestic).length;
  const generatedAt=model.generatedAt instanceof Date&&!Number.isNaN(model.generatedAt.getTime())
   ?model.generatedAt:new Date();
  doc.documentElement.lang="fr";
  const charset=doc.createElement("meta");charset.setAttribute("charset","utf-8");
  const viewport=doc.createElement("meta");viewport.setAttribute("name","viewport");
  viewport.setAttribute("content","width=device-width,initial-scale=1");
  const ref=doc.createElement("meta");ref.setAttribute("name","referrer");ref.setAttribute("content","no-referrer");
  const title=doc.createElement("title");title.textContent="BEAM · Mon carnet de voyage";
  const style=doc.createElement("style");style.textContent=CSS;
  doc.head.replaceChildren(charset,viewport,ref,title,style);
  doc.body.replaceChildren();
  el(doc.body,"div","screen-head",NOTICE);
  el(doc.body,"div","screen-foot",NOTICE);
  const toolbar=el(doc.body,"div","toolbar");
  const print=el(toolbar,"button","print-button","Imprimer / Enregistrer en PDF");
  print.type="button";print.disabled=true;
  const inkLabel=el(toolbar,"label","ink-option");
  const ink=el(inkLabel,"input");ink.type="checkbox";ink.id="inkSaver";
  el(inkLabel,"span",null,"Économie d’encre");
  ink.addEventListener("change",()=>doc.body.classList.toggle("ink-saver",ink.checked));
  const status=el(toolbar,"span","load-status","Chargement des photos…");
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  print.addEventListener("click",()=>doc.defaultView?.print());
  const main=el(doc.body,"main");
  const cover=el(main,"section","sheet-page cover");
  el(cover,"p","eyebrow","BEAM · TRAVEL HISTORY");
  const art=el(cover,"div","cover-art");
  // Favorited photographs win across ALL filtered trips, not just the newest.
  // Fall back to any signed photograph; only then use the illustrated cover.
  const favored=model.trips.find(t=>typeof t.favoritePhoto==="string"&&
    t.photos?.includes(t.favoritePhoto))?.favoritePhoto;
  const coverPhoto=favored||list.find(t=>t.photos.length)?.photos[0]||null;
  if(coverPhoto)makePhoto(art,coverPhoto,"Photographie de couverture du carnet","cover-image");
  else el(art,"div","cover-pattern");
  el(art,"div","cover-mark","MES VOYAGES, MES SOUVENIRS");
  const coverDetails=el(cover,"div","cover-label");
  el(coverDetails,"h1",null,titleForName(name));
  el(coverDetails,"p","cover-period",period(list));
  el(coverDetails,"p","cover-caption",filterLabel(model.filters));
  const flags=el(coverDetails,"div","flag-strip");
  for(const code of countries.slice(0,24))flag(flags,code);
  el(coverDetails,"p","cover-caption",list.length+" voyage"+(list.length===1?"":"s")+" raconté"+(list.length===1?"":"s"));
  el(cover,"p","cover-notice",NOTICE);
  const yearbook=el(main,"section","sheet-page summary");
  const summaryTop=el(yearbook,"div","summary-title");
  el(summaryTop,"div","eyebrow","BEAM · EN IMAGES");
  el(summaryTop,"span","summary-kicker",period(list));
  el(yearbook,"h2",null,"Mon année en voyages");
  map(yearbook,model.mapSvgText,new Set(countries));
  const nums=el(yearbook,"div","metric-grid");
  for(const [value,label] of [[summary.length,"voyage"+(summary.length===1?"":"s")+" à l’étranger"],
    [summaryCountries,"pays à l’étranger"],
    [summaryDays,"jour"+(summaryDays===1?"":"s")+" à l’étranger"]]){
   const block=el(nums,"div","metric");
   el(block,"strong",null,String(value));el(block,"span",null,label);
  }
  el(yearbook,"p","domestic-summary",domestic?
   "+ "+domestic+" séjour"+(domestic===1?" national":"s nationaux"):
   "Mes voyages internationaux");
  el(yearbook,"h3",null,"Ma chronologie");
  const timeline=el(yearbook,"div","timeline");
  for(const trip of list.slice(0,24)){
   const row=el(timeline,"div","timeline-row");
   flag(row,trip.code);
   const detail=el(row,"div","timeline-detail");
   el(detail,"span","timeline-country",trip.country);
   if(trip.cities)el(detail,"span","timeline-city",trip.cities.split(",")[0]);
   const dates=[trip.entry,trip.exit].filter((v,i)=>i===0||v!=="—").join(" – ");
   el(row,"span","timeline-meta",dates+" · "+trip.duration);
  }
  if(list.length>24)el(yearbook,"p","empty","Et "+(list.length-24)+" autres voyages racontés dans ce carnet.");
  if(!list.length)el(yearbook,"p","empty","Aucun voyage ne correspond aux filtres sélectionnés.");
  for(const [index,trip] of list.entries()){
   // Compact trips stay on ONE page; photo-rich/long memories get a spread.
   // More than 8 activities also requires space; never truncate user content.
   const spread=trip.photos.length>=2||trip.memory.length>500||trip.activities.length>8;
   const hero=el(main,"section","sheet-page trip-hero "+(spread?"trip-spread":"trip-compact"));
   const banner=el(hero,"header","trip-banner");
   const header=el(banner,"div");
   el(header,"p","eyebrow","VOYAGE "+String(index+1).padStart(2,"0"));
   el(header,"h2",null,trip.country);
   el(header,"p","trip-line",[trip.cities,trip.entry+" – "+trip.exit].filter(Boolean).join(" · "));
   flag(banner,trip.code);
   const pills=el(hero,"div","pills");
   for(const text of [trip.purpose,trip.duration,...(trip.domestic?["Séjour national"]:[])])
    el(pills,"span","pill",text);
   if(trip.photos.length){
    const grid=el(hero,"div","photo-mosaic");
    for(const [i,url] of trip.photos.entries()){
     const figure=el(grid,"figure",i===0?"featured-photo":"supporting-photo");
     makePhoto(figure,url,"Photo privée de "+trip.country);
    }
   }else{
    const ribbon=el(hero,"div","photo-placeholder");
    flag(ribbon,trip.code);
    el(ribbon,"span",null,trip.country);
   }
   if(failed[index])el(hero,"p","photo-missing",failed[index]+" photo"+
    (failed[index]===1?"":"s")+" indisponible"+(failed[index]===1?"":"s")+" lors de la préparation.");
   const story=spread?el(main,"section","sheet-page trip-story"):
    el(hero,"div","trip-story trip-story-inline");
   el(story,"p","eyebrow","MES SOUVENIRS · "+trip.country.toUpperCase());
   el(story,"h2",null,"Ce que je garde de ce voyage");
   if(trip.memory)el(story,"blockquote","quote",trip.memory);
   else el(story,"p","empty","Aucun souvenir écrit pour ce voyage.");
   const storyHead=el(story,"div","story-heading");
   el(storyHead,"h3",null,"Moments & activités");
   if(!trip.activities.length)el(story,"p","empty","Aucune activité renseignée.");
   else{
    const activities=el(story,"ol","activity-timeline");
    for(const a of trip.activities){
     const row=el(activities,"li");
     el(row,"strong",null,a.title);
     const details=[a.date==="—"?"":a.date,a.place].filter(Boolean).join(" · ");
     if(details)el(row,"small",null,details);
    }
   }
  }
  const closing=el(main,"section","sheet-page closing");
  el(closing,"p","eyebrow","BEAM · TRAVEL HISTORY");
  el(closing,"h2",null,"Chaque voyage laisse une histoire.");
  el(closing,"p",null,"Carnet généré le "+generatedAt.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})+" par BEAM Travel History");
  // The image-load path is intentionally independent of the signed URL source.
  // Failed signatures + failed image fetches are both reflected in the toolbar.
  const images=[...doc.querySelectorAll("img")].filter(img=>img.src.startsWith("https://"));
  const seen=new Map(),photoCount=[...new Set(images.map(img=>img.src))].length;
  let loaded=0,loadedPhotos=0;
  const plural=n=>n===1?"1 photo n'a pas pu être chargée":n+" photos n'ont pas pu être chargées";
  const quota=Boolean(model.limitReached);
  const quotaText=quota?" · Limite de 40 photos atteinte (photos supplémentaires non incluses).":"";
  function finish(results){
   if(doc.defaultView?.closed)return;
   const failures=initialFailed+results.filter(x=>!x).length;
   print.disabled=false;
   status.textContent=failures?"Prêt pour l’impression · "+plural(failures)+quotaText:
    "Prêt pour l’impression · "+loadedPhotos+" photo"+(loadedPhotos===1?"":"s")+" chargée"+(loadedPhotos===1?"":"s")+quotaText;
  }
  function loadImage(img){
   return new Promise(resolve=>{
    let settled=false,timer;
    const success=()=>settle(img.naturalWidth>0);
    const failure=()=>settle(false);
    function settle(ok){
     if(settled)return;
     settled=true;clearTimeout(timer);
     img.removeEventListener("load",success);img.removeEventListener("error",failure);
     if(!ok){
      if(img.closest(".cover-art")){img.remove();}
      else{
       const figure=img.parentNode;img.remove();
       if(figure)el(figure,"figcaption","photo-missing","Photo indisponible pour l’impression.");
      }
     }
     resolve(ok);
    }
    img.addEventListener("load",success);img.addEventListener("error",failure);
    timer=setTimeout(()=>settle(false),30000);
    if(img.complete)settle(img.naturalWidth>0);
   });
  }
  if(!images.length)finish([]);
  else Promise.all(images.map(img=>{
   const url=img.src;
   // One URL may be used for the cover and inside its journey.
   // Deduplicate failure accounting, without persisting the token or URL.
   return loadImage(img).then(ok=>{
    if(ok)loaded++;
    if(!seen.has(url)){seen.set(url,ok);if(ok)loadedPhotos++;}
    else if(ok&&!seen.get(url)){seen.set(url,true);loadedPhotos++;}
    status.textContent="Chargement des photos · "+loaded+" / "+images.length;
    return ok;
   });
  })).then(results=>{
   // Deduplicate failures by source if the same photo appears on the cover.
   const failedUrls=new Set(images.filter((_,i)=>!results[i]).map(img=>img.src));
   finish(Array.from(failedUrls).map(()=>false));
  }).catch(()=>{print.disabled=false;status.textContent="Certaines photos ne sont pas disponibles."+quotaText;});
  return list.length;
 }
 function makePhoto(parent,url,alt,klass){
  const img=el(parent,"img",klass);
  img.alt=alt;img.loading="eager";img.decoding="async";
  img.setAttribute("referrerpolicy","no-referrer");img.src=url;
  return img;
 }
 const api=Object.freeze({NOTICE,MAX_PHOTOS_PER_TRIP,MAX_TOTAL_PHOTOS,SIGNED_SECONDS,
  preferredMediaQuery,filterLabel,viewTrip,period,titleForName,fitAtlasToVisited,render});
 if(root)root.BEAM_PERSONAL_JOURNAL=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
