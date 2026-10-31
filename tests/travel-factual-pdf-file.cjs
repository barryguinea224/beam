"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const FILE=require("../travel/factual-pdf-file.js");
const PDF=require("../travel/factual-pdf.js");

const secret="SECRET_PASSPORT_27485";
const personal="SECRET_MEMORY_91731";
const rows=[
 {country_code:"SN",cities:["Dakar"],entry_date:"2026-05-01",exit_date:"2026-05-02",
  duration_days:2,purpose:"tourisme",passport:secret,note:personal,
  activity:secret,phone:"SECRET_PHONE_ON_TRIP"},
 {country_code:"FR",cities:["Paris"],entry_date:"2026-06-05",exit_date:"2026-06-10",
  duration_days:6,purpose:"affaires",identity_number:secret}
];
const generatedAt=new Date("2026-10-31T12:00:00Z");
// Unsupported scripts must not be silently transformed into question marks.
// The original Chrome print path remains available for those characters.
assert.throws(()=>FILE.make({
 displayName:"اختبار",generatedAt,includeContacts:false
},rows),/Caractères non pris en charge/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"beam-factual-share-"));
try{
 const ordinary=FILE.make({displayName:"Elhadj Barry",generatedAt,
  includeContacts:false,contacts:{email:"private@example.net",
   phone:"+224612345678",postalAddress:"PRIVATE_ADDRESS_332"}},rows);
 const withContacts=FILE.make({displayName:"Elhadj Barry",generatedAt,
  includeContacts:true,contacts:{email:"private@example.net",
   phone:"+224612345678",postalAddress:"Conakry, Guinée",
   passport:"SECRET_PASSPORT_NOT_WHITELISTED"}},rows);
 for(const [tag,buffer] of [["ordinary",ordinary],["opt-in",withContacts]]){
  assert.ok(buffer instanceof Uint8Array);
  assert.ok(buffer.length>700);
  assert.equal(Buffer.from(buffer.subarray(0,8)).toString("latin1"),"%PDF-1.4");
  const file=path.join(dir,tag+".pdf");
  fs.writeFileSync(file,buffer);
  const info=execFileSync("pdfinfo",[file],{encoding:"utf8"});
  assert.match(info,/Pages:\s+1/);
  assert.match(info,/Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/);
  const text=execFileSync("pdftotext",["-layout",file,"-"],{encoding:"utf8"});
  assert.match(text,/Historique de voyages/);
  assert.ok(!text.includes("BEAM"),"PDF file must be unbranded");
  assert.ok(!Buffer.from(buffer).toString("latin1").includes("BEAM"),"PDF bytes must be unbranded");
  assert.match(text,/Dakar/);
  assert.match(text,/Sénégal/);
  assert.match(text,/Paris/);
  assert.ok(!text.includes("Historique déclaré")&&!text.includes("Voyages internationaux déclarés")&&
 !text.includes("Ce document présente uniquement"),"No retired prose in shared PDF");
  assert.ok(!text.includes(secret)&&!text.includes(personal));
  assert.ok(!text.includes("SECRET_PHONE_ON_TRIP"));
  if(tag==="ordinary"){
   assert.ok(!text.includes("Coordonnées déclarées"));
   assert.ok(!text.includes("private@example.net"));
   assert.ok(!text.includes("+224612345678"));
   assert.ok(!text.includes("PRIVATE_ADDRESS_332"));
  }else{
   assert.match(text,/Coordonnées déclarées/);
   assert.match(text,/private@example.net/);
   assert.match(text,/\+224 612 34 56 78/,"shared A4 PDF must show grouped phone");
   assert.ok(!text.includes("+224612345678"),"shared PDF must not print compact DB phone");
   assert.match(text,/Conakry, Guinée/);
   assert.ok(!text.includes("SECRET_PASSPORT_NOT_WHITELISTED"));
  }
 }
 // Long foreign history must split into valid numbered A4 pages.
 const long=Array.from({length:120},(_,i)=>({...rows[0],cities:["Dakar",String(i)]}));
 const multi=FILE.make({displayName:"Fatou Diallo",generatedAt},long);
 const file=path.join(dir,"multipage.pdf");
 fs.writeFileSync(file,multi);
 const info=execFileSync("pdfinfo",[file],{encoding:"utf8"});
 assert.ok(Number(info.match(/^Pages:\s+(\d+)/m)?.[1])>=3);
 const text=execFileSync("pdftotext",["-layout",file,"-"],{encoding:"utf8"});
 assert.ok(text.includes("Dakar"));
 assert.ok(!text.includes("BEAM"));
 assert.ok(!text.includes(secret));
 assert.deepEqual(PDF.CONTACT_FIELDS,["email","phone","postalAddress"]);
 console.log("PASS local factual PDF bytes: A4, contact opt-in isolation, untrusted source fields dropped, 120 rows multipage");
}finally{fs.rmSync(dir,{recursive:true,force:true})}
