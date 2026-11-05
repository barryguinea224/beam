// BEAM Travel History — PUBLIC static directory, never user memberships.
// Official airline-only URLs verified 2026-11-05. No airline logos or remote SDK.
(function(root){
"use strict";
const PROGRAMS=Object.freeze([
 {code:"AF",name:"Flying Blue",airline:"Air France",alliance:"SkyTeam",
  signupUrl:"https://login.airfrance.com/enrol/openaccess/flyingblue?locale=fr%2Ffr&source=em",
  aliases:["Air France","AirFrance"]},
 {code:"EK",name:"Emirates Skywards",airline:"Emirates",alliance:"Aucune",
  signupUrl:"https://www.emirates.com/english/skywards/registration/",
  aliases:["Emirates","Emirates Airlines"]},
 {code:"ET",name:"ShebaMiles",airline:"Ethiopian Airlines",alliance:"Star Alliance",
  signupUrl:"https://shebamiles.ethiopianairlines.com/enrolment",
  aliases:["Ethiopian Airlines","Ethiopian"]},
 {code:"SN",name:"Miles & More",airline:"Brussels Airlines",alliance:"Star Alliance",
  signupUrl:"https://www.brusselsairlines.com/xx/en/profile/travel-id",
  aliases:["Brussels Airlines","Brussels"]},
 {code:"TK",name:"Miles&Smiles",airline:"Turkish Airlines",alliance:"Star Alliance",
  signupUrl:"https://www.turkishairlines.com/en-int/miles-and-smiles/",
  aliases:["Turkish Airlines","Turkish"]},
 {code:"AT",name:"Safar Flyer",airline:"Royal Air Maroc",alliance:"oneworld",
  signupUrl:"https://www.royalairmaroc.com/uk-en/register",
  aliases:["Royal Air Maroc","Royal Air Morocco","RAM"]},
 {code:"HC",name:"Teranga",airline:"Air Sénégal",alliance:"Aucune",
  signupUrl:"https://teranga.flyairsenegal.com/hcloyalty/register.jsf",
  signupNote:"Le formulaire officiel indique que le programme n’est pas actuellement actif (vérifié le 05/11/2026).",
  aliases:["Air Senegal","Air Sénégal","AirSenegal"]},
 {code:"KP",name:"ASKY Club",airline:"ASKY Airlines",alliance:"Aucune",
  signupUrl:"https://www.flyasky.com/sn/fr/explore/asky-club/join",
  aliases:["ASKY","ASKY Airlines","Asky Air"]}
].map(x=>Object.freeze({...x,aliases:Object.freeze(x.aliases)})));
const BY_CODE=Object.freeze(Object.fromEntries(PROGRAMS.map(x=>[x.code,x])));
const formatNumber=s=>typeof s==="string"&&/^[A-Za-z0-9-]{4,30}$/.test(s);
const maskNumber=s=>typeof s==="string"?"•••• "+s.slice(-4):"••••";
function normalize(name){
 return String(name??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function airlineProgram(airline,ownedCodes){
 const cleaned=normalize(airline);
 if(!cleaned||!ownedCodes)return null;
 const codes=new Set(ownedCodes);
 return PROGRAMS.find(p=>codes.has(p.code)&&p.aliases.some(alias=>normalize(alias)===cleaned))||null;
}
const api=Object.freeze({PROGRAMS,BY_CODE,formatNumber,maskNumber,airlineProgram,normalize});
if(root)root.BEAM_LOYALTY_PROGRAMS=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
