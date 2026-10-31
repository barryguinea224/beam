// BEAM Travel History PDF V1 - strictly factual, built locally in the browser.
// The only source is the security_invoker view travel_history_pdf, with a closed projection.
// Never add notes, activities, photos or an option to include private memories here.
(function(root){
  "use strict";
  const VIEW="travel_history_pdf";
  const FIELDS=Object.freeze(["country_code","cities","entry_date","exit_date","duration_days","purpose"]);
  const DECLARATION=""; // retired for personal documents
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
  // Presentation only: E.164 compact format remains the *only* DB/PDF
  // source value. Keep this pure so blur, profile load and both exports agree.
  const KNOWN_DIAL_CODES=Object.freeze([
    "224","221","225","223","222","226","227","228","229","231",
    "232","233","234","235","236","237","238","239","240","241",
    "242","243","244","245","249","250","251","252","253","254",
    "255","256","257","258","260","261","262","263","264","265",
    "266","267","268","269","212","213","216","218","220","230",
    "234","290","291","297","298","299","351","352","353","354",
    "355","356","357","358","359","370","371","372","373","374",
    "375","376","377","378","380","381","382","383","385","386",
    "387","389","420","421","423","501","502","503","504","505",
    "506","507","509","590","591","592","593","594","595","596",
    "597","598","599","670","672","673","674","675","676","677",
    "678","679","680","681","682","683","685","686","687","688",
    "689","690","691","692","850","852","853","855","856","880",
    "886","960","961","962","963","964","965","966","967","968",
    "970","971","972","973","974","975","976","977","992","993",
    "994","995","996","998",
    "1","7","20","27","30","31","32","33","34","36","39",
    "40","41","43","44","45","46","47","48","49","51","52",
    "53","54","55","56","57","58","60","61","62","63","64",
    "65","66","81","82","84","86","90","91","92","93","94",
    "95","98"
  ].sort((a,b)=>b.length-a.length));
  function groupDigits(digits){
    const groups=[];
    for(let i=0;i<digits.length;){
      const left=digits.length-i;
      const size=left<=3?left:left===4||left-3===1?2:3;
      groups.push(digits.slice(i,i+size));i+=size;
    }
    return groups.join(" ");
  }
  function formatPhone(raw){
    const canonical=normalizePhone(raw);
    if(!canonical)return "";
    if(/^\+224[0-9]{9}$/.test(canonical))
      return canonical.slice(0,4)+" "+canonical.slice(4,7)+" "+
        canonical.slice(7,9)+" "+canonical.slice(9,11)+" "+canonical.slice(11);
    const digits=canonical.slice(1);
    const code=KNOWN_DIAL_CODES.find(v=>digits.startsWith(v))||
      digits.slice(0,Math.min(3,Math.max(1,digits.length-3)));
    const national=digits.slice(code.length);
    return "+"+code+(national?" "+groupDigits(national):"");
  }
  function filenameForName(name){
    const ascii=displayName(name).normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);
    return "Historique-de-voyages-"+(ascii||"Voyageur")+".pdf";
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
    return value.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
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
    "table{border-collapse:collapse;width:100%;table-layout:fixed}",
    "th{background:#eaf0ec;color:#174d3a;font-size:8.6pt;text-align:left;padding:9px 6px;border-bottom:2px solid #174d3a}",
    "td{padding:9px 6px;border-bottom:1px solid #dfe5e0;overflow-wrap:anywhere;vertical-align:top}",
    "th:nth-child(1){width:20%}th:nth-child(2){width:20%}th:nth-child(3),th:nth-child(4){width:15%}",
    "th:nth-child(5){width:13%}th:nth-child(6){width:17%}",
    "thead{display:table-header-group}tr{break-inside:avoid}",
    ".code{font-size:8pt;color:#687970;display:block;margin-top:2px}",
    ".empty{padding:18px 0;color:#5e6961}",
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
    "@media screen{body{padding:24px 18px;background:#edf1ed}main{background:white;padding:28px;box-shadow:0 4px 25px #17231f20}}",
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
    const title=doc.createElement("title");title.textContent="Historique de voyages";
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
          new win.File([bytes],filenameForName(name),{type:"application/pdf"}):null;
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
      anchor.href=temporary;anchor.download=filenameForName(name);
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
          files:[exportFile],title:"Historique de voyages",text:"Historique de voyages"
        })).catch(err=>{
          if(err?.name!=="AbortError")downloadFile();
        });
      }catch{downloadFile()}
    });
    const header=add(main,"header");
    add(header,"h1","Historique de voyages");
    add(header,"p",name,"meta");
    add(header,"p",date,"meta");
    if(contacts){
      const box=add(main,"section",null,"declared-contacts");
      add(box,"h2","Coordonnées déclarées");
      for(const [label,key] of [["E-mail","email"],["Téléphone","phone"],["Adresse","postalAddress"]]){
        if(contacts[key])add(box,"p",label+" : "+(key==="phone"?formatPhone(contacts[key]):contacts[key]));
      }
    }
    {
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
    // Only the personal facts in the closed contract are displayed.
    return rows.length;
  }
  const api=Object.freeze({VIEW,FIELDS,DECLARATION,CONTACT_FIELDS,normalizePhone,formatPhone,filenameForName,contactProjection,
    fetchRows,factualRows,render,displayName,generatedDate,purposeName});
  if(root)root.BEAM_TRAVEL_PDF=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
