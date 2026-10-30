// Référentiel commun au carnet et au PDF factuel. Les deux utilisent exactement les mêmes libellés.
(function(root){
  "use strict";
  const NAMES=Object.freeze({
    CI:"Côte d’Ivoire",FR:"France",GN:"Guinée",GM:"Gambie",GH:"Ghana",
    GW:"Guinée-Bissau",ML:"Mali",MA:"Maroc",MR:"Mauritanie",
    SN:"Sénégal",SL:"Sierra Leone",TR:"Turquie",AE:"Émirats arabes unis",SE:"Suède"
  });
  const api=Object.freeze({NAMES});
  if(root)root.BEAM_COUNTRIES=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
