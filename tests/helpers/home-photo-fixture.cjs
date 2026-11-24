"use strict";
// J'y étais — jeu de données FICTIF avec photos de synthèse (SVG générés ici,
// aucune vraie photo, aucune requête externe). Sert à vérifier la lisibilité
// des textes sur des couvertures très claires, très sombres ou chargées.

// Images de test : dégradés et formes simples, nommées selon le cas éprouvé.
const SCENES={
 dune:'<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a65a"/><stop offset=".55" stop-color="#f6d28b"/><stop offset="1" stop-color="#b8693a"/></linearGradient><rect width="800" height="1000" fill="url(#s)"/><circle cx="560" cy="380" r="90" fill="#fff4d6"/><path d="M0 640 Q220 520 420 640 T800 600 V1000 H0Z" fill="#c9783f"/><path d="M0 760 Q300 660 560 780 T800 760 V1000 H0Z" fill="#8f4c26"/>',
 neige:'<rect width="800" height="1000" fill="#f4f7fa"/><path d="M0 520 L220 300 L380 470 L520 330 L800 560 V1000 H0Z" fill="#ffffff"/><path d="M0 700 Q400 640 800 720 V1000 H0Z" fill="#eef2f5"/><circle cx="640" cy="180" r="60" fill="#fffdf2"/>',
 nuit:'<rect width="800" height="1000" fill="#070b16"/><g fill="#1a2238"><rect x="40" y="560" width="120" height="440"/><rect x="190" y="480" width="90" height="520"/><rect x="310" y="620" width="160" height="380"/><rect x="500" y="420" width="110" height="580"/><rect x="640" y="580" width="140" height="420"/></g><g fill="#f6c86a"><rect x="70" y="600" width="12" height="14"/><rect x="220" y="520" width="12" height="14"/><rect x="530" y="470" width="12" height="14"/><rect x="560" y="540" width="12" height="14"/><rect x="680" y="640" width="12" height="14"/></g>',
 ville:'<rect width="800" height="1000" fill="#d9e4ec"/><g>'+Array.from({length:16},(_,i)=>`<rect x="${i*50}" y="${200+((i*137)%300)}" width="44" height="${800-((i*137)%300)}" fill="${["#1d2b36","#f3efe6","#c84a32","#2f6f8f"][i%4]}"/>`).join("")+'</g>',
 foret:'<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc7c0"/><stop offset="1" stop-color="#2d5a3c"/></linearGradient><rect width="800" height="1000" fill="url(#f)"/>'+Array.from({length:9},(_,i)=>`<path d="M${i*95-20} 1000 L${i*95+40} ${520+(i%3)*60} L${i*95+100} 1000Z" fill="#1f4430"/>`).join(""),
 plage:'<rect width="800" height="560" fill="#8fd3f0"/><rect y="520" width="800" height="160" fill="#2aa6c9"/><rect y="680" width="800" height="320" fill="#f2deb0"/><circle cx="180" cy="160" r="70" fill="#fff8dc"/>'
};
function svg(name){
 const body=SCENES[name]||SCENES.dune;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><defs></defs>${body}</svg>`;
}

const UID="22222222-2222-4222-8222-222222222222";
const id=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,"0")}`;
function trip(n,code,entry,exit,extra={}){
 const days=Math.round((Date.parse(exit)-Date.parse(entry))/864e5)+1;
 return {id:id(n),country_code:code,cities:extra.cities||["Ville fictive"],entry_date:entry,exit_date:exit,
  duration_days:days,purpose:"tourisme",is_domestic:false,deleting:false,note:null,
  title:extra.title??null,cover_media_id:extra.cover??null};
}
function photos(tripId,scene,count,startN){
 return Array.from({length:count},(_,i)=>({id:`bbbbbbbb-bbbb-4bbb-8bbb-${String(startN+i).padStart(12,"0")}`,
  trip_id:tripId,user_id:UID,storage_path:`${UID}/${tripId}/${scene}-${i}.webp`,is_favorite:i===0,
  caption:null,activity_id:null,position:i,width:800,height:1000,created_at:`2025-01-01T00:00:${String(i).padStart(2,"0")}Z`}));
}

// Scénarios : chaque cas du cahier des charges qui touche l'accueil.
function scenarios(){
 const base=[
  trip(1,"MA","2025-10-02","2025-10-12",{title:"Marrakech avec maman",cities:["Marrakech","Essaouira"]}),
  trip(2,"FR","2025-06-10","2025-06-24",{title:"Le printemps à Paris, enfin",cities:["Paris"]}),
  trip(3,"SN","2025-02-01","2025-02-05",{cities:["Dakar"]}),
  trip(4,"CH","2024-12-20","2024-12-30",{title:"Noël dans les Alpes",cities:["Zermatt"]}),
  trip(5,"US","2024-07-01","2024-07-15",{title:"New York de nuit",cities:["New York"]}),
  trip(6,"CI","2024-03-03","2024-03-03",{cities:["Grand-Bassam"]}),
  trip(7,"JP","2023-04-01","2023-04-14",{title:"Un très long titre de voyage pour vérifier",cities:["Tokyo","Kyoto","Osaka","Nara"]}),
  trip(8,"TR","2027-05-10","2027-05-20",{title:"Istanbul, bientôt",cities:["Istanbul"]})
 ];
 const media=[...photos(id(1),"dune",15,1),...photos(id(2),"ville",4,20),...photos(id(4),"neige",3,30),
  ...photos(id(5),"nuit",6,40),...photos(id(7),"foret",2,50)];
 const many=Array.from({length:120},(_,i)=>trip(100+i,["FR","MA","SN","CI","US","JP","DE","CA","BR","TR"][i%10],
  `${2000+Math.floor(i/6)}-0${1+(i%6)}-01`,`${2000+Math.floor(i/6)}-0${1+(i%6)}-1${i%9}`));
 return {
  photos:{rows:base,media,name:"Mariama Diallo"},
  "couverture-claire":{rows:[base[3],...base.slice(5)],media:photos(id(4),"neige",3,30),name:"Mariama Diallo"},
  "couverture-sombre":{rows:[base[4],...base.slice(5)],media:photos(id(5),"nuit",6,40),name:"Mariama Diallo"},
  "couverture-chargee":{rows:[base[1],...base.slice(5)],media:photos(id(2),"ville",4,20),name:"Mariama Diallo"},
  "sans-photo":{rows:base,media:[],name:"Mariama Diallo"},
  "nom-long":{rows:base,media,name:"Elhadj Mamadou Alpha Oumar Diallo Barry de Kankan-Conakry"},
  "cent-voyages":{rows:many,media:[],name:"Mariama Diallo"},
  vide:{rows:[],media:[],name:"Mariama Diallo"}
 };
}

// Faux client Supabase : sérialisé dans la page, il ne contient que des données fictives.
function fakeClient(){
 const data=window.__homeFixture,uid=data.uid;
 const profile={display_name:data.name,country_of_residence:"GN",access_until:"2099-12-31",deleting:false,avatar_id:null,cover_media_id:null};
 function result(table,method,q){
  if(table==="profiles")return {data:profile,error:null};
  if(table==="trips")return {data:data.rows.slice(),error:null};
  if(table==="media"){
   let rows=data.media.slice();
   for(const [k,v] of q.where)rows=rows.filter(r=>r[k]===v);
   if(q.range)rows=rows.slice(q.range[0],q.range[1]+1);
   return {data:rows,error:null};
  }
  return {data:[],error:null};
 }
 window.supabase={createClient(){return{
  auth:{async getSession(){return {data:{session:{user:{id:uid,email:"fiction@example.invalid"}}}}},
   async getUser(){return {data:{user:{id:uid,email:"fiction@example.invalid"}}}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}},
  storage:{from(){return{
   createSignedUrl:async path=>({data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/"+encodeURIComponent(path)+"?token=fictif"},error:null})
  }}},
  from(table){
   const q={where:[]};let method="select";
   const api={select(){return api},eq(k,v){q.where.push([k,v]);return api},order(){return api},limit(){return api},
    range(a,b){q.range=[a,b];return api},insert(){method="insert";return api},update(){method="update";return api},delete(){method="delete";return api},
    single(){return Promise.resolve(result(table,method,q))},maybeSingle(){return Promise.resolve({data:null,error:null})},
    then(ok,fail){return Promise.resolve(result(table,method,q)).then(ok,fail)}};
   return api;
  }
 }}};
}
function vendor(sc){
 return `window.__homeFixture=${JSON.stringify({uid:UID,rows:sc.rows,media:sc.media,name:sc.name})};(${fakeClient.toString()})();`;
}
// Répond aux URL signées fictives avec l'image de synthèse correspondante.
function photoRoute(url){
 const m=decodeURIComponent(url.pathname).match(/\/([a-z]+)-\d+\.webp$/);
 return m?svg(m[1]):null;
}
module.exports={scenarios,vendor,photoRoute,svg,UID};
