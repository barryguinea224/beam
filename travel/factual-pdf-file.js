// BEAM Travel History factual PDF file export for Android native sharing.
// Local, deterministic A4 text PDF. No CDN, canvas, profile storage or network.
// Reuses the exact factual view projection from factual-pdf.js; optional contact
// data is explicitly whitelisted and never supplied by the trips view.
(function(root){
 "use strict";
 const PDF=root?.BEAM_TRAVEL_PDF||(typeof require==="function"?require("./factual-pdf.js"):null);
 if(!PDF)throw new Error("PDF factuel indisponible.");
 const DECLARATION=PDF.DECLARATION;
 const A4=[595.28,841.89];
 const MAX_ROWS=10000;
 const cp1252=Object.freeze({
  0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,
  0x2020:0x86,0x2021:0x87,0x02c6:0x88,0x2030:0x89,0x0160:0x8a,
  0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,0x2019:0x92,
  0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
  0x02dc:0x98,0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,
  0x017e:0x9e,0x0178:0x9f
 });
 function win1252(value){
  let out="";
  for(const character of String(value??"")){
   const code=character.codePointAt(0);
   if(code===10||code===13||code===9){out+=" ";continue}
   if(code>=32&&code<=126||code>=160&&code<=255){out+=String.fromCharCode(code);continue}
   if(cp1252[code]){out+=String.fromCharCode(cp1252[code]);continue}
   if(code<32)continue;
   const transliterated=character.normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
   if(!/^[ -~]+$/.test(transliterated))throw new Error("Caractères non pris en charge par le partage PDF : utilisez l’impression Chrome.");
   out+=transliterated;
  }
  return out;
 }
 function pdfText(value){
  return win1252(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
 }
 function toBytes(text){
  const bytes=new Uint8Array(text.length);
  for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i)&255;
  return bytes;
 }
 function wrap(value,columns){
  const chars=win1252(value).replace(/\s+/g," ").trim();
  if(!chars)return [""];
  const lines=[];let part="";
  for(const word of chars.split(" ")){
   if(word.length>columns){
    if(part){lines.push(part);part=""}
    for(let j=0;j<word.length;j+=columns)lines.push(word.slice(j,j+columns));
   }else if(!part)part=word;
   else if(part.length+1+word.length<=columns)part+=" "+word;
   else{lines.push(part);part=word}
  }
  if(part)lines.push(part);
  return lines.length?lines:[""];
 }
 function make(metadata,rawRows){
  const name=PDF.displayName(metadata?.displayName);
  const generation=PDF.generatedDate(metadata?.generatedAt);
  const rows=PDF.factualRows(rawRows);
  if(rows.length>MAX_ROWS)throw new Error("Historique trop volumineux pour le partage.");
  const contacts=metadata?.includeContacts===true?PDF.contactProjection(metadata?.contacts):null;
  const pageContents=[],pages=[];
  let operations=[],y=0;
  const x=42,widths=[89,125,76,76,62,91],titles=["Pays","Ville(s)","Entrée","Sortie","Durée","Motif"];
  function command(s){operations.push(s)}
  function color(r,g,b){command(r+" "+g+" "+b+" rg")}
  function textAt(v,px,py,size=9,bold=false){
   command("BT /"+(bold?"F2":"F1")+" "+size+" Tf 1 0 0 1 "+
    Number(px.toFixed(2))+" "+Number(py.toFixed(2))+" Tm ("+pdfText(v)+") Tj ET");
  }
  function horizontal(py){command("0.75 0.82 0.76 RG 0.6 w 42 "+py+" m 553 "+py+" l S")}
  function beginPage(){
   operations=[];pages.push(operations);
   color(0.09,0.302,0.227);textAt("Historique de voyages",42,809,18,true);
   color(0.18,0.24,0.2);
   textAt("Voyages internationaux déclarés par le voyageur",42,764,9);
   textAt("Voyageur : "+name,42,742,9);
   textAt("Document généré le "+generation,42,727,9);
   y=702;
   if(pages.length===1&&contacts){
    color(0.09,0.302,0.227);textAt("Coordonnées déclarées",42,y,11,true);
    y-=15;
    for(const [label,key] of [["E-mail","email"],["Téléphone","phone"],["Adresse","postalAddress"]]){
     if(!contacts[key])continue;
     const value=key==="phone"?PDF.formatPhone(contacts[key]):contacts[key];
     const wrapped=wrap(label+" : "+value,100);
     for(const line of wrapped){color(0.18,0.24,0.2);textAt(line,42,y,8.5);y-=12}
    }
    y-=8;
   }
   color(0.12,0.25,0.17);
   for(const line of wrap(DECLARATION,99)){textAt(line,42,y,8,true);y-=12}
   y-=13;
   textAt(rows.length+" voyage"+(rows.length===1?"":"s")+" déclaré"+(rows.length===1?"":"s"),42,y,9);
   y-=22;
   horizontal(y+8);
   let start=x;
   for(let i=0;i<titles.length;i++){color(0.09,0.302,0.227);textAt(titles[i],start+3,y,8,true);start+=widths[i]}
   y-=13;horizontal(y);
   // Footer is emitted on every A4 page, never an official endorsement.
  }
  function endPage(){
   color(0.29,0.38,0.32);
   horizontal(52);
   for(const line of wrap(DECLARATION,105)){
    textAt(line,42,39,7);
    break;
   }
   textAt("Page "+pages.length,509,39,7,true);
  }
  beginPage();
  for(const trip of rows){
   const values=[trip.country+" ("+trip.code+")",trip.cities,trip.entry,trip.exit,trip.duration,trip.purpose];
   const columns=[17,24,12,12,12,17];
   const split=values.map((v,i)=>wrap(v,columns[i]));
   const lines=Math.max(...split.map(a=>a.length));
   const height=Math.max(26,lines*11+12);
   if(y-height<77){endPage();beginPage()}
   let px=x;
   color(0.15,0.2,0.17);
   for(let i=0;i<split.length;i++){
    split[i].forEach((line,j)=>textAt(line,px+3,y-12-j*11,7.7));
    px+=widths[i];
   }
   y-=height;horizontal(y);
  }
  if(!rows.length){
   color(0.3,0.4,0.33);textAt("Aucun voyage international éligible à ce document.",42,y-30,10);
  }
  endPage();

  // Classic PDF 1.4: only vetted text, no images, scripts, links or attachments.
  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[3]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const pageIds=[];
  for(const commands of pages){
   const pageId=objects.length; // use an explicit monotonically allocated id below
   void pageId;
  }
  let next=5;
  for(const commands of pages){
   const pg=next++,stream=next++;
   pageIds.push(pg);
   objects[pg]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+A4.join(" ")+
    "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+stream+" 0 R >>";
   const content=commands.join("\n")+"\n";
   objects[stream]="<< /Length "+toBytes(content).length+" >>\nstream\n"+content+"endstream";
  }
  objects[2]="<< /Type /Pages /Kids ["+pageIds.map(n=>n+" 0 R").join(" ")+
   "] /Count "+pageIds.length+" >>";
  let body="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets=[0];
  for(let i=1;i<next;i++){
   offsets[i]=toBytes(body).length;
   body+=i+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=toBytes(body).length;
  body+="xref\n0 "+next+"\n0000000000 65535 f \n";
  for(let i=1;i<next;i++)body+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  body+="trailer\n<< /Size "+next+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return toBytes(body);
 }
 const api=Object.freeze({make,wrap,win1252});
 if(root)root.BEAM_FACTUAL_PDF_FILE=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
