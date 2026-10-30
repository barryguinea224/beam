// Lightweight, local country picker: native select backed by accent-insensitive search.
(function(root){
  "use strict";
  function attach({searchInput,select,countries}){
    if(!searchInput||!select||!countries)throw new Error("Pays : interface indisponible.");
    function populate(query="",chosen=""){
      const codes=countries.search(query);
      const placeholder=document.createElement("option");
      placeholder.value="";
      placeholder.textContent=query?(codes.length?"Sélectionnez un résultat":"Aucun pays trouvé"):"Choisir un pays";
      const nodes=[placeholder];
      for(const code of codes){
        const opt=document.createElement("option");
        opt.value=code;opt.textContent=countries.NAMES[code];
        nodes.push(opt);
      }
      select.replaceChildren(...nodes);
      if(chosen&&codes.includes(chosen))select.value=chosen;
      else select.value="";
      select.size=query&&codes.length>0?Math.min(codes.length+1,7):1;
      searchInput.setAttribute("aria-expanded",String(select.size>1));
      return codes.length;
    }
    searchInput.addEventListener("input",()=>{
      // Typing does not silently select the first match.
      populate(searchInput.value,"");
    });
    searchInput.addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.preventDefault();setValue("");searchInput.focus()}
      else if(e.key==="ArrowDown"){e.preventDefault();select.focus()}
    });
    select.addEventListener("change",()=>{
      const code=select.value;
      if(!countries.has(code))return;
      searchInput.value=countries.NAMES[code];
      populate(searchInput.value,code);
      select.size=1;
      searchInput.setAttribute("aria-expanded","false");
    });
    function setValue(code){
      searchInput.value=countries.NAMES[code]||"";
      populate("",code);
      select.size=1;
      searchInput.setAttribute("aria-expanded","false");
    }
    setValue("");
    return Object.freeze({setValue,populate});
  }
  const api=Object.freeze({attach});
  if(root)root.BEAM_COUNTRY_PICKER=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
