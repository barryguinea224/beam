// Account-wide private cover. Never persist signed URLs or include them in the public PWA shell.
(function(root){
 "use strict";
 function init({client,projectUrl,getUser,getProfile,getTrips,canWrite,isActive,getToday,onSet}){
  const $=q=>document.querySelector(q),MODEL=root.BEAM_PROFILE_COVER,VISUAL=root.BEAM_VISUAL_CARDS,FR=root.BEAM_FR_ACCORDS;
  let rows=[],epoch=0,gridEpoch=0,busy=false,visibleCount=24;
  function controls(){
   const permitted=!!canWrite()&&!busy;
   $("#coverPickerOpen").disabled=!permitted;
   $("#coverAuto").disabled=!permitted||!getProfile()?.cover_media_id;
   $("#coverReadonly").hidden=!!canWrite();
  }
  function fallback(code){
   const image=$("#profileCoverImage"),art=VISUAL?.countryArt(code||"");
   image.onerror=null;image.removeAttribute("src");image.hidden=true;image.dataset.isPrivate="false";
   if(art){image.src=art;image.hidden=false;$("#profileCover").dataset.source="country"}
   else $("#profileCover").dataset.source="solid";
  }
  function reset(){
   epoch++;gridEpoch++;rows=[];busy=false;visibleCount=24;
   const image=$("#profileCoverImage");
   image.onerror=null;image.removeAttribute("src");image.hidden=true;image.dataset.isPrivate="false";
   $("#profileCover").dataset.source="solid";
   $("#coverPicker").hidden=true;$("#coverPickerGrid").replaceChildren();$("#coverStatus").textContent="";
  }
  async function paint(){
   const uid=getUser()?.id;
   if(!isActive()||!uid||!MODEL)return;
   const token=++epoch,choice=MODEL.decide(getProfile(),getTrips(),rows,getToday(),uid);
   if(!choice.photo){fallback(choice.countryCode);return}
   const img=$("#profileCoverImage"),trip=getTrips().find(x=>x.id===choice.photo.trip_id);
   img.onerror=null;img.removeAttribute("src");img.hidden=true;
   try{
    const {data,error}=await client.storage.from("media").createSignedUrl(choice.photo.storage_path,300);
    const safe=!error?MODEL.safeUrl(data?.signedUrl,projectUrl):"";
    if(token!==epoch||getUser()?.id!==uid||!isActive())return;
    if(!safe){fallback(trip?.country_code);return}
    img.onerror=()=>{if(token===epoch)fallback(trip?.country_code)};
    img.dataset.isPrivate="true";img.hidden=false;img.src=safe;
    $("#profileCover").dataset.source=choice.source;
   }catch{if(token===epoch&&getUser()?.id===uid)fallback(trip?.country_code)}
  }
  async function refresh(){
   const uid=getUser()?.id;
   if(!uid||!isActive()||!client)return;
   const token=++epoch;
   try{
    const next=[];
    for(let offset=0;offset<25000;offset+=500){
      const {data,error}=await client.from("media")
       .select("id,trip_id,user_id,storage_path,is_favorite,caption,position,created_at")
       .eq("user_id",uid).order("created_at",{ascending:true}).range(offset,offset+499);
      if(error||!Array.isArray(data))throw Error("Photos privées indisponibles");
      if(token!==epoch||getUser()?.id!==uid||!isActive())return;
      next.push(...data.filter(m=>m.user_id===uid));
      if(data.length<500)break;
      if(offset>=24500)throw Error("Photo catalogue exceeds safe pagination limit");
    }
    rows=next;
   }catch{if(token!==epoch||getUser()?.id!==uid)return;rows=[]}
   if(token!==epoch||getUser()?.id!==uid||!isActive())return;
   await paint();
   if(!$("#coverPicker").hidden)void grid();
  }
  async function save(id){
   if(!canWrite()||busy||!client||!getUser()){
    $("#coverStatus").textContent="Votre accès ne permet pas de modifier la couverture.";return false;
   }
   const uid=getUser().id,value=id||null;busy=true;controls();
   $("#coverStatus").textContent="Enregistrement…";
   try{
    const {data,error}=await client.from("profiles").update({cover_media_id:value})
      .eq("id",uid).select("cover_media_id").single();
    if(error||!data||data.cover_media_id!==value||getUser()?.id!==uid)throw Error("not confirmed");
    onSet(value);
    $("#coverStatus").textContent=value?"Photo de couverture enregistrée.":"Choix automatique rétabli.";
    await refresh();return true;
   }catch{$("#coverStatus").textContent="Impossible de modifier la couverture. Réessayez.";return false}
   finally{busy=false;controls()}
  }
  async function grid(){
   if($("#coverPicker").hidden||!isActive()||!getUser())return;
   const uid=getUser().id,token=++gridEpoch,mine=rows.filter(row=>row.user_id===uid);
   const holder=$("#coverPickerGrid");holder.replaceChildren();
   $("#coverGridStatus").textContent=FR.count(mine.length,"photo")+" "+FR.word(mine.length,"privée","privées")+" de voyage.";
   $("#coverGridMore").hidden=mine.length<=visibleCount;
   for(const row of mine.slice(0,visibleCount)){
    const button=document.createElement("button");
    button.type="button";button.className="coverOption";
    button.setAttribute("aria-label","Choisir cette photo comme couverture");
    button.setAttribute("aria-pressed",String(getProfile().cover_media_id===row.id));
    button.disabled=!canWrite()||busy;
    button.onclick=async()=>{if(await save(row.id)){hideGrid()}};
    const img=document.createElement("img");img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";
    button.append(img);holder.append(button);
    void (async()=>{
     try{
      const {data,error}=await client.storage.from("media").createSignedUrl(row.storage_path,300);
      const safe=!error?MODEL.safeUrl(data?.signedUrl,projectUrl):"";
      if(safe&&token===gridEpoch&&getUser()?.id===uid&&!$("#coverPicker").hidden)img.src=safe;
     }catch{}
    })();
   }
  }
  function hideGrid(){
   gridEpoch++;$("#coverPicker").hidden=true;$("#coverPickerGrid").replaceChildren();
   $("#coverPickerOpen").focus();
  }
  $("#coverPickerOpen").onclick=async()=>{
   if(!canWrite()||busy)return;
   visibleCount=24;$("#coverPicker").hidden=false;await refresh();
   $("#coverGridClose").focus();
  };
  $("#coverGridClose").onclick=hideGrid;
  $("#coverGridMore").onclick=()=>{visibleCount+=24;void grid()};
  $("#coverAuto").onclick=()=>void save(null);
  return Object.freeze({refresh,paint,reset,save,controls});
 }
 const api=Object.freeze({init});
 if(root)root.BEAM_PROFILE_COVER_UI=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
