// J'y étais — presentation-only ordering; never changes server rows or PDF.
(function(root){
 "use strict";
 const KEY="jyetais.trip.sort.v1";
 const DEFAULT="recent";
 const MODES=Object.freeze(["recent","oldest","country"]);
 function normalize(value){return MODES.includes(value)?value:DEFAULT}
 function read(storage){
  try{return normalize(storage?.getItem(KEY))}catch{return DEFAULT}
 }
 function write(storage,mode){
  const value=normalize(mode);
  try{storage?.setItem(KEY,value)}catch{}
  return value;
 }
 function order(rows,mode,countryName=code=>code){
  const sort=normalize(mode);
  return (Array.isArray(rows)?rows:[]).slice().sort((a,b)=>{
   if(sort==="country"){
    const n=String(countryName(a.country_code)||"").localeCompare(String(countryName(b.country_code)||""),"fr",{sensitivity:"base"});
    if(n)return n;
   }
   const direction=sort==="oldest"?1:-1;
   const byEntry=String(a.entry_date||"").localeCompare(String(b.entry_date||""));
   if(byEntry)return byEntry*direction;
   const byExit=String(a.exit_date||"").localeCompare(String(b.exit_date||""));
   if(byExit)return byExit*direction;
   return String(a.id||"").localeCompare(String(b.id||""));
  });
 }
 const api=Object.freeze({KEY,DEFAULT,MODES,normalize,read,write,order});
 if(root)root.BEAM_TRIP_LIST=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
