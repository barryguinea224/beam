"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const app = fs.readFileSync("travel/index.html", "utf8");
const worker = fs.readFileSync("travel/sw.js", "utf8");
const helper = fs.readFileSync("travel/pwa.js", "utf8");
const offlineBootstrap = fs.readFileSync("travel/offline-bootstrap.js","utf8");
new vm.Script(offlineBootstrap, {filename:"travel/offline-bootstrap.js"});
assert.ok(app.indexOf('<script src="/travel/offline-bootstrap.js"></script>') <
  app.indexOf('https://cdn.jsdelivr.net/npm/@supabase/'), "offline guard must run before CDN");

new vm.Script(worker, {filename:"travel/sw.js"});
new vm.Script(helper, {filename:"travel/pwa.js"});
const inline = [...app.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(const [i,src] of inline.entries())new vm.Script(src,{filename:"travel/index.html#inline-"+i});
assert.match(app, /rel="manifest" href="\/travel\/manifest.webmanifest"/);
assert.match(app, /id="offline"/);
assert.match(app, /Connexion nécessaire pour consulter votre carnet/);
assert.match(app, /window\.BEAM_TRAVEL_PWA\?\.installed\(\)/);
assert.match(app, /await clearPwaSession\(\)/);
assert.match(app, /forgetLocalAuth\(C\.supabaseUrl\)/);

const manifest=JSON.parse(fs.readFileSync("travel/manifest.webmanifest","utf8"));
assert.equal(manifest.name,"BEAM Travel History");
assert.equal(manifest.start_url,"/travel/");
assert.equal(manifest.scope,"/travel/");
assert.equal(manifest.display,"standalone");
for(const [filename,size,purpose] of [
 ["icon-192.png",192,"any"],["icon-512.png",512,"any"],["icon-maskable-512.png",512,"maskable"]
]){
 const icon=manifest.icons.find(x=>x.src.endsWith(filename));
 assert.ok(icon && icon.sizes===size+"x"+size && icon.purpose===purpose,filename+" manifest entry");
 const bytes=fs.readFileSync("travel/icons/"+filename);
 assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.equal(bytes.readUInt32BE(16),size);
 assert.equal(bytes.readUInt32BE(20),size);
}

function fixture(){
 const handlers={};
 const cachesData=new Map();
 const cacheOps=[];
 let networkFails=false, networkCount=0;
 const networkOptions=[];
 const origin="https://example.netlify.app";
 const getCache=name=>{
   if(!cachesData.has(name))cachesData.set(name,new Map());
   const map=cachesData.get(name);
   return {
     addAll:async urls=>{
       cacheOps.push(["addAll",...urls]);
       for(const url of urls)map.set(url,new Response("PUBLIC_STATIC"));
     },
     match:async request=>map.get(typeof request==="string"?request:request.url)||null,
     put:async()=>{throw new Error("Forbidden runtime cache write")}
   };
 };
 const caches={
   keys:async()=>[...cachesData.keys()],
   open:async name=>getCache(name),
   delete:async name=>{cacheOps.push(["delete",name]);return cachesData.delete(name)}
 };
 const self={
   location:{origin},
   registration:{scope:origin+"/travel/"},
   clients:{claim:async()=>{}},
   skipWaiting:async()=>{},
   addEventListener:(name,handler)=>{handlers[name]=handler}
 };
 const context=vm.createContext({
   self,caches,URL,Response,
   fetch:async (request,options)=>{
     networkCount++;
     networkOptions.push(options);
     if(networkFails)throw new Error("OFFLINE");
     return new Response("NETWORK_ONLY");
   }
 });
 vm.runInContext(worker,context);
 return {
   handlers,cachesData,cacheOps,origin,
   setOffline(value){networkFails=value},
   calls:()=>networkCount,
   lastFetchOptions:()=>networkOptions.at(-1),
   async install(){let task;handlers.install({waitUntil:p=>{task=p}});await task},
   async fetch(url,{method="GET",mode="cors"}={}){
     let responded=null;
     const event={request:{url,method,mode},respondWith:p=>{responded=p}};
     handlers.fetch(event);
     return responded?await responded:null;
   },
   async purge(){
     let task,ack;
     handlers.message({data:{type:"BEAM_CLEAR_PUBLIC_SHELL"},ports:[{postMessage:m=>{ack=m}}],
       waitUntil:p=>{task=p}});
     await task;return ack;
   }
 };
}
async function run(){
 const f=fixture();
 await f.install();
 const caches=[...f.cachesData.entries()];
 assert.equal(caches.length,1,"one shell cache");
 const shellUrls=[...caches[0][1].keys()];
 assert.ok(shellUrls.length>30,"audited public map, flags and modules precached");
 for(const url of shellUrls){
   assert.ok(url.startsWith(f.origin+"/travel/"),"never precache remote URLs");
   assert.ok(!/supabase\.co|storage\/v1|token=|signed|\/private\//i.test(url),"private/remote URL precached");
 }
 // Every response capable of containing private data must bypass this SW.
 for(const url of [
   "https://coigbvhxywbmqgacmhzf.supabase.co/rest/v1/trips",
   "https://coigbvhxywbmqgacmhzf.supabase.co/storage/v1/object/sign/media/photo.webp?token=SIGNED",
   f.origin+"/travel/photo-private.webp",
   f.origin+"/travel/index.html?access_token=SECRET",
   f.origin+"/travel/assets/world-map.svg?token=SECRET",
   f.origin+"/travel/assets/flags/unknown.svg",
   "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
 ]){
   assert.equal(await f.fetch(url),null,"private/unknown request must not be intercepted: "+url);
 }
 assert.equal(await f.fetch(f.origin+"/travel/index.html",{method:"POST"}),null);
 // An installed client still holds an older "PUBLIC_STATIC" resource.
 // Online, the updated resource must always win, even without CACHE_NAME bump.
 const before=f.calls();
 const live=await f.fetch(f.origin+"/travel/photo-utils.js");
 assert.equal(await live.text(),"NETWORK_ONLY",
   "online security fix must override older precached public JavaScript");
 assert.equal(f.calls(),before+1,"public resources must fetch the network first");
 assert.equal(f.lastFetchOptions()?.cache,"no-store",
   "browser HTTP cache must not silently substitute an old script");
 const liveStyles=await f.fetch(f.origin+"/travel/visual-cards.css");
 assert.equal(await liveStyles.text(),"NETWORK_ONLY",
   "stylesheets must also use network-first");
 assert.equal(f.lastFetchOptions()?.cache,"no-store");
 const nav=await f.fetch(f.origin+"/travel/",{mode:"navigate"});
 assert.equal(await nav.text(),"NETWORK_ONLY","online document must use network, not cache");
 assert.equal(f.lastFetchOptions()?.cache,"no-store",
   "navigation must also bypass stale browser HTTP cache");
 assert.equal(f.cacheOps.filter(x=>x[0]==="addAll").length,1,
   "fetching newer public code must not write a runtime cache");

 f.setOffline(true);
 const cached=await f.fetch(f.origin+"/travel/photo-utils.js");
 assert.equal(await cached.text(),"PUBLIC_STATIC",
   "preloaded public shell is available only as a network-failure fallback");
 const noShell=await f.fetch(f.origin+"/travel/not-in-cache.js");
 assert.equal(noShell,null,"unknown resources must still bypass the service worker");
 const offline=await f.fetch(f.origin+"/travel/",{mode:"navigate"});
 assert.equal(offline.status,503);
 assert.equal(offline.headers.get("cache-control"),"no-store");
 assert.match(await offline.text(),/Connexion nécessaire pour consulter votre carnet/);
 assert.equal(f.cacheOps.filter(x=>x[0]==="addAll").length,1,
   "no runtime writes even after offline fallback");
 // The cached HTML must NEVER be displayed as the offline navigation.
 const offlineIndex=await f.fetch(f.origin+"/travel/index.html",{mode:"navigate"});
 assert.equal(offlineIndex.status,503);
 assert.match(await offlineIndex.text(),/Connexion nécessaire pour consulter votre carnet/);

 f.cachesData.set("unrelated-site-cache",new Map());
 const ack=await f.purge();
 assert.equal(ack.type,"BEAM_SHELL_CLEARED");
 assert.deepEqual([...f.cachesData.keys()],["unrelated-site-cache"],"logout purge must be scoped");
 // Even after logout erased the shell, the controlling SW can render the offline message.
 const after=await f.fetch(f.origin+"/travel/",{mode:"navigate"});
 assert.equal(after.status,503);

 const local=new Map([
   ["sb-coigbvhxywbmqgacmhzf-auth-token","PRIVATE_SESSION"],
   ["sb-coigbvhxywbmqgacmhzf-auth-token-code-verifier","PKCE"],
   ["other-app-session","KEPT"]
 ]);
 const sessions=new Map([["beam.travel.auth.pending","TEMP_EMAIL"]]);
 const storage=map=>({removeItem:key=>map.delete(key)});
 const events={};
 const window={
   navigator:{},
   location:{pathname:"/travel/"},
   localStorage:storage(local),
   sessionStorage:storage(sessions),
   matchMedia:()=>({matches:true}),
   addEventListener:(name,callback)=>{events[name]=callback},
   document:{querySelector:()=>null}
 };
 vm.runInNewContext(helper,{window,URL,setTimeout,clearTimeout,MessageChannel:undefined});
 const api=window.BEAM_TRAVEL_PWA;
 assert.equal(api.installed(),true);
 api.forgetLocalAuth("https://coigbvhxywbmqgacmhzf.supabase.co");
 assert.deepEqual([...local.keys()],["other-app-session"]);
 assert.equal(sessions.size,0,"pending OTP cleared");
 assert.ok(events.load,"PWA registration is on load");

 console.log("BEAM PWA PASS: manifest/icons, private cache exclusions, offline, cleanup, OTP");
}
run().catch(e=>{console.error(e);process.exitCode=1});
