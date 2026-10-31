"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const PDF=require("../travel/factual-pdf.js");
const COUNTRIES=require("../travel/countries.js");

assert.equal(PDF.VIEW,"travel_history_pdf");
assert.equal(COUNTRIES.NAMES.SE,"Suède");
assert.equal(COUNTRIES.NAMES.FR,"France");
const pdfModule=fs.readFileSync("travel/factual-pdf.js","utf8");
assert.ok(!pdfModule.includes('const COUNTRY_NAMES=Object.freeze({'),
 "There must be only one country-name dictionary");
assert.ok(pdfModule.includes('require("./countries.js")'),
 "PDF must read shared countries in Node");
assert.deepEqual(PDF.FIELDS,[
 "country_code","cities","entry_date","exit_date","duration_days","purpose"
]);
assert.equal(PDF.filenameForName("Élodie D’Été"),"Historique-de-voyages-Elodie-D-Ete.pdf");
assert.equal(PDF.DECLARATION,"","Retired legal notice absent");
assert.deepEqual(PDF.CONTACT_FIELDS,["email","phone","postalAddress"]);

const acceptedPhoneInputs=[
 ["+224 622 09 56 30","+224622095630"],
 ["622095630","+224622095630"],
 ["00224622095630","+224622095630"],
 ["(+224) 622.09-56-30","+224622095630"]
];
for(const [input,expected] of acceptedPhoneInputs){
 assert.equal(PDF.normalizePhone(input),expected,"phone normalizes before persistence: "+input);
 assert.equal(PDF.contactProjection({email:"user@example.net",phone:input}).phone,expected,
  "PDF must use the same normalization as the profile form");
}
assert.equal(PDF.normalizePhone(""),"","phone is optional");
assert.equal(PDF.formatPhone(""),"","optional phone has no display label");
for(const [raw,expected] of [
 ["+224622095630","+224 622 09 56 30"],
 ["622 09 56 30","+224 622 09 56 30"],
 ["00224622095630","+224 622 09 56 30"],
 ["+221777123456","+221 777 123 456"],
 ["+33612345678","+33 612 345 678"],
 ["+12025550123","+1 202 555 01 23"]
]){
 assert.equal(PDF.formatPhone(raw),expected,"group for display, never for DB: "+raw);
 assert.equal(PDF.normalizePhone(PDF.formatPhone(raw)),PDF.normalizePhone(raw),
  "display value must round-trip to the stored compact format");
}
assert.throws(()=>PDF.formatPhone("+1"),/Téléphone/);
for(const phone of ["+1","abc","+2246220956301234567","6220956301",
 "224622095630","++224622095630"]){
 assert.throws(()=>PDF.normalizePhone(phone),/indicatif|6 à 15|Téléphone/i,
  "invalid or ambiguous phone must be rejected: "+phone);
}
const schemaSql=fs.readFileSync("travel/supabase/schema.sql","utf8");
const migrationSql=fs.readFileSync("travel/supabase/migrations/20261031120000_optional_profile_contacts.sql","utf8");
const sqlPattern="phone ~ '^"+String.fromCharCode(92)+"+[0-9]{6,15}"+String.fromCharCode(36)+"'";
for(const [file,sql] of [["schema",schemaSql],["migration",migrationSql]]){
 assert.ok(sql.includes(sqlPattern),file+" must enforce canonical E.164 6-15 digits");
 assert.ok(!sql.includes("{1,29}"),file+" must not accept 1-digit phone numbers");
}
assert.deepEqual(PDF.contactProjection({
 email:"f@example.net",phone:"+224612345678",postalAddress:"Labé",
 passport:"SECRET_PASSPORT",birth_date:"SECRET_DOB",auth_metadata:"SECRET_META"
}),{email:"f@example.net",phone:"+224612345678",postalAddress:"Labé"});
assert.throws(()=>PDF.contactProjection({email:"x@example.net",phone:"622 22",postalAddress:"Labé"}),/Téléphone/);
assert.throws(()=>PDF.contactProjection({email:"x@example.net",phone:"+224123",postalAddress:"x".repeat(301)}),/Adresse/);
assert.throws(()=>PDF.contactProjection({email:"none",phone:"",postalAddress:""}),/E-mail/);

const schema=fs.readFileSync("travel/supabase/schema.sql","utf8");
const view=schema.match(/create view public\.travel_history_pdf[\s\S]*?;/)?.[0];
assert.ok(view,"The dedicated security-invoker PDF view is mandatory");
assert.match(view,/security_invoker\s*=\s*true/);
assert.match(view,/where not is_domestic and not deleting/);
assert.match(view,/from public\.trips/);
assert.ok(!/\b(note|activities|media|storage_path|cover_media_id)\b/.test(view),
 "PDF view exposes a private column");

const app=fs.readFileSync("travel/index.html","utf8");
const inline=app.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline,"Missing inline app");
new vm.Script(inline,{filename:"travel/index.html"});
new vm.Script(fs.readFileSync("travel/factual-pdf.js","utf8"));
assert.ok(app.includes('<script src="./countries.js"></script>'),
 "Shared country names must load before the app and PDF");
assert.ok(app.indexOf('src="./countries.js"')<app.indexOf('src="./factual-pdf.js"'),
 "Shared country names must load before factual-pdf.js");
assert.ok(app.includes("const COUNTRY_NAMES=window.BEAM_COUNTRIES.NAMES"),
 "Journal should use the same dictionary as PDF");
assert.ok(!app.includes('const COUNTRY_NAMES={'),
 "No duplicate country dictionary in the app");
assert.ok(app.includes('id="travelerNameForm"') && app.includes('maxlength="80"'),
 "Accessible traveler-name form missing");
assert.match(inline,/\.select\("country_of_residence,display_name,deleting"\)/,
 "Journal must load display_name from the user's profile");
assert.match(inline,/\.update\(\{display_name:name,phone:phone\|\|null,postal_address:address\|\|null,country_of_residence:residence\}\)/,
 "All profile fields must be saved together once");
assert.match(inline,/includeContacts\?"display_name,deleting,phone,postal_address":"display_name,deleting"/,
 "PDF must only fetch extra contacts when opted in");
assert.ok(inline.includes("if(!profile.display_name?.trim()){requestTravelerName();return}"),
 "Empty profile name must block PDF and request a name");
assert.match(inline,/window\.BEAM_TRAVEL_PDF\.render\(tab\.document,data,\{/,
 "Profile and opt-in data must be passed to factual PDF");
assert.match(inline,/displayName:name,generatedAt,includeContacts,contacts/);
assert.match(inline,/S\.auth\.getUser\(\)/, "Auth must verify email at opt-in time");
assert.match(inline,/freshUser\.id!==uid/, "Auth account ownership must be checked");
assert.match(inline,/"#includePdfContacts"\)\.checked=false/, "consent checkbox must reset");
assert.match(app,/id="accountEmail"[^>]*readonly/, "Auth email display must be read-only");
assert.match(app,/id="contactPhone"/);
assert.match(app,/id="contactPostalAddress"/);
assert.match(inline,/\.update\(\{display_name:name,phone:phone\|\|null,postal_address:address\|\|null,country_of_residence:residence\}\)/,
 "profile update must target exactly the four approved columns");
assert.ok(app.includes('<script src="./factual-pdf.js"></script>') &&
 app.includes('<script src="./factual-pdf-file.js"></script>'),
 "PDF renderer and local share writer must both load");
assert.ok(app.indexOf('src="./factual-pdf.js"')<app.indexOf('src="./factual-pdf-file.js"'),
 "Local file writer depends on factual renderer");
assert.ok(inline.includes('window.BEAM_TRAVEL_PDF.fetchRows(S,uid)'),
 "PDF button must query the view, never the editable trips array");
assert.ok(!inline.includes('$("#pdf").onclick=()=>window.print()'),
 "Printing the entire app would disclose private notes and photos");
assert.ok(inline.indexOf('window.open("","_blank")') <
 inline.indexOf("await window.BEAM_TRAVEL_PDF.fetchRows"),
 "Mobile preview tab must open during the click, not after an await");

const calls=[];
const fakeClient={
 from(name){
  calls.push(["table",name]);
  return {
   select(fields){calls.push(["select",fields]);return this},
   eq(field,value){calls.push(["eq",field,value]);return this},
   order(field,opts){calls.push(["order",field,opts.ascending]);return {data:[],error:null}}
  };
 }
};
PDF.fetchRows(fakeClient,"owner-id");
assert.deepEqual(calls,[
 ["table","travel_history_pdf"],
 ["select","country_code,cities,entry_date,exit_date,duration_days,purpose"],
 ["eq","user_id","owner-id"],
 ["order","entry_date",false]
]);

const secret="SECRET_PRIVATE_NOTE_74381";
const activitySecret="SECRET_ACTIVITY_19623";
const mediaSecret="SECRET_PRIVATE_PHOTO_21451";
const evilCity='<img src=x onerror="alert(1)">';
const fixtures=[{
 user_id:"owner-id",country_code:"FR",cities:["Paris",evilCity],
 entry_date:"2026-06-20",exit_date:"2026-06-30",duration_days:11,purpose:"tourisme",
 note:secret,activities:[{title:activitySecret}],
 storage_path:mediaSecret,cover_media_id:mediaSecret,is_domestic:true,deleting:true
}];
assert.deepEqual(PDF.factualRows(fixtures),[{
 country:"France",code:"FR",cities:"Paris, "+evilCity,
 entry:"20/06/2026",exit:"30/06/2026",duration:"11 jours",purpose:"Tourisme"
}]);
assert.deepEqual(Object.keys(PDF.factualRows(fixtures)[0]),[
 "country","code","cities","entry","exit","duration","purpose"
]);
assert.equal(PDF.factualRows([{country_code:"GN",cities:[],entry_date:"invalid",
 exit_date:"2026-02-30",duration_days:-1,purpose:"arbitrary"}])[0].exit,"—");

class Node{
 constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();
   this.children=[];this.attributes={};this._text="";this.listeners={};
   this.className="";this.disabled=false;}
 set textContent(value){this.children=[];this._text=String(value)}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join("")}
 appendChild(node){this.children.push(node);return node}
 replaceChildren(...nodes){this._text="";this.children=[...nodes]}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(event,fn){this.listeners[event]=fn}
}
class Document{
 constructor(){this.head=new Node(this,"head");this.body=new Node(this,"body");
  this.documentElement={lang:""};this.prints=0;this.defaultView={print:()=>{this.prints++}};}
 createElement(tag){return new Node(this,tag)}
}
function nodes(root){return [root,...root.children.flatMap(nodes)]}
const document=new Document();
const generatedAt=new Date(2026,9,30,12,0,0);
const travelerName="  Fatou  <img src=x onerror=alert(1)>   Diallo  ";
const cleanName=PDF.displayName(travelerName);
assert.equal(cleanName,"Fatou <img src=x onerror=alert(1)> Diallo");
assert.equal(PDF.generatedDate(generatedAt),"30 octobre 2026");
assert.throws(()=>PDF.displayName("   "),/nom du voyageur/);
assert.throws(()=>PDF.displayName("x".repeat(81)),/80 caractères/);
assert.throws(()=>PDF.generatedDate(new Date("invalid")) ,/Date de génération/);
const denied=new Document();
assert.throws(()=>PDF.render(denied,fixtures,{displayName:"",generatedAt}),/nom du voyageur/);
assert.equal(denied.body.children.length,0,"No anonymous PDF may be rendered");
assert.equal(PDF.render(document,fixtures,{displayName:travelerName,generatedAt}),1);
const all=[...nodes(document.head),...nodes(document.body)];
const undisclosed="private.person@example.net";
const off=new Document();
assert.equal(PDF.render(off,fixtures,{
 displayName:"Fatou Diallo",generatedAt,includeContacts:false,
 contacts:{email:undisclosed,phone:"+224612345678",postalAddress:"PRIVATE_ADDRESS_991",
  passport:"SECRET_PASSPORT_123"}
}),1);
assert.ok(!off.body.textContent.includes(undisclosed));
assert.ok(!off.body.textContent.includes("+224612345678"));
assert.ok(!off.body.textContent.includes("PRIVATE_ADDRESS_991"));
assert.ok(!off.body.textContent.includes("Coordonnées déclarées"));
const opted=new Document();
assert.equal(PDF.render(opted,fixtures,{
 displayName:"Fatou Diallo",generatedAt,includeContacts:true,
 contacts:{email:undisclosed,phone:"+224612345678",
  postalAddress:"Conakry, Guinée",passport:"SECRET_PASSPORT_123"}
}),1);
assert.match(opted.body.textContent,/Coordonnées déclarées/);
assert.match(opted.body.textContent,/private\.person@example\.net/);
assert.match(opted.body.textContent,/\+224 612 34 56 78/);
assert.ok(!opted.body.textContent.includes("+224612345678"),
 "HTML PDF must show a grouped phone, not the compact database value");
assert.match(opted.body.textContent,/Conakry, Guinée/);
assert.ok(!opted.body.textContent.includes("SECRET_PASSPORT_123"));
assert.equal(document.documentElement.lang,"fr");
assert.equal(document.head.textContent.includes("BEAM"),false,"PDF title must be neutral");
assert.equal(document.body.textContent.includes("BEAM"),false,"PDF HTML must be neutral");
assert.equal(all.filter(x=>x.tagName==="IMG").length,0,"No private photos in PDF");
assert.equal(all.filter(x=>x.tagName==="SCRIPT").length,0);
assert.equal(all.filter(x=>x.tagName==="A").length,0);
assert.ok(!all.some(x=>x.attributes.src||x.attributes.href),"No remote URLs");
const printedText=document.body.textContent;
for(const token of [secret,activitySecret,mediaSecret,"SECRET_", "owner-id"]){
 assert.ok(!printedText.includes(token),"PDF leaked "+token);
}
assert.match(printedText,/Fatou <img src=x onerror=alert\(1\)> Diallo/);
assert.match(printedText,/30 octobre 2026/);
assert.equal(all.filter(x=>x.tagName==="IMG").length,0,"Traveler name must stay text, never markup");
assert.match(printedText,/Paris/);
assert.match(printedText,/Tourisme/);
assert.match(printedText,/20\/06\/2026/);
assert.match(printedText,/11 jours/);
assert.match(printedText,/<img src=x onerror="alert\(1\)">/,
 "User text must remain text, not an element");
assert.equal(all.filter(x=>x.tagName==="IMG").length,0,"Untrusted city must not create an image");
assert.ok(!printedText.includes("Historique déclaré")&&!printedText.includes("Voyages internationaux déclarés")&&
 !printedText.includes("Ce document présente uniquement"),"No retired legal/subtitle/footer prose");
assert.equal(all.filter(x=>x.tagName==="FOOTER").length,0,"No PDF footer");
const css=all.find(x=>x.tagName==="STYLE").textContent;
assert.match(css,/@page\{size:A4/);
assert.ok(!css.includes("page-notice")&&!css.includes("declaration"),"No notice CSS");
assert.match(css,/@media print/);
assert.ok(!/url\s*\(/i.test(css),"PDF must not load assets from any domain");
const button=all.find(x=>x.tagName==="BUTTON");
assert.ok(button&&!button.disabled);
assert.equal(document.prints,0,"PDF must not auto-print");
button.listeners.click();
assert.equal(document.prints,1,"Save as PDF is initiated by explicit user action");

const empty=new Document();
assert.equal(PDF.render(empty,[],{displayName:"Fatou Diallo",generatedAt}),0);
assert.match(empty.body.textContent,/Aucun voyage international/);
assert.ok(nodes(empty.body).find(x=>x.tagName==="BUTTON").disabled,
 "Cannot print an empty travel history");

console.log("BEAM factual PDF PASS: view filters, narrow query, no private data or images, disclaimer, isolated print document");
