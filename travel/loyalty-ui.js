// J'y étais · private loyalty numbers. Not loaded in public exports.
(function(root){
"use strict";
const CATALOG=root?.BEAM_LOYALTY_PROGRAMS||(typeof require==="function"?require("./loyalty-programs.js"):null);
const safeDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
function init({supabase,user,isActive,canWrite,onChange}){
 if(!root?.document||!CATALOG)return null;
 const doc=root.document,$=id=>doc.getElementById(id);
 const program=$("loyaltyProgram"),number=$("loyaltyNumber"),tier=$("loyaltyTier"),expiry=$("loyaltyExpiry");
 let rows=[],revision=0,busy=false,editing=null,deleteTarget=null,revealed=new Set(),loaded=false;
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const btn=(label,action)=>{const b=el("button","btn ghost",label);b.type="button";b.addEventListener("click",action);return b};
 const status=text=>{$("loyaltyStatus").textContent=text};
 const enabled=()=>!!supabase&&!!user()?.id&&!!isActive();
 function refresh(){
  const can=enabled()&&canWrite()&&!busy;
  $("loyaltyAdd").disabled=!can||rows.length>=CATALOG.PROGRAMS.length;
  $("loyaltyAdd").classList.toggle("hidden",!can);
  const list=$("loyaltyOwned"),missing=$("loyaltyAvailable");
  list.replaceChildren();missing.replaceChildren();
  if(loaded&&!rows.length)list.append(el("p","mapInfo","Aucun programme enregistré pour le moment."));
  for(const row of rows){
   const p=CATALOG.BY_CODE[row.program_code];if(!p)continue;
   const item=el("div","loyaltyRow"),heading=el("div","loyaltyIdentity");
   heading.append(el("span","loyaltyBadge",p.code));
   const info=el("div","loyaltyIdentityText");
   info.append(el("strong","",p.name),el("small","",p.airline+" · "+p.alliance));
   heading.append(info);item.append(heading);
   const numberText=el("span","loyaltyNumber","Numéro : "+(revealed.has(row.id)?row.member_number:CATALOG.maskNumber(row.member_number)));
   numberText.setAttribute("aria-label",revealed.has(row.id)?"Numéro visible":"Numéro masqué");
   item.append(numberText);
   if(row.tier)item.append(el("small","loyaltyMeta","Statut : "+row.tier));
   if(row.miles_expiry)item.append(el("small","loyaltyMeta","Expiration des miles : "+row.miles_expiry));
   const actions=el("div","loyaltyActions");
   const view=btn(revealed.has(row.id)?"Masquer":"Afficher",()=>{
    if(revealed.has(row.id))revealed.delete(row.id);else revealed.add(row.id);refresh();
   });
   view.setAttribute("aria-pressed",String(revealed.has(row.id)));
   actions.append(view,btn("Copier",async()=>{
    if(!enabled())return;
    try{
     if(!root.navigator?.clipboard?.writeText)throw Error("Clipboard unavailable");
     await root.navigator.clipboard.writeText(row.member_number);
     status("Numéro copié. Pensez à vider le presse-papiers partagé si nécessaire.");
    }catch{status("Copie indisponible sur cet appareil. Utilisez « Afficher » pour relever le numéro.");}
   }));
   const edit=btn("Modifier",()=>openForm(row));edit.disabled=!can;
   const del=btn("Supprimer",()=>confirmDeletion(row));del.disabled=!can;
   actions.append(edit,del);item.append(actions);list.append(item);
  }
  const existing=new Set(rows.map(r=>r.program_code));
  for(const p of CATALOG.PROGRAMS){
   if(existing.has(p.code))continue;
   const card=el("div","loyaltyAvailableRow");
   card.append(el("span","loyaltyBadge",p.code));
   const label=el("span","loyaltyAvailableName",p.name+" · "+p.airline);
   const link=el("a","loyaltySignup","Créer un compte");
   link.href=p.signupUrl;link.target="_blank";link.rel="noopener noreferrer";
   link.setAttribute("aria-label","Créer un compte "+p.name+" sur le site officiel de "+p.airline);
   card.append(label,link);
   if(p.signupNote)card.append(el("small","loyaltyMeta",p.signupNote));
   missing.append(card);
  }
  program.replaceChildren();
  for(const p of CATALOG.PROGRAMS){
   if(editing?.program_code===p.code||!existing.has(p.code)){
    const opt=new Option(p.name+" ("+p.code+")",p.code);
    program.add(opt);
   }
  }
  if(editing)program.value=editing.program_code;
  else if(!program.options.length)$("loyaltyForm").classList.add("hidden");
  $("loyaltySubmit").disabled=!can;
 }
 function clear(){
  revision++;rows=[];editing=null;deleteTarget=null;revealed.clear();loaded=false;busy=false;
  $("loyaltyForm").classList.add("hidden");$("loyaltyDeleteConfirm").classList.add("hidden");
  $("loyaltyForm").reset();refresh();status("Ouvrez Mon compte pour consulter vos programmes.");
  onChange?.();
 }
 async function reload(){
  if(!enabled()){clear();return;}
  const seq=++revision,uid=user().id;
  status("Chargement des programmes…");
  const {data,error}=await supabase.from("loyalty_memberships")
   .select("id,program_code,member_number,tier,miles_expiry").eq("user_id",uid).order("created_at");
  if(seq!==revision||!enabled()||user()?.id!==uid)return;
  if(error){
   rows=[];loaded=false;refresh();
   status("Programmes indisponibles. La migration SQL doit être installée avant l'utilisation.");
   onChange?.();return;
  }
  rows=(data||[]).filter(r=>!!CATALOG.BY_CODE[r.program_code]&&CATALOG.formatNumber(r.member_number));
  loaded=true;revealed.clear();editing=null;refresh();
  status(rows.length+" programme"+(rows.length===1?"":"s")+" enregistré"+(rows.length===1?"":"s")+".");
  onChange?.();
 }
 function openForm(row=null){
  if(!enabled()||!canWrite()||busy)return;
  editing=row;
  $("loyaltyDeleteConfirm").classList.add("hidden");
  $("loyaltyForm").classList.remove("hidden");refresh();
  $("loyaltyFormTitle").textContent=row?"Modifier mon programme":"Ajouter un programme";
  program.disabled=!!row;
  number.value=row?.member_number||"";tier.value=row?.tier||"";expiry.value=row?.miles_expiry||"";
  $("loyaltyFormMessage").textContent="";
  (row?number:program).focus();
 }
 function cancelForm(){
  editing=null;number.value="";tier.value="";expiry.value="";
  program.disabled=false;$("loyaltyForm").classList.add("hidden");refresh();
 }
 async function save(event){
  event.preventDefault();
  if(!enabled()||!canWrite()||busy)return;
  const code=editing?.program_code||program.value,value=number.value.trim();
  if(!CATALOG.BY_CODE[code]||!CATALOG.formatNumber(value)){
   $("loyaltyFormMessage").textContent="Numéro : 4 à 30 lettres, chiffres ou tirets, sans espace.";return;
  }
  const info=tier.value.trim();
  if(info.length>40){$("loyaltyFormMessage").textContent="Le statut doit faire au maximum 40 caractères.";return;}
  const payload={member_number:value,tier:info||null,miles_expiry:expiry.value||null};
  if(payload.miles_expiry&&!safeDate(payload.miles_expiry)){
   $("loyaltyFormMessage").textContent="Date invalide.";return;
  }
  const uid=user().id,editingId=editing?.id;
  busy=true;refresh();$("loyaltyFormMessage").textContent="Enregistrement…";
  try{
   let query=editingId?
    supabase.from("loyalty_memberships").update(payload).eq("id",editingId).eq("user_id",uid):
    supabase.from("loyalty_memberships").insert({...payload,program_code:code});
   const {error}=await query;
   if(error)throw error;
   if(user()?.id!==uid||!enabled())return;
   cancelForm();await reload();status("Programme enregistré.");
  }catch{
   $("loyaltyFormMessage").textContent="Enregistrement impossible. Vérifiez le numéro, l'accès et l'unicité du programme.";
  }finally{busy=false;refresh();}
 }
 function confirmDeletion(row){
  if(!enabled()||!canWrite()||busy)return;
  cancelForm();deleteTarget=row;
  $("loyaltyDeleteText").textContent="Supprimer "+CATALOG.BY_CODE[row.program_code].name+" de votre carnet ?";
  $("loyaltyDeleteConfirm").classList.remove("hidden");$("loyaltyConfirmDelete").focus();
 }
 async function remove(){
  if(!deleteTarget||!enabled()||!canWrite()||busy)return;
  const uid=user().id,row=deleteTarget;
  busy=true;refresh();
  try{
   const {error}=await supabase.from("loyalty_memberships").delete().eq("id",row.id).eq("user_id",uid);
   if(error)throw error;
   deleteTarget=null;$("loyaltyDeleteConfirm").classList.add("hidden");
   await reload();status("Programme supprimé.");
  }catch{status("Suppression impossible. Vérifiez votre accès.");}
  finally{busy=false;refresh();}
 }
 function hintFor(airline){
  if(!enabled()||!loaded)return "";
  const p=CATALOG.airlineProgram(airline,rows.map(r=>r.program_code));
  return p?"Pensez à donner votre numéro "+p.name+" à la réservation.":"";
 }
 $("loyaltyAdd").addEventListener("click",()=>openForm());
 $("loyaltyForm").addEventListener("submit",save);
 $("loyaltyCancel").addEventListener("click",cancelForm);
 $("loyaltyConfirmDelete").addEventListener("click",remove);
 $("loyaltyCancelDelete").addEventListener("click",()=>{deleteTarget=null;$("loyaltyDeleteConfirm").classList.add("hidden")});
 refresh();
 return Object.freeze({reload,clear,refresh,hintFor});
}
const api=Object.freeze({init});
if(root)root.BEAM_LOYALTY_UI=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
