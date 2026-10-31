"use strict";
// The real inline application photo state, exercised without staging credentials.
// Delayed signed URLs must never gate the quota or the file input.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("travel/index.html","utf8");
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("const PHOTO=window.BEAM_PHOTO;"));
assert.ok(script,"real photo handler must exist");new vm.Script(script);
const start=script.indexOf("const PHOTO=window.BEAM_PHOTO;");
const end=script.indexOf("let deletingAccount=false;",start);
assert.ok(end>start,"full photo logic must be isolated without synthetic replacements");
assert.match(html,/id="photoLoadStatus"[^>]*[\s\S]*?photoSpinner/);
assert.match(html,/id="photoRetry"[^>]*>Réessayer<\/button>/);
const source=script.slice(start,end);
assert.match(source,/\.eq\("user_id",user\.id\)\.eq\("trip_id",tripId\)/);
assert.match(source,/PHOTO\.validateSelection\(files,existingMedia\.length\+pendingPhotos\.length\)/);
function deferred(){
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
 return {promise,resolve,reject};
}
function node(initiallyHidden=false){
 const state=new Set(initiallyHidden?["hidden"]:[]);
 return {value:"",disabled:false,textContent:"",innerHTML:"",files:[],
  classList:{
   add(k){state.add(k)},remove(k){state.delete(k)},contains:k=>state.has(k),
   toggle(k,force){const on=force===undefined?!state.has(k):!!force;if(on)state.add(k);else state.delete(k);return on}
  },
  replaceChildren(){this.innerHTML=""},
  querySelectorAll(){return []},
  reset(){}
 };
}
async function main(){
 const selectors=["#photos","#photoLoadStatus","#photoUsage","#photoRetry","#photoMessage",
  "#photoGallery","#saveTrip","#close","#modal","#tripForm","#tripMsg","#tripTitle","#appMsg"];
 const els=Object.fromEntries(selectors.map(s=>[s,node(s==="#photoLoadStatus"||s==="#photoRetry"||s==="#photoMessage")]));
 els["#modal"].classList.add("open");
 const mediaRequests=[],signedRequests=[];
 const db={
  from(table){
   assert.equal(table,"media");
   return {select(fields){
    assert.equal(fields,"id,storage_path,created_at");
    return {eq(){return this},order(){const d=deferred();mediaRequests.push(d);return d.promise}}
   }};
  },
  storage:{from(bucket){assert.equal(bucket,"media");return {
   createSignedUrl(path,seconds){assert.equal(seconds,300);const d=deferred();signedRequests.push({path,...d});return d.promise}
  }}}
 };
 const ctx=vm.createContext({
  window:{BEAM_PHOTO:{MAX_PHOTOS:10,validateSelection:async()=>[]}},
  S:db,user:{id:"owner-1"},accountState:"active",editingTripId:"trip-1",
  trips:[{id:"trip-1",cover_media_id:null}],esc:s=>String(s),
  $:selector=>{assert.ok(els[selector],"Missing selector "+selector);return els[selector]},
  URL:{createObjectURL(){return "blob:local"},revokeObjectURL(){}},
  crypto:{randomUUID(){return "id"}},render(){},load:async()=>{},
  setTimeout(){},FormData:class{},console
 });
 vm.runInContext(source,ctx);
 vm.runInContext('resetPhotoUI("trip-1")',ctx);
 assert.equal(els["#photos"].disabled,true,"picker stays disabled until the media LIST arrives");
 assert.equal(els["#photoUsage"].classList.contains("hidden"),true,"no misleading zero saved during load");
 assert.equal(els["#photoLoadStatus"].classList.contains("hidden"),false,"visible loading spinner near disabled file picker");
 const first=vm.runInContext('refreshMedia("trip-1")',ctx);
 assert.equal(mediaRequests.length,1);
 const rows=[{id:"pic-1",storage_path:"owner-1/trip-1/1.webp",created_at:"2026-10-31"},
  {id:"pic-2",storage_path:"owner-1/trip-1/2.webp",created_at:"2026-10-31"}];
 mediaRequests[0].resolve({data:rows,error:null});
 await first;
 assert.equal(signedRequests.length,2,"thumbnail URLs are still requested concurrently");
 assert.equal(els["#photos"].disabled,false,"picker enabled before any thumbnail signature resolves");
 assert.equal(els["#photoUsage"].textContent,"2 enregistrées + 0 en attente / 10 · 8 places disponibles");
 assert.equal(els["#photoUsage"].classList.contains("hidden"),false);
 assert.equal(els["#photoLoadStatus"].classList.contains("hidden"),true);
 assert.equal((els["#photoGallery"].innerHTML.match(/Chargement de la miniature…/g)||[]).length,2);
 assert.equal(vm.runInContext('existingMedia.every(row=>!row.url)',ctx),true,"all thumbnails are still pending");
 signedRequests[0].resolve({data:{signedUrl:"https://example.test/photo1"},error:null});
 await Promise.resolve();await Promise.resolve();
 assert.equal(vm.runInContext('existingMedia[0].url',ctx),"https://example.test/photo1");
 assert.equal(vm.runInContext('existingMedia[1].url',ctx),"","second thumbnail still pending");
 assert.equal(els["#photos"].disabled,false,"a slow thumbnail cannot re-disable picker");
 // New edit: media-list rejects, then the visible Retry button reloads that list.
 vm.runInContext('editingTripId="trip-2";resetPhotoUI("trip-2")',ctx);
 const failed=vm.runInContext('refreshMedia("trip-2")',ctx);
 mediaRequests[1].resolve({data:null,error:{message:"network"}});
 await failed;
 assert.equal(els["#photos"].disabled,true);
 assert.equal(els["#photoUsage"].classList.contains("hidden"),true,"no invented quota after failure");
 assert.equal(els["#photoLoadStatus"].classList.contains("hidden"),true);
 assert.match(els["#photoMessage"].textContent,/Impossible de charger la liste de vos photos/);
 assert.equal(els["#photoRetry"].classList.contains("hidden"),false,"retry is visible after failure");
 const retried=els["#photoRetry"].onclick();
 assert.equal(els["#photoLoadStatus"].classList.contains("hidden"),false,"retry restores loading state");
 mediaRequests[2].resolve({data:[rows[0]],error:null});
 await retried;
 assert.equal(els["#photoRetry"].classList.contains("hidden"),true);
 assert.equal(els["#photos"].disabled,false);
 assert.match(els["#photoUsage"].textContent,/1 enregistrée \+ 0 en attente \/ 10 · 9 places disponibles/);
 assert.equal(signedRequests.length,3,"retry signs only the returned media");
 // Server-enforced max 10 is retained by the existing quota tests; client must enforce zero spare slots.
 vm.runInContext('editingTripId="trip-3";resetPhotoUI("trip-3")',ctx);
 const full=vm.runInContext('refreshMedia("trip-3")',ctx);
 mediaRequests[3].resolve({data:Array.from({length:10},(_,i)=>({id:"q-"+i,storage_path:"q/"+i})),error:null});
 await full;
 assert.equal(els["#photos"].disabled,true,"ten persisted photos exhaust the client-side quota");
 assert.match(els["#photoUsage"].textContent,/0 place disponible/);
 console.log("PASS photo list-first: slow signatures, exact quota before thumbnails, placeholders, error/retry, 10-photo cap");
}
main().catch(err=>{console.error(err);process.exitCode=1});
