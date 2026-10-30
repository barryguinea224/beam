// Searchable country select using the local ISO catalogue, no external network.
(function(root){
 "use strict";
 function attach(select,search,{placeholder="Choisir un pays",change}={}){
   if(!select||!search||!root?.BEAM_COUNTRIES)throw new Error("Country selector unavailable");
   const catalog=root.BEAM_COUNTRIES;
   function fill(query,value){
     const codes=catalog.search(query);
     select.replaceChildren();
     const initial=select.ownerDocument.createElement("option");
     initial.value="";initial.textContent=codes.length?placeholder:"Aucun résultat";
     select.appendChild(initial);
     for(const code of codes){
       const option=select.ownerDocument.createElement("option");
       option.value=code;option.textContent=catalog.NAMES[code];select.appendChild(option);
     }
     select.value=catalog.valid(value)&&codes.includes(value)?value:"";
   }
   search.addEventListener("input",()=>fill(search.value,""));
   select.addEventListener("change",()=>{
     if(typeof change==="function")change(select.value);
   });
   function reset(value){
     search.value="";
     fill("",value);
   }
   reset("");
   return Object.freeze({reset,fill});
 }
 const api=Object.freeze({attach});
 if(root)root.BEAM_COUNTRY_PICKER=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
