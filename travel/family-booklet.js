// Personal family booklet: A5 portrait leaves imposed on an A4 portrait print sheet.
// The A4 landscape spread is rotated clockwise inside each physically portrait page.
(function(root){
"use strict";
const COUNTRIES=root?.BEAM_COUNTRIES||(typeof require==="function"?require("./countries.js"):null);
const JOURNAL=root?.BEAM_PERSONAL_JOURNAL||(typeof require==="function"?require("./printable-journal.js"):null);
if(!COUNTRIES||!JOURNAL){if(root)root.BEAM_FAMILY_BOOKLET=null;return;} // Optional print module must never crash the account page.
const node=(parent,tag,cls,value)=>{const e=parent.ownerDocument.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value??"");parent.appendChild(e);return e;};
const svgEl=(doc,tag)=>doc.createElementNS("http://www.w3.org/2000/svg",tag);
function imposedOrder(n){
 if(!Number.isInteger(n)||n<4||n%4)throw Error("Nombre de pages non imposable.");
 const rows=[];
 for(let i=0;i<n/4;i++){
  rows.push(Object.freeze({sheet:i+1,side:"recto",left:n-2*i,right:1+2*i}));
  rows.push(Object.freeze({sheet:i+1,side:"verso",left:2+2*i,right:n-1-2*i}));
 }
 return rows;
}
function splitMemory(value,limit=550){
 const parts=[];let rest=typeof value==="string"?value:"";
 while(rest.length>limit){
  const index=rest.lastIndexOf(" ",limit),n=index>limit/2?index:limit;
  parts.push(rest.slice(0,n));rest=rest.slice(n).trimStart();
 }
 parts.push(rest);return parts;
}
function natural(trip){
 const iso=String(trip.entryISO||"");let month="";
 if(/^\d{4}-\d{2}-\d{2}$/.test(iso)){
  const d=new Date(iso+"T12:00:00Z");
  if(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso)
   month=d.toLocaleDateString("fr-FR",{month:"long",year:"numeric",timeZone:"UTC"});
 }
 const city=trip.cities?.split(",")[0]||trip.country;
 return [month,trip.days+" jour"+(trip.days===1?"":"s")+" à "+city,trip.purpose].filter(Boolean).join(" · ");
}
function flag(parent,code,big=false){
 if(!COUNTRIES.valid(code))return node(parent,"span",null,"✧");
 const img=node(parent,"img",big?"flag-big":"flag-small");
 img.src="/travel/assets/flags/"+code.toLowerCase()+".svg";img.alt="";
 img.setAttribute("referrerpolicy","no-referrer");return img;
}
function privatePhoto(parent,url,alt,cls){
 if(typeof url!=="string"||!url.startsWith("https://"))return null;
 const img=node(parent,"img",cls);img.src=url;img.alt=alt;img.loading="eager";img.decoding="async";
 img.setAttribute("referrerpolicy","no-referrer");return img;
}
// Whitelist geometry only: copied from the existing local SVG, never injected as HTML.
function world(parent,raw,visited,side){
 const doc=parent.ownerDocument,box=node(parent,"div","world");
 if(typeof raw!=="string"||raw.length>250000||!doc.defaultView?.DOMParser){
  node(box,"p","fallback","Notre monde");return;
 }
 const parsed=new doc.defaultView.DOMParser().parseFromString(raw,"image/svg+xml");
 if(parsed.documentElement?.localName!=="svg"){node(box,"p","fallback","Notre monde");return}
 const svg=svgEl(doc,"svg");// An overlapping 22-unit gutter on both halves keeps visited outlines visible
 // on either side of the fold (including countries crossing the central meridian).
 svg.setAttribute("viewBox",side==="west"?"0 0 522 445":"478 0 522 445");
 svg.setAttribute("role","img");svg.setAttribute("aria-label","Carte du monde");
 let count=0;
 for(const p of parsed.documentElement.querySelectorAll("path[data-country]")){
  const code=p.getAttribute("data-country")||"",d=p.getAttribute("d")||"";
  if(!/^[A-Z]{2}$/.test(code)||!COUNTRIES.valid(code)||d.length>25000||!/^[a-zA-Z0-9,.\s+\-]+$/.test(d))continue;
  const copy=svgEl(doc,"path");copy.setAttribute("d",d);copy.setAttribute("data-country",code);
  copy.setAttribute("class",visited.has(code)?"visited":"land");svg.appendChild(copy);count++;
 }
 if(count)box.appendChild(svg);else node(box,"p","fallback","Notre monde");
}
const CSS="\n*{box-sizing:border-box}\nhtml,body{margin:0;background:#e9ece6;color:#19372b;font:13px/1.45 Georgia,'Times New Roman',serif}\n.toolbar{position:sticky;top:0;z-index:3;background:white;padding:10px;display:flex;align-items:center;gap:11px;flex-wrap:wrap;font:13px/1.4 system-ui,sans-serif}\n.toolbar button,.toolbar select{min-height:43px;padding:8px 12px;border-radius:7px;border:1px solid #2b583f;font:inherit}\n.toolbar button{background:#275039;color:white;font-weight:700}\n.toolbar button:disabled{opacity:.55}\n.toolbar .help{flex:1;min-width:175px;color:#536e5d}\n.stage{display:flex;flex-direction:column;align-items:center;gap:15px;padding:20px 6px}\n.sheet{width:210mm;height:297mm;position:relative;flex:none;background:white;box-shadow:0 4px 18px #283c302b;overflow:hidden}\n.spread{position:absolute;top:0;left:0;width:210mm;height:297mm;display:flex;flex-direction:column}\n.half{width:210mm;height:148.5mm;flex:none;position:relative;overflow:visible;break-inside:avoid;page-break-inside:avoid}\n.leaf{width:148.5mm;height:210mm;overflow:hidden;position:absolute;top:0;left:0;transform-origin:0 0;transform:rotate(90deg) translateY(-100%);background:white;display:flex;flex-direction:column}\n.inner{position:relative;width:100%;height:100%;padding:11mm 10mm;display:flex;flex-direction:column}\nh1{font-size:25pt;line-height:1.05;margin:7mm 0 3mm;overflow-wrap:anywhere}\nh2{font-size:19pt;line-height:1.1;margin:2mm 0 4mm;overflow-wrap:anywhere}\np{margin:1mm 0 3mm}\nh1,h2,h3,p,blockquote,.natural{text-align:left;text-align-last:left;word-spacing:normal}\n.ey{font:700 9pt system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}\n.subtle{color:#5c7b66}\n.page-number{position:absolute;bottom:4mm;right:7mm;color:#769184;font:9pt system-ui,sans-serif}\n.cover{background:linear-gradient(130deg,#3d674b,#b3c9a2);color:white}\n.cover .inner{background:linear-gradient(0deg,#112e24e8,transparent 85%);justify-content:flex-end}\n.cover .inner,.photo-leaf .inner{z-index:1}\n.cover-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\n.cover .subtle{color:#eaf6ea}\n.world-leaf{background:#e9eee5}\n.world-leaf .inner{padding:9mm 5mm}\n.world{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}\n.world svg{width:100%;height:100%}\n.world path.land{fill:#c1d0c5;stroke:white;stroke-width:.5}\n.world path.visited{fill:#1e754e;stroke:white;stroke-width:.6}\n.world-leaf h2{font-size:14pt}\n.photo-leaf{background:linear-gradient(140deg,#2c5a44,#a5b69e);color:white}\n.photo-hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\n.photo-leaf .inner{justify-content:flex-end;background:linear-gradient(0deg,#152c25d9,transparent 55%)}\n.photo-leaf h2{font-size:23pt}\n.photo-leaf .flag-big{width:55mm;height:37mm;position:absolute;top:16mm;left:14mm;object-fit:contain}\n.story-leaf{background:radial-gradient(ellipse at 42% 45%,#fffdf6 0%,#f6f2e5 100%)}\n.story-leaf .inner{display:flex;flex-direction:column;gap:4mm;padding:10mm 11mm}\n.story-main{min-width:0;display:flex;flex-direction:column;justify-content:flex-start;overflow-wrap:anywhere}\n.story-leaf h2{font-size:18pt}\n.natural{font:10.5pt/1.3 system-ui,sans-serif;color:#4d7059}\nblockquote{font:italic 15pt/1.24 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:3mm 0;padding:2mm 0 2mm 4mm;border-left:2mm solid #a3b79a}\n.story-leaf.dense blockquote{font-size:11pt}\n.moments{font:9pt/1.28 system-ui,sans-serif;margin-top:4mm}\n.moments p{border-top:1px solid #d3ddce;padding-top:1mm}\n.media{display:flex;gap:2mm;min-height:40mm;height:45mm;width:100%;flex:none}\n.media>div{min-width:0;min-height:0;flex:1;overflow:hidden}\n.media img{width:100%;height:100%;object-fit:cover;border-radius:3mm}\n.story-leaf .story-main .flag-small{width:34px;height:24px;max-width:34px;max-height:24px;object-fit:contain;align-self:flex-start;flex:none}\n.media .placeholder .flag-small{width:40px;height:28px;max-width:40px;max-height:28px;object-fit:contain}\n.media .placeholder{gap:3mm}\n.media .placeholder{display:grid;place-items:center;background:#e0e8d7;color:#39583e;border-radius:3mm;text-align:center;padding:3mm}\n.continuation{background:#f8f4eb}\n.continuation blockquote{font-size:12pt}\n.decorative{background:#e9eee1}\n.notes-leaf{background:#f5f0e6}\n.mosaic-leaf{background:#e5eee6}\n.mosaic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:62mm;gap:3mm;min-height:0}\n.mosaic-grid img{width:100%;height:100%;object-fit:cover;border-radius:3mm}\n.closing{background:#e7f0e6}\n.closing .inner{padding:13mm 18mm;justify-content:center}\n.write-line{height:12mm;border-bottom:1px solid #9bb09d}\n.simple-a4 .half,.simple-a4 .leaf{width:210mm;height:297mm}\n.simple-a4 .leaf{position:relative;transform:none}\n.simple-a4 .inner{padding:16mm 21mm}\n.simple-a4 .story-leaf .inner{display:flex;flex-direction:column;gap:8mm;padding:16mm 20mm}\n.simple-a4 .media{display:flex;flex-direction:row;height:60mm;min-height:0;max-height:none;gap:2mm}\n.simple-a4 .media>div{flex:1;min-height:0}\n@media screen and (max-width:850px){.stage{zoom:.46}.simple-a4 .stage{zoom:.31}}\n@media screen and (max-width:440px){.stage{zoom:.37}.simple-a4 .stage{zoom:.26}}\n@media print{html,body{width:210mm!important;max-width:210mm!important;overflow:hidden!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none!important}.stage{width:210mm!important;min-width:210mm!important;max-width:210mm!important;display:block!important;overflow:hidden!important;padding:0!important;gap:0!important;zoom:1!important}.sheet{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}}\n";

function render(doc,model){
 if(!doc?.createElement||!Array.isArray(model?.trips)||!model.trips.length)throw Error("Aucun voyage à imprimer.");
 const list=model.trips.map((data,i)=>({data,trip:JOURNAL.viewTrip(data.trip,data.activities,data.photos),i}))
  .sort((a,b)=>a.trip.entryISO.localeCompare(b.trip.entryISO)||a.i-b.i);
 const name=String(model.name||"").trim().replace(/\s+/g," ").slice(0,80);
 const stamp=(model.generatedAt instanceof Date?model.generatedAt:new Date()).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
 const period=JOURNAL.period(list.map(x=>x.trip));
 const bookTitle=JOURNAL.titleForName(name);
 doc.documentElement.lang="fr";
 const meta=doc.createElement("meta");meta.setAttribute("charset","utf-8");
 const ref=doc.createElement("meta");ref.setAttribute("name","referrer");ref.setAttribute("content","no-referrer");
 const viewport=doc.createElement("meta");viewport.setAttribute("name","viewport");viewport.setAttribute("content","width=device-width,initial-scale=1");
 const title=doc.createElement("title");title.textContent=bookTitle;
 const css=doc.createElement("style");css.textContent=CSS;
 const pageRule=doc.createElement("style");pageRule.textContent="@page{size:A4 portrait;margin:0}";
 doc.head.replaceChildren(meta,viewport,ref,title,css,pageRule);
 doc.body.replaceChildren();
 const toolbar=node(doc.body,"div","toolbar");
 const button=node(toolbar,"button",null,"Imprimer mon livret");button.type="button";button.disabled=true;
 const label=node(toolbar,"label",null,"Format : ");
 const select=node(label,"select");select.id="bookletFormat";
 for(const [value,text] of [["booklet","Livret A5 portrait (2 par A4)"],["simple","Pages simples A4"]]){
  const option=node(select,"option",null,text);option.value=value;
 }
 const help=node(toolbar,"span","help","Portrait, recto verso bord court · A4 · taille réelle · plier horizontalement puis tourner le livret vers la gauche.");
 const status=node(toolbar,"span",null,"Préparation des photos…");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const stage=node(doc.body,"main","stage");
 const leaves=[];
 const leaf=(klass)=>{const page=doc.createElement("section");page.className="leaf "+klass;const inside=node(page,"div","inner");leaves.push(page);return {page,inside};};
 const cover=leaf("cover");
 const fav=model.trips.find(t=>typeof t.favoritePhoto==="string"&&t.photos?.includes(t.favoritePhoto))?.favoritePhoto;
 const coverUrl=fav||list.find(x=>x.trip.photos.length)?.trip.photos[0]||"";
 privatePhoto(cover.page,coverUrl,"Couverture du carnet","cover-photo");
 node(cover.inside,"div","ey","Nos voyages, notre histoire");
 node(cover.inside,"h1",null,bookTitle);
 node(cover.inside,"p","subtle",period);
 const countries=new Set(list.map(x=>x.trip.code));
 for(const side of ["west","east"]){
  const map=leaf("world-leaf");node(map.inside,"p","ey","Notre monde · "+(side==="west"?"1/2":"2/2"));
  world(map.inside,model.mapSvgText,countries,side);
  if(side==="east")node(map.inside,"h2",null,"À chaque voyage, une histoire.");
 }
 for(const {trip} of list){
  const photo=leaf("photo-leaf");
  if(!privatePhoto(photo.page,trip.photos[0],"Photo de "+trip.country,"photo-hero"))
   flag(photo.page,trip.code,true);
  node(photo.inside,"p","ey","Notre voyage");
  node(photo.inside,"h2",null,trip.country);
  node(photo.inside,"p",null,natural(trip));
  const parts=splitMemory(trip.memory);
  const story=leaf("story-leaf"+(parts[0].length>300||trip.activities.length>3?" dense":""));
  const text=node(story.inside,"div","story-main");
  const media=node(story.inside,"div","media");
  flag(text,trip.code);
  node(text,"h2",null,trip.country);
  node(text,"p","natural",natural(trip));
  if(parts[0])node(text,"blockquote",null,parts[0]);
  else node(text,"p","subtle","Un souvenir à raconter ensemble.");
  const activities=node(text,"div","moments");
  for(const a of trip.activities.slice(0,5))node(activities,"p",null,[a.title,a.place,a.date==="—"?"":a.date].filter(Boolean).join(" · "));
  // Keep the fourth photo for a distinct fill-in mosaic when space permits.
  for(const url of trip.photos.slice(1,3)){
   const frame=node(media,"div");privatePhoto(frame,url,"Souvenir privé de "+trip.country,"mini");
  }
  if(trip.photos.length<=1){const box=node(media,"div","placeholder");flag(box,trip.code);node(box,"p",null,"Nos souvenirs");}
  const extraNotes=parts.slice(1),extraActs=trip.activities.slice(5);
  const extras=Math.max(extraNotes.length,Math.ceil(extraActs.length/5));
  for(let k=0;k<extras;k++){
   const more=leaf("continuation");
   node(more.inside,"p","ey","Encore des souvenirs · "+trip.country);
   if(extraNotes[k])node(more.inside,"blockquote",null,extraNotes[k]);
   for(const a of extraActs.slice(k*5,(k+1)*5))
    node(more.inside,"p",null,[a.title,a.place,a.date==="—"?"":a.date].filter(Boolean).join(" · "));
  }
 }
 // Filler pages are deliberately different and always precede the last page.
 const remainingPhotos=list.flatMap(({trip})=>trip.photos.slice(3));
 const fillerCount=(4-(leaves.length+1)%4)%4;
 for(let index=0;index<fillerCount;index++){
  if(index===0){
   const notes=leaf("notes-leaf");
   node(notes.inside,"p","ey","À écrire ensemble");
   node(notes.inside,"h2",null,"Notes");
   for(let i=0;i<10;i++)node(notes.inside,"div","write-line");
  }else if(index===1&&remainingPhotos.length){
   const mosaic=leaf("mosaic-leaf");
   node(mosaic.inside,"p","ey","Notre album");
   node(mosaic.inside,"h2",null,"Quelques images de plus");
   const grid=node(mosaic.inside,"div","mosaic-grid");
   for(const url of remainingPhotos.slice(0,4))privatePhoto(grid,url,"Souvenir de voyage","mosaic-photo");
  }else{
   const extra=leaf("decorative");
   node(extra.inside,"p","ey","À partager en famille");
   node(extra.inside,"h2",null,index===1?"Nos lieux préférés":"Les souvenirs à raconter");
   for(let i=0;i<8;i++)node(extra.inside,"div","write-line");
  }
 }
 const closing=leaf("closing");
 node(closing.inside,"p","ey","À écrire ensemble");
 node(closing.inside,"h2",null,"Nos prochains voyages…");
 for(let i=0;i<5;i++)node(closing.inside,"div","write-line");
 node(closing.inside,"p","subtle","Créé le "+stamp);
 leaves.forEach((p,i)=>{if(i&&i!==leaves.length-1)node(p,"span","page-number",String(i+1));});
 const display=(mode)=>{
  const simple=mode==="simple";doc.body.classList.toggle("simple-a4",simple);
  pageRule.textContent="@page{size:A4 portrait;margin:0}";
  stage.replaceChildren();
  if(simple){
   for(const p of leaves){const paper=node(stage,"section","sheet"),spread=node(paper,"div","spread"),slot=node(spread,"div","half");slot.appendChild(p)}
   help.textContent="Pages simples : A4 portrait, taille réelle, lecture directe. Pas de pliage.";
  }else{
   for(const order of imposedOrder(leaves.length)){
    const paper=node(stage,"section","sheet");paper.dataset.sheet=String(order.sheet);paper.dataset.side=order.side;
    const spread=node(paper,"div","spread");
    const left=node(spread,"div","half left");left.appendChild(leaves[order.left-1]);
    const right=node(spread,"div","half right");right.appendChild(leaves[order.right-1]);
   }
   help.textContent="Portrait, recto verso bord court (jamais bord long) · A4 · taille réelle · plier au milieu horizontalement, puis tourner le livret de 90° vers la gauche · reliure à gauche.";
  }
 };
 select.addEventListener("change",()=>display(select.value));
 button.addEventListener("click",()=>doc.defaultView?.print());
 display("booklet");
 const photos=[...doc.querySelectorAll("img")].filter(x=>x.src.startsWith("https://"));
 if(!photos.length){button.disabled=false;status.textContent="Livret prêt à imprimer.";return leaves.length}
 let done=0,failed=list.reduce((n,x)=>n+Number(x.data.missingPhotos||0),0);
 for(const img of photos){
  let settled=false;
  const doneImage=ok=>{
   if(settled)return;settled=true;if(!ok){failed++;img.remove()}
   done++;status.textContent="Photos vérifiées : "+done+" / "+photos.length;
   if(done===photos.length){button.disabled=false;status.textContent=failed?"Prêt · "+failed+" photo(s) indisponible(s).":"Livret prêt à imprimer."}
  };
  img.addEventListener("load",()=>doneImage(img.naturalWidth>0),{once:true});
  img.addEventListener("error",()=>doneImage(false),{once:true});
  if(img.complete)doneImage(img.naturalWidth>0);
  else (doc.defaultView?.setTimeout||setTimeout)(()=>doneImage(img.complete&&img.naturalWidth>0),30000);
 }
 return leaves.length;
}
const api=Object.freeze({imposedOrder,splitMemory,natural,render});
if(root)root.BEAM_FAMILY_BOOKLET=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
