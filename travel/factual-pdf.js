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
  const isValidCountry=code=>typeof code==="string"&&Object.prototype.hasOwnProperty.call(COUNTRY_NAMES,code);
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
  // Explicit opt-in contact projection: never read extra keys or Auth metadata.
  // These values come from the signed-in Auth user and their own profiles row.
  const CONTACT_FIELDS=Object.freeze(["email","phone","postalAddress"]);
  // Validate one canonical number for form submission AND factual PDF export.
  // 00... -> +..., national GN mobile 6XXXXXXXX -> +2246XXXXXXXX.
  // Keep only explicitly accepted visual separators; no guessing other codes.
  function normalizePhone(raw){
    const input=typeof raw==="string"?raw:"";
    let phone=input.trim().replace(/[\s.\-()]/g,"");
    if(!phone)return "";
    if(phone.startsWith("00"))phone="+"+phone.slice(2);
    else if(/^6[0-9]{8}$/.test(phone))phone="+224"+phone;
    if(!phone.startsWith("+"))
      throw new Error("Téléphone invalide : ajoutez l’indicatif du pays (ex. +224 622 09 56 30).");
    if(!/^\+[0-9]{6,15}$/.test(phone))
      throw new Error("Téléphone invalide : 6 à 15 chiffres après + (ex. +224 622 09 56 30).");
    return phone;
  }
  function contactProjection(input){
    if(!input||typeof input!=="object")throw new Error("Coordonnées indisponibles.");
    const email=typeof input.email==="string"?input.email.trim():"";
    const phone=normalizePhone(input.phone);
    const postalAddress=typeof input.postalAddress==="string"?input.postalAddress.trim():"";
    if(email.length>254||!email||!email.includes("@")||/[\r\n<>]/.test(email))
      throw new Error("E-mail du compte indisponible.");
    if(postalAddress.length>300)throw new Error("Adresse déclarée trop longue.");
    return Object.freeze({email,phone,postalAddress});
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
      if(!isValidCountry(code))throw new Error("Code pays non reconnu dans le PDF.");
      const cities=Array.isArray(row.cities)
        ? row.cities.filter(x=>typeof x==="string"&&x.trim()).join(", ") : "";
      const days=Number(row.duration_days);
      const key=typeof row.purpose==="string"?row.purpose:"";
      return Object.freeze({
        country:COUNTRY_NAMES[code],code,
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
    ".share-button{border:1px solid #174d3a;border-radius:25px;background:white;color:#174d3a;padding:11px 19px;font-weight:700;font-size:11pt;cursor:pointer}",
    ".share-button:disabled{opacity:.6;cursor:not-allowed}",
    ".share-status{font-size:9pt;color:#486450}",
    ".declared-contacts{border:1px solid #c4d5c8;background:#fbfdfb;padding:10px 12px;margin:0 0 8mm;break-inside:avoid;overflow-wrap:anywhere}",
    ".declared-contacts h2{font:700 11pt Arial,sans-serif;color:#174d3a;margin:0 0 5px}",
    ".declared-contacts p{margin:3px 0;font-size:9.5pt;white-space:pre-wrap}",
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
    const includeContacts=metadata?.includeContacts===true;
    const contacts=includeContacts?contactProjection(metadata?.contacts):null;
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
    const share=add(toolbar,"button","Partager","share-button");
    share.type="button";share.disabled=true;
    const shareStatus=add(toolbar,"span","","share-status");
    shareStatus.setAttribute("role","status");shareStatus.setAttribute("aria-live","polite");
    // Generate the file while rendering, before the next user click, so the
    // Android navigator.share(files) call retains transient user activation.
    // The tab holds this Blob in RAM only; it is never sent to a server/cache.
    const win=doc.defaultView;
    let exportBlob=null,exportFile=null;
    try{
      const writer=root?.BEAM_FACTUAL_PDF_FILE;
      if(rows.length&&writer?.make&&win?.Blob){
        const bytes=writer.make({...metadata,includeContacts,contacts},rawRows);
        exportBlob=new win.Blob([bytes],{type:"application/pdf"});
        exportFile=typeof win.File==="function"?
          new win.File([bytes],"BEAM-Travel-History.pdf",{type:"application/pdf"}):null;
        share.disabled=false;
      }
    }catch{
      shareStatus.textContent="Partage indisponible ; utilisez l'impression PDF.";
    }
    function downloadFile(){
      if(!exportBlob||!win?.URL?.createObjectURL){
        shareStatus.textContent="Utilisez « Imprimer » puis « Enregistrer en PDF ».";
        return;
      }
      const temporary=win.URL.createObjectURL(exportBlob);
      const anchor=doc.createElement("a");
      anchor.href=temporary;anchor.download="BEAM-Travel-History.pdf";
      anchor.rel="noopener noreferrer";anchor.hidden=true;
      doc.body.appendChild(anchor);
      anchor.click();anchor.remove();
      // Do not cache or persist a document URL: revoke after the browser
      // has had enough time to start the user-requested file download.
      win.setTimeout(()=>win.URL.revokeObjectURL(temporary),30000);
      shareStatus.textContent="PDF téléchargé. Vous pouvez le partager depuis vos fichiers.";
    }
    share.addEventListener("click",()=>{
      if(!exportBlob)return;
      // SHARE MUST BE CALLED SYNCHRONOUSLY inside this click handler.
      // Sharing the preview's about:blank URL would expose no PDF at all.
      let supportsFiles=false;
      try{
        supportsFiles=!!exportFile&&!!win?.navigator?.share&&
          !!win.navigator.canShare?.({files:[exportFile]});
      }catch{}
      if(!supportsFiles){downloadFile();return}
      try{
        Promise.resolve(win.navigator.share({
          files:[exportFile],title:"BEAM Travel History",text:"Historique de voyages déclaré"
        })).catch(err=>{
          if(err?.name!=="AbortError")downloadFile();
        });
      }catch{downloadFile()}
    });
    const header=add(main,"header");
    add(header,"div","BEAM · TRAVEL HISTORY","brand");
    add(header,"h1","Historique de voyages");
    add(header,"p","Voyages internationaux déclarés par le voyageur","subtitle");
    add(header,"p","Voyageur : "+name,"meta");
    add(header,"p","Document généré le "+date,"meta");
    if(contacts){
      const box=add(main,"section",null,"declared-contacts");
      add(box,"h2","Coordonnées déclarées");
      for(const [label,key] of [["E-mail","email"],["Téléphone","phone"],["Adresse","postalAddress"]]){
        if(contacts[key])add(box,"p",label+" : "+contacts[key]);
      }
    }
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
  const api=Object.freeze({VIEW,FIELDS,DECLARATION,CONTACT_FIELDS,normalizePhone,contactProjection,
    fetchRows,factualRows,render,displayName,generatedDate,purposeName});
  if(root)root.BEAM_TRAVEL_PDF=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
