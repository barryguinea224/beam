// J'y étais: on-device share IMAGE, never a public URL or server upload.
// Strict allowlist of rendered fields: country, cities, dates, duration, photos.
(function(root){
 "use strict";
 const WIDTH=1080,HEIGHT=1350;
 const FONT="Poppins, system-ui, sans-serif";
 function safeText(value,max=120){return typeof value==="string"?value.trim().replace(/\s+/gu," ").slice(0,max):""}
 function safeTrip(trip,countryName,dates){
  return Object.freeze({
   country:safeText(countryName,80),
   cities:safeText((Array.isArray(trip?.cities)?trip.cities:[]).filter(x=>typeof x==="string").join(", "),140),
   dates:safeText(dates,90),
   days:Number.isInteger(Number(trip?.duration_days))&&Number(trip.duration_days)>=1?
     Number(trip.duration_days):1
  });
 }
 function crop(ctx,img,x,y,w,h){
  const iw=img?.naturalWidth||img?.width||0,ih=img?.naturalHeight||img?.height||0;
  if(!iw||!ih)return false;
  const sw=Math.min(iw,ih*w/h),sh=Math.min(ih,iw*h/w);
  ctx.drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);return true;
 }
 function wrap(ctx,text,x,y,maxWidth,lineHeight,maxLines=2){
  const words=String(text||"").split(/\s+/u).filter(Boolean);
  let line="",lines=0;
  for(const word of words){
   const trial=line?line+" "+word:word;
   if(ctx.measureText(trial).width>maxWidth&&line&&lines<maxLines-1){
    ctx.fillText(line,x,y);y+=lineHeight;lines++;line=word;
   }else line=trial;
  }
  if(line)ctx.fillText(line,x,y);
  return y;
 }
 // The renderer intentionally never receives a travel-row or profile record.
 // No notes, companions, address, email, phone, miles or embassy fields exist in its inputs.
 function draw(canvas,{country,cities,dates,days,cover=null,photos=[],flag=null}){
  canvas.width=WIDTH;canvas.height=HEIGHT;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas indisponible.");
  ctx.fillStyle="#f7f5ef";ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle="#dceadf";ctx.fillRect(0,0,WIDTH,570);
  if(cover)crop(ctx,cover,0,0,WIDTH,570);
  ctx.fillStyle="#fff";ctx.fillRect(0,570,WIDTH,780);
  if(flag)crop(ctx,flag,72,631,68,48);
  ctx.fillStyle="#174d3a";ctx.font="700 64px "+FONT;
  wrap(ctx,country,72,765,930,69,2);
  ctx.fillStyle="#42624f";ctx.font="500 38px system-ui, sans-serif";
  wrap(ctx,cities,72,846,930,49,2);
  ctx.font="400 30px system-ui, sans-serif";
  ctx.fillStyle="#556e5e";
  const duration=days===1?"1 jour":days+" jours";
  wrap(ctx,[dates,duration].filter(Boolean).join(" · "),72,931,930,42,2);
  const tiles=Array.isArray(photos)?photos.filter(Boolean).slice(0,3):[];
  const gap=14,tileY=1006,tileW=(936-gap*2)/3;
  for(let i=0;i<tiles.length;i++){
   ctx.fillStyle="#e2eee5";ctx.fillRect(72+i*(tileW+gap),tileY,tileW,182);
   crop(ctx,tiles[i],72+i*(tileW+gap),tileY,tileW,182);
  }
  ctx.strokeStyle="#c7d8ce";ctx.beginPath();ctx.moveTo(72,1247);ctx.lineTo(1008,1247);ctx.stroke();
  ctx.textAlign="center";ctx.fillStyle="#174d3a";ctx.font="600 31px "+FONT;
  ctx.fillText("J'y étais",540,1305);ctx.textAlign="start";
  return canvas;
 }
 function toBlob(canvas){
  return new Promise((resolve,reject)=>{
   try{canvas.toBlob(blob=>blob&&blob.type==="image/png"?resolve(blob):reject(new Error("PNG indisponible")),"image/png");}
   catch(error){reject(error)}
  });
 }
 function loadImage(url,ImageCtor=root?.Image){
  return new Promise(resolve=>{
   if(!url||typeof url!=="string"||!ImageCtor){resolve(null);return}
   let completed=false;
   const img=new ImageCtor();
   const finish=value=>{if(completed)return;completed=true;resolve(value)};
   img.crossOrigin="anonymous"; // Private signed Storage must permit CORS for canvas.
   img.onload=()=>finish(img);img.onerror=()=>finish(null);
   img.src=url;
  });
 }
 async function create({fields,coverUrl,photoUrls,flagUrl,canvas=null,loader=loadImage}){
  const surface=canvas||(root?.document?.createElement("canvas"));
  if(!surface)throw new Error("Canvas indisponible.");
  const urls=Array.isArray(photoUrls)?photoUrls.slice(0,3):[];
  const [cover,flag,...photos]=await Promise.all([
   loader(coverUrl),loader(flagUrl),...urls.map(url=>loader(url))
  ]);
  draw(surface,{...fields,cover,flag,photos});
  return {blob:await toBlob(surface),width:WIDTH,height:HEIGHT};
 }
 function makeFile(blob){
  return new File([blob],"jyetais-voyage.png",{type:"image/png",lastModified:Date.now()});
 }
 const api=Object.freeze({WIDTH,HEIGHT,safeTrip,crop,draw,create,makeFile});
 if(root)root.BEAM_TRIP_SHARE=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
