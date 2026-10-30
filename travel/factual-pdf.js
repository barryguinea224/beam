// BEAM Travel History PDF V1 - strictly factual, built locally in the browser.
// The only source is the security_invoker view travel_history_pdf, with a closed projection.
// Never add notes, activities, photos or an option to include private memories here.
(function(root){
  "use strict";
  const VIEW="travel_history_pdf";
  const FIELDS=Object.freeze(["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
  const DECLARATION="Historique déclaré par l'utilisateur, non délivré par une autorité officielle";
  const COUNTRY_NAMES=(root?.BEAM_COUNTRIES||(
    typeof require==="function"?require("./countries.js"):null
  ))?.NAMES;
  if(!COUNTRY_NAMES)throw new Error("Référentiel des pays indisponible.");
  const PURPOSES=Object.freeze({
    tourisme:"Tourisme",affaires:"Affaires",etudes:"Études",
    famille:"Famille",sante:"Santé",transit:"Transit",autre:"Autre"
  });
  function purposeName(value){return PURPOSES[value]||"Autre"}
  function fetchRows(client,userId){
    if(!client?.from||!userId)throw new Error("Session indisponible.");
    return client.from(VIEW).select(FIELDS.join(",")).eq("user_id",userId)
      .order("entry_date",{ascending:false});
  }
  function displayName(raw){
    const name=typeof raw==="string"?raw.trim().replace(/\s+/g," "):"";
    if(!name||name.length>80)throw new Error("Le nom du voyageur est requis (80 caractères maximum).");
    return name;
  }
  function generatedDate(value){
    if(!(value instanceof Date)||Number.isNaN(value.getTime()))
      throw new Error("Date de génération indisponible.");
    return String(value.getDate()).padStart(2,"0")+"/"+
      String(value.getMonth()+1).padStart(2,"0")+"/"+value.getFullYear();
  }
  function shortDate(raw){
    if(typeof raw!=="string"||!/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.test(raw))return "—";
    const [year,month,day]=raw.split("-").map(Number);
    const probe=new Date(Date.UTC(year,month-1,day));
    if(probe.getUTCFullYear()!==year||probe.getUTCMonth()+1!==month||probe.getUTCDate()!==day)return "—";
    return String(day).padStart(2,"0")+"/"+String(month).padStart(2,"0")+"/"+year;
  }
  function factualRows(rawRows){
    if(!Array.isArray(rawRows))throw new Error("Historique indisponible.");
    // Strict allowlist: discard ALL other properties, including any private content.
    return rawRows.map(row=>{
      const code=typeof row.country_code==="string"?row.country_code.toUpperCase():"";
      const cities=Array.isArray(row.cities)
        ? row.cities.filter(x=>typeof x==="string"&&x.trim()).join(", ") : "";
      const days=Number(row.duration_days);
      const key=typeof row.purpose==="string"?row.purpose:"";
      return Object.freeze({
        country:COUNTRY_NAMES[code]||code||"—",code:code||"—",
        cities:cities||"—",entry:shortDate(row.entry_date),exit:shortDate(row.exit_date),
        duration:Number.isInteger(days)&&days>0?days+" jour"+(days===1?"":"s"):"—",
        purpose:purposeName(key)
      });
    });
  }
  const CSS=[
    "@page{size:A4;margin:19mm 14mm 25mm}",
    "*{box-sizing:border-box}",
    "html{color:#202924;background:#fff;font-family:Arial,'Helvetica Neue',sans-serif}",
    "body{margin:0;font-size:10.5pt;line-height:1.42}",
    "main{max-width:190mm;margin:0 auto}",
    "header{border-bottom:2px solid #174d3a;padding:0 0 10mm;margin:0 0 9mm}",
    ".brand{font-weight:800;letter-spacing:.12em;color:#174d3a;font-size:10pt}",
    "h1{font-size:23pt;font-weight:700;line-height:1.15;margin:8mm 0 2mm}",
    ".subtitle{color:#66736e;margin:0}",
    ".meta{font-size:10pt;margin:6px 0;color:#33443a;overflow-wrap:anywhere}",
    ".declaration{border:1px solid #174d3a;background:#f5f9f6;color:#25392e;padding:9px 12px;font-size:10pt;font-weight:700;margin:0 0 8mm}",
    ".count{color:#4f5e56;font-size:10pt;margin:0 0 3mm}",
    "table{border-collapse:collapse;width:100%;table-layout:fixed}",
    "th{background:#eaf0ec;color:#174d3a;font-size:8.6pt;text-align:left;padding:9px 6px;border-bottom:2px solid #174d3a}",
    "td{padding:9px 6px;border-bottom:1px solid #dfe5e0;overflow-wrap:anywhere;vertical-align:top}",
    "th:nth-child(1){width:20%}th:nth-child(2){width:20%}th:nth-child(3),th:nth-child(4){width:15%}",
    "th:nth-child(5){width:13%}th:nth-child(6){width:17%}",
    "thead{display:table-header-group}tr{break-inside:avoid}",
    ".code{font-size:8pt;color:#687970;display:block;margin-top:2px}",
    ".empty{padding:18px 0;color:#5e6961}",
    ".footnote{font-size:9pt;color:#607269;margin:7mm 0 0}",
    ".page-notice{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #bfcfc4;padding-top:3mm;color:#44564a;font-size:8pt;text-align:center}",
    ".toolbar{margin:0 0 12mm;display:flex;gap:12px;align-items:center}",
    ".print-button{border:0;border-radius:25px;background:#174d3a;color:white;padding:11px 19px;font-weight:700;cursor:pointer;font-size:11pt}",
    ".toolbar-note{font-size:10pt;color:#5b6960}",
    "@media print{.toolbar{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{display:none!important}}",
    "@media screen{body{padding:24px 18px;background:#edf1ed}main{background:white;padding:28px;box-shadow:0 4px 25px #17231f20}.page-notice{position:static;margin-top:14mm}}",
    "@media(max-width:620px){body{padding:8px}main{padding:16px;overflow-x:auto}table{min-width:530px}.toolbar{flex-direction:column;align-items:stretch}}"
  ].join("\n");
  function add(parent,tag,content,cssClass){
    const node=parent.ownerDocument.createElement(tag);
    if(cssClass)node.className=cssClass;
    if(content!==undefined&&content!==null)node.textContent=String(content);
    parent.appendChild(node);
    return node;
  }
  function render(doc,rawRows,metadata){
    // Metadata is only the user's declared profile name and a local generation date.
    const name=displayName(metadata?.displayName);
    const date=generatedDate(metadata?.generatedAt);
    const rows=factualRows(rawRows);
    doc.documentElement.lang="fr";
    const meta=doc.createElement("meta");meta.setAttribute("charset","utf-8");
    const title=doc.createElement("title");title.textContent="BEAM - Travel History PDF";
    const style=doc.createElement("style");style.textContent=CSS;
    doc.head.replaceChildren(meta,title,style);
    doc.body.replaceChildren();
    const main=add(doc.body,"main");
    const toolbar=add(main,"div",null,"toolbar");
    const button=add(toolbar,"button","Imprimer / Enregistrer au format PDF","print-button");
    button.type="button";button.disabled=rows.length===0;
    button.addEventListener("click",()=>doc.defaultView?.print());
    add(toolbar,"span","Choisissez « Enregistrer au format PDF » dans l’impression.","toolbar-note");
    const header=add(main,"header");
    add(header,"div","BEAM · TRAVEL HISTORY","brand");
    add(header,"h1","Historique de voyages");
    add(header,"p","Voyages internationaux déclarés par le voyageur","subtitle");
    add(header,"p","Voyageur : "+name,"meta");
    add(header,"p","Document généré le "+date,"meta");
    add(main,"p",DECLARATION,"declaration");
    add(main,"p",rows.length+" voyage"+(rows.length===1?"":"s")+" déclaré"+(rows.length===1?"":"s"),"count");
    if(!rows.length){
      add(main,"p","Aucun voyage international éligible à ce document.","empty");
    }else{
      const table=add(main,"table");
      const thead=add(table,"thead");
      const heading=add(thead,"tr");
      for(const label of ["Pays","Ville(s)","Entrée","Sortie","Durée","Motif"])add(heading,"th",label);
      const tbody=add(table,"tbody");
      for(const trip of rows){
        const tr=add(tbody,"tr");
        const country=add(tr,"td");
        add(country,"span",trip.country);
        add(country,"span",trip.code,"code");
        for(const key of ["cities","entry","exit","duration","purpose"])add(tr,"td",trip[key]);
      }
    }
    add(main,"p","Ce document présente uniquement les voyages déclarés à l’étranger. Il ne constitue pas une preuve de passage aux frontières.","footnote");
    add(doc.body,"footer",DECLARATION,"page-notice");
    return rows.length;
  }
  const api=Object.freeze({VIEW,FIELDS,DECLARATION,fetchRows,factualRows,render,displayName,generatedDate,purposeName});
  if(root)root.BEAM_TRAVEL_PDF=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
