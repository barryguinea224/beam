// BEAM Travel History — display-only dashboard filters.
// Never pass filters into the factual PDF query: it has its own audited view.
(function(root){
  "use strict";
  const EMPTY=Object.freeze({country:"",year:"",purpose:"",scope:""});
  const PURPOSES=Object.freeze(["tourisme","affaires","etudes","famille","sante","transit","autre"]);
  function code(value){return typeof value==="string"&&/^[A-Z]{2}$/.test(value)?value:"";}
  function normalize(input){
    const raw=input||{};
    const year=String(raw.year??"");
    return Object.freeze({
      country:code(raw.country),
      year:/^(19|20|21)[0-9]{2}$/.test(year)?year:"",
      purpose:PURPOSES.includes(raw.purpose)?raw.purpose:"",
      scope:raw.scope==="foreign"||raw.scope==="domestic"?raw.scope:""
    });
  }
  function toggleCountry(input,chosen){
    const state=normalize(input);
    const country=code(chosen);
    return normalize({...state,country:country===state.country?"":country});
  }
  function apply(rows,input){
    const state=normalize(input);
    if(!Array.isArray(rows))return [];
    return rows.filter(t=>t&&!t.deleting&&
      (!state.country||t.country_code===state.country)&&
      (!state.year||typeof t.entry_date==="string"&&t.entry_date.slice(0,4)===state.year)&&
      (!state.purpose||t.purpose===state.purpose)&&
      (!state.scope||(state.scope==="domestic" ? t.is_domestic===true:t.is_domestic!==true))
    );
  }
  function options(rows){
    const active=(Array.isArray(rows)?rows:[]).filter(t=>t&&!t.deleting);
    const countries=[...new Set(active.map(t=>code(t.country_code)).filter(Boolean))].sort();
    const years=[...new Set(active.map(t=>String(t.entry_date??"").slice(0,4))
      .filter(y=>/^(19|20|21)[0-9]{2}$/.test(y)))].sort((a,b)=>b.localeCompare(a));
    return Object.freeze({countries,years});
  }
  // Keep the original international-only headline when scope is "all".
  // Other filters still apply first; only explicit "National" changes the
  // headline to domestic journeys. Domestic stays a separate count otherwise.
  function summary(rows,input){
    const active=(Array.isArray(rows)?rows:[]).filter(t=>t&&!t.deleting);
    const state=normalize(input);
    const domestic=active.filter(t=>t.is_domestic===true);
    const eligible=state.scope==="domestic"
      ? domestic : active.filter(t=>t.is_domestic!==true);
    return Object.freeze({
      trips:eligible.length,
      countries:new Set(eligible.map(t=>t.country_code)).size,
      days:eligible.reduce((sum,t)=>sum+(Number.isFinite(Number(t.duration_days))?
        Math.max(0,Number(t.duration_days)):0),0),
      domestic:domestic.length
    });
  }
  const api=Object.freeze({EMPTY,normalize,toggleCountry,apply,options,summary});
  if(root)root.BEAM_DASHBOARD_FILTERS=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
