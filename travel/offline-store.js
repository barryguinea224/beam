// J'y étais — only an explicit, short-lived, allowlisted journey copy.
// No auth, contact, photo, signed link, notes, PDF or Supabase response object in IndexedDB.
(function(root){
"use strict";
const DB_NAME="jyetais-offline",STORE="journeys",KEY="current",OWNER_KEY="jyetais.offline.owner",DISABLED_KEY="jyetais.offline.disabled";
const MAX_AGE_MS=30*24*60*60*1000;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let queue=Promise.resolve();
function serial(work){const job=queue.catch(()=>{}).then(work);queue=job.catch(()=>{});return job}
function owner(){try{return root.localStorage.getItem(OWNER_KEY)||""}catch{return ""}}
function enabled(){try{return root.localStorage.getItem(DISABLED_KEY)!=="1"}catch{return false}}
function safeText(value,max=160){
 if(typeof value!=="string")return "";
 const text=value.trim().slice(0,max);
 return /https?:\/\/|data:|blob:|[\u0000-\u001f]/i.test(text)?"":text;
}
function safeDate(value){return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:""}
function id(value){return typeof value==="string"&&ID.test(value)?value:""}
function cities(list){return Array.isArray(list)?list.slice(0,10).map(x=>safeText(x,100)).filter(Boolean):[]}
function stage(x){
 return {id:id(x?.id),country_code:safeText(x?.country_code,2),cities:cities(x?.cities),
  entry_date:safeDate(x?.entry_date),exit_date:safeDate(x?.exit_date),
  position:Number.isInteger(x?.position)?x.position:0};
}
function journey(x){
 return {id:id(x?.id),country_code:safeText(x?.country_code,2),cities:cities(x?.cities),
  entry_date:safeDate(x?.entry_date),exit_date:safeDate(x?.exit_date),
  duration_days:Number.isInteger(x?.duration_days)?x.duration_days:0,
  purpose:safeText(x?.purpose,40),airline:safeText(x?.airline,160),
  hotel:safeText(x?.hotel,160),companions:safeText(x?.companions,160),
  status:safeText(x?.status,30),is_domestic:x?.is_domestic===true,
  stops:Array.isArray(x?.stops)?x.stops.slice(0,10).map(stage).filter(s=>s.id):[]};
}
function activity(x){
 return {id:id(x?.id),trip_id:id(x?.trip_id),title:safeText(x?.title,160),
  place:safeText(x?.place,160),happened_on:safeDate(x?.happened_on),
  duration_days:Number.isInteger(x?.duration_days)?x.duration_days:1};
}
function project(uid,displayName,trips,activities,now=Date.now()){
 if(!id(uid))throw new Error("Identifiant utilisateur invalide");
 const selected=Array.isArray(trips)?trips.map(journey).filter(t=>t.id):[];
 const allowed=new Set(selected.map(x=>x.id));
 return {key:KEY,ownerId:uid,updatedAt:new Date(now).toISOString(),
  profile:{display_name:safeText(displayName,80)},
  trips:selected,activities:Array.isArray(activities)?
   activities.map(activity).filter(x=>x.id&&allowed.has(x.trip_id)):[]};
}
function fresh(value,now=Date.now()){
 const time=Date.parse(value?.updatedAt||"");
 return Number.isFinite(time)&&time<=now+5*60*1000&&now-time<=MAX_AGE_MS&&
  now-time>=-5*60*1000;
}
function openDB(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(new Error("IndexedDB indisponible"));return}
  const req=root.indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))
   req.result.createObjectStore(STORE,{keyPath:"key"})};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error("Ouverture IndexedDB"));
  req.onblocked=()=>reject(new Error("IndexedDB verrouillée"));
 });
}
async function readRaw(){
 const db=await openDB();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).get(KEY);
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error||new Error("Lecture IndexedDB"));
  tx.onabort=()=>reject(tx.error||new Error("Lecture annulée"));
 })}finally{db.close()}
}
async function put(record){
 const db=await openDB();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put(record);
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||new Error("Écriture IndexedDB"));
  tx.onabort=()=>reject(tx.error||new Error("Écriture annulée"));
 })}finally{db.close()}
}
function dropDB(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){resolve();return}
  const request=root.indexedDB.deleteDatabase(DB_NAME);
  request.onsuccess=()=>resolve();
  request.onerror=()=>reject(request.error||new Error("Suppression IndexedDB"));
  request.onblocked=()=>reject(new Error("Base ouverte dans un autre onglet"));
 });
}
async function clear(){
 try{root.localStorage.removeItem(OWNER_KEY)}catch{}
 return serial(dropDB);
}
async function bind(uid){
 if(!id(uid)){await clear();return false}
 // Make the owner transition atomic with every read/write/delete on this page.
 // An earlier read must NEVER delete the next owner's freshly written cache.
 return serial(async()=>{
  const previous=owner();
  if(previous!==uid){
   try{root.localStorage.removeItem(OWNER_KEY)}catch{}
   await dropDB();
  }
  if(!enabled())return false;
  try{root.localStorage.setItem(OWNER_KEY,uid)}catch{return false}
  return true;
 });
}
async function clearIfOwner(uid){
 return serial(async()=>{
  if(owner()!==uid)return false;
  try{root.localStorage.removeItem(OWNER_KEY)}catch{}
  await dropDB();
  return true;
 });
}
async function readFor(uid){
 if(!enabled()||!id(uid)||owner()!==uid)return null;
 let stored=null;
 try{stored=await serial(readRaw)}catch{return null}
 if(!stored)return null;
 if(stored.ownerId!==uid||!fresh(stored)){
  // A concurrent account switch may already have installed a new owner.
  // A stale read must not erase that new owner's database.
  await clearIfOwner(uid);
  return null;
 }
 if(owner()!==uid||!enabled())return null;
 // Re-project even when an old/corrupted record gained additional properties.
 return project(uid,stored.profile?.display_name,stored.trips,stored.activities,
  Date.parse(stored.updatedAt));
}
async function readLast(){
 const uid=owner();
 return uid&&id(uid)?readFor(uid):null;
}
async function prune(){
 if(!enabled()){await clear();return null}
 return readLast();
}
async function save(uid,displayName,trips,activities){
 if(!enabled()||owner()!==uid)return false;
 const data=project(uid,displayName,trips,activities);
 return serial(async()=>{
  if(!enabled()||owner()!==uid)return false;
  await put(data);
  return enabled()&&owner()===uid;
 });
}
async function setEnabled(value,uid){
 try{if(value)root.localStorage.removeItem(DISABLED_KEY);
  else root.localStorage.setItem(DISABLED_KEY,"1")}catch{}
 if(!value){await clear();return false}
 return bind(uid);
}
const api=Object.freeze({DB_NAME,STORE,OWNER_KEY,DISABLED_KEY,MAX_AGE_MS,
 project,fresh,enabled,owner,bind,readFor,readLast,prune,save,clear,setEnabled});
if(root)root.JYETAIS_OFFLINE=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
