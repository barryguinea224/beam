"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const PDF=require("../travel/factual-pdf.js");

assert.equal(PDF.VIEW,"travel_history_pdf");
assert.deepEqual(PDF.FIELDS,[
 "country_code","cities","entry_date","exit_date","duration_days","purpose"
]);
assert.equal(PDF.DECLARATION,
 "Historique déclaré par l'utilisateur, non délivré par une autorité officielle");

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
assert.ok(app.includes('<script src="./factual-pdf.js"></script>'),
 "PDF module must be loaded locally");
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
assert.equal(PDF.render(document,fixtures),1);
const all=[...nodes(document.head),...nodes(document.body)];
assert.equal(document.documentElement.lang,"fr");
assert.equal(all.filter(x=>x.tagName==="IMG").length,0,"No private photos in PDF");
assert.equal(all.filter(x=>x.tagName==="SCRIPT").length,0);
assert.equal(all.filter(x=>x.tagName==="A").length,0);
assert.ok(!all.some(x=>x.attributes.src||x.attributes.href),"No remote URLs");
const printedText=document.body.textContent;
for(const token of [secret,activitySecret,mediaSecret,"SECRET_", "owner-id"]){
 assert.ok(!printedText.includes(token),"PDF leaked "+token);
}
assert.match(printedText,/Paris/);
assert.match(printedText,/Tourisme/);
assert.match(printedText,/20\/06\/2026/);
assert.match(printedText,/11 jours/);
assert.match(printedText,/<img src=x onerror="alert\(1\)">/,
 "User text must remain text, not an element");
assert.equal(all.filter(x=>x.tagName==="IMG").length,0,"Untrusted city must not create an image");
const declarations=all.filter(x=>x._text===PDF.DECLARATION);
assert.equal(declarations.length,2,"Visible banner and repeating print footer required");
const css=all.find(x=>x.tagName==="STYLE").textContent;
assert.match(css,/@page\{size:A4/);
assert.match(css,/position:fixed/);
assert.match(css,/@media print/);
assert.ok(!/url\s*\(/i.test(css),"PDF must not load assets from any domain");
const button=all.find(x=>x.tagName==="BUTTON");
assert.ok(button&&!button.disabled);
assert.equal(document.prints,0,"PDF must not auto-print");
button.listeners.click();
assert.equal(document.prints,1,"Save as PDF is initiated by explicit user action");

const empty=new Document();
assert.equal(PDF.render(empty,[]),0);
assert.match(empty.body.textContent,/Aucun voyage international/);
assert.ok(nodes(empty.body).find(x=>x.tagName==="BUTTON").disabled,
 "Cannot print an empty travel history");

console.log("BEAM factual PDF PASS: view filters, narrow query, no private data or images, disclaimer, isolated print document");
