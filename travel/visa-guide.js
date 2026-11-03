// BEAM BTH -> public visa guide: never send any trip or account data.
// Single fixed, same-origin GET with no cookies, referrer, query or persistence.
(function(root){
 "use strict";
 const INDEX_URL="/visas/fiches.json";
 const MAX_WAIT_MS=1500;
 const epochs=new WeakMap();
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 function validFiches(data){
  return Array.isArray(data)&&data.length<=249&&data.every(item=>{
   if(!item||typeof item!=="object"||Array.isArray(item))return false;
   const keys=Object.keys(item);
   return keys.length===3&&keys.every(key=>["code_pays","slug","destination"].includes(key))&&
    ["code_pays","slug","destination"].every(key=>own(item,key))&&
    typeof item.code_pays==="string"&&/^[A-Z]{2}$/.test(item.code_pays)&&
    typeof item.slug==="string"&&/^[a-z][a-z0-9-]{1,39}$/.test(item.slug)&&
    typeof item.destination==="string"&&item.destination.trim()===item.destination&&
    item.destination.length>0&&item.destination.length<=1300;
  });
 }
 function hide(container){
  if(!container)return;
  epochs.set(container,(epochs.get(container)||0)+1);
  container.hidden=true;
  container.replaceChildren();
 }
 async function showForCountry(countryCode,container,{fetchFn,timeoutMs=MAX_WAIT_MS}={}){
  if(!container)return false;
  hide(container);
  const epoch=epochs.get(container);
  if(typeof countryCode!=="string"||!/^[A-Z]{2}$/.test(countryCode))return false;
  const request=fetchFn||(typeof fetch==="function"?fetch:null);
  if(typeof request!=="function")return false;
  const controller=new AbortController();
  let timer;
  try{
   // Entire operation (including JSON parsing) has a deadline. Fail closed
   // and never show a notification, empty error or outdated trip link.
   const attempt=(async()=>{
    const response=await request(INDEX_URL,{
     method:"GET",mode:"same-origin",credentials:"omit",
     referrerPolicy:"no-referrer",cache:"no-store",redirect:"error",
     signal:controller.signal
    });
    if(!response||!response.ok)return null;
    const data=await response.json();
    if(!validFiches(data))return null;
    return data.find(item=>item.code_pays===countryCode)||null;
   })();
   const expired=new Promise(resolve=>{
    timer=setTimeout(()=>{controller.abort();resolve(null)},timeoutMs);
   });
   const entry=await Promise.race([attempt,expired]);
   if(!entry||epochs.get(container)!==epoch)return false;
   const doc=container.ownerDocument||(typeof document!=="undefined"?document:null);
   if(!doc)return false;
   container.textContent="Préparer un nouveau visa ? Voir la fiche ";
   const anchor=doc.createElement("a");
   anchor.href="/visas/"+entry.slug+"/";
   anchor.textContent=entry.destination;
   container.append(anchor);
   container.hidden=false;
   return true;
  }catch{
   return false; // Offline, 404, invalid JSON, abort and network errors are silent.
  }finally{
   clearTimeout(timer);
  }
 }
 const api=Object.freeze({INDEX_URL,validFiches,hide,showForCountry});
 if(root)root.BEAM_VISA_GUIDE=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
