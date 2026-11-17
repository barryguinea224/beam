// Local ISO 3166-1 alpha-2 → geographic continent catalogue. No network, no user data.
// Transcontinental countries have one stable classification (e.g. TR → Asie, RU → Europe).
(function(root){
 "use strict";
 const GROUPS=Object.freeze({
  Afrique:"AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
  Europe:"AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA",
  Asie:"AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
  "Amérique du Nord":"AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
  "Amérique du Sud":"AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  "Océanie":"AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS"
 });
 const BY_CODE=Object.freeze(Object.fromEntries(Object.entries(GROUPS).flatMap(([region,codes])=>
  codes.split(" ").map(code=>[code,region]))));
 const LIFE=root?.BEAM_TRIP_LIFECYCLE||(typeof require==="function"?require("./trip-lifecycle.js"):null);
 function fromCodes(codes){
  return new Set((Array.isArray(codes)?codes:[]).map(code=>BY_CODE[code]).filter(Boolean)).size;
 }
 function count(trips,day=LIFE.today()){
  const seen=new Set();
  for(const trip of Array.isArray(trips)?trips:[]){
   if(!trip||trip.deleting)continue;
   for(const code of LIFE.visitedCodes(trip,day))seen.add(code);
  }
  return fromCodes([...seen]);
 }
 const api=Object.freeze({GROUPS,BY_CODE,fromCodes,count});
 if(root)root.BEAM_CONTINENTS=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
