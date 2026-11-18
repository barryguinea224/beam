// J'y étais · P0 album, pure owner-scoped rendering helpers.
// No private URL is stored here. Images are signed on demand in index.html.
(function(root){
"use strict";
const FR=root?.BEAM_FR_ACCORDS||(typeof require==="function"?require("./fr-accords.js"):null);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
const title=(value,country)=>{
 const v=typeof value==="string"?value.trim():"";
 return v&&v.length<=60?v:String(country||"Voyage");
};
function featured(activities,photos){
 const byActivity=new Map();
 for(const photo of Array.isArray(photos)?photos:[]){
  if(photo?.activity_id&&!byActivity.has(photo.activity_id))byActivity.set(photo.activity_id,photo);
 }
 return (Array.isArray(activities)?activities:[])
  .filter(a=>a?.id&&byActivity.has(a.id))
  .map(a=>({activity:a,photo:byActivity.get(a.id)}))
  .sort((a,b)=>String(a.activity.happened_on||"9999-12-31").localeCompare(
    String(b.activity.happened_on||"9999-12-31"))||
    String(a.activity.id).localeCompare(String(b.activity.id)))
  .slice(0,5);
}
function date(iso){
 if(typeof iso!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return "";
 const d=new Date(iso+"T12:00:00Z");
 return Number.isNaN(+d)?"":new Intl.DateTimeFormat("fr-FR",
  {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(d);
}
function featuredHTML(activities,photos){
 return featured(activities,photos).map(({activity,photo})=>
  '<article class="albumMoment" data-activity-id="'+esc(activity.id)+'">'+
  '<button type="button" class="albumMomentPhoto albumMomentPhoto-'+orientation(photo)+' photoTap" data-id="'+esc(photo.id)+
   '" data-album-photo-id="'+esc(photo.id)+'" aria-label="Voir la photo du moment '+esc(activity.title)+'">'+
   '<span class="albumPhotoWait" aria-hidden="true"></span></button>'+
  '<div class="albumMomentStory">'+
   (activity.happened_on?'<time datetime="'+esc(activity.happened_on)+'">'+esc(date(activity.happened_on))+'</time>':"")+
   '<h4>'+esc(activity.title||"Souvenir")+'</h4>'+
   (activity.place?'<p>'+esc(activity.place)+'</p>':"")+
  '</div></article>').join("");
}
function orientation(row){
 const w=Number(row?.width),h=Number(row?.height);
 return w>0&&h>0?(h>w*1.15?"portrait":w>h*1.3?"landscape":"square"):"square";
}
function mosaicHTML(photos,canEdit=false){
 return (Array.isArray(photos)?photos:[]).map(row=>{
  const shape=orientation(row);
  return '<figure class="albumTile albumTile-'+shape+'" data-media-id="'+esc(row.id)+'">'+
   '<button type="button" class="albumTilePhoto photoTap" data-id="'+esc(row.id)+
    '" data-album-photo-id="'+esc(row.id)+'" aria-label="Voir cette photo'+
    (canEdit?' et choisir comme couverture':'')+'">'+
     '<span class="albumPhotoWait" aria-hidden="true"></span></button>'+
    (canEdit?'<figcaption>Toucher pour les options</figcaption>':"")+
  '</figure>';
 }).join("");
}
function statsHTML(trip,photoCount,offline=false){
 const names=[...(Array.isArray(trip?.cities)?trip.cities:[]),
  ...(Array.isArray(trip?.stops)?trip.stops.flatMap(s=>Array.isArray(s.cities)?s.cities:[]):[])];
 const cities=new Set(names.map(s=>String(s||"").trim().toLocaleLowerCase("fr-FR")).filter(Boolean)).size;
 const count=Number(trip?.duration_days)||1;
 const photos=offline?"— photos":FR.count(photoCount,"photo");
 return '<span>'+esc(FR.count(count,"jour"))+'</span>'+
 '<span aria-hidden="true">·</span><span>'+esc(FR.count(cities,"ville"))+'</span>'+
 '<span aria-hidden="true">·</span><span>'+esc(photos)+'</span>';
}
const api=Object.freeze({title,featured,featuredHTML,orientation,mosaicHTML,statsHTML});
if(root)root.BEAM_TRIP_ALBUM=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
