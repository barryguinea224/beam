// J'y étais — single French agreement rule, shared by all travel screens.
// Product requirement: zero and one use singular; numbers above one use plural.
(function(root){
 "use strict";
 function word(value,singular,plural=String(singular)+"s"){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||!Number.isInteger(n))throw new TypeError("Nombre entier non négatif requis.");
  return n<=1?String(singular):String(plural);
 }
 function count(value,singular,plural=String(singular)+"s"){
  return String(value)+" "+word(value,singular,plural);
 }
 const api=Object.freeze({word,count});
 if(root)root.BEAM_FR_ACCORDS=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
