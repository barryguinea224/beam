// Private in-memory slideshow. Every image URL comes from the existing owner-scoped signer.
// Never write private URLs to caches, storage, logs, HTML source or third-party origins.
(function(root){
 "use strict";
 function init({overlay,stage,closeButton,imageBox,caption,counter,status,getRows,sign,available}){
  let active=false,paused=false,index=0,epoch=0,clock=null,focus=null,touchStart=null,swipedAt=0;
  const reduced=()=>!!root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  function clearClock(){if(clock!==null){root.clearTimeout(clock);clock=null}}
  function schedule(){
   clearClock();
   if(active&&!paused)clock=root.setTimeout(()=>{void go(1)},5000);
  }
  function label(){
   counter.textContent=String(index+1)+"/"+String(getRows().length);
   status.textContent=paused?"En pause":"Lecture";
   stage.setAttribute("aria-label","Photo "+(index+1)+" sur "+getRows().length+". Toucher pour "+(paused?"reprendre":"mettre en pause"));
  }
  async function display(){
   if(!active)return;
   const ticket=++epoch,rows=getRows(),row=rows[index];
   if(!row){close();return}
   label();clearClock();
   // Sign only the current photo. Prefetch the next one after it is displayed.
   const url=row.url||await sign(index);
   if(!active||ticket!==epoch)return;
   imageBox.replaceChildren();
   if(url){
    const img=overlay.ownerDocument.createElement("img");
    img.alt="Photo privée du voyage";
    img.referrerPolicy="no-referrer";
    img.dataset.isPrivate="true";
    img.className="slidePhoto"+(reduced()?" reduced":"");
    img.src=url;
    imageBox.append(img);
   }else{
    const note=overlay.ownerDocument.createElement("p");
    note.textContent="Photo temporairement indisponible.";imageBox.append(note);
   }
   caption.textContent=String(row.caption||"").trim().slice(0,500);
   caption.hidden=!caption.textContent;
   // The next signed private URL remains in memory, never in persistent storage.
   if(rows.length>1)void sign((index+1)%rows.length);
   schedule();
  }
  async function go(step){
   if(!active||getRows().length<2)return;
   index=(index+step+getRows().length)%getRows().length;
   await display();
  }
  function toggle(){
   if(!active)return;
   paused=!paused;label();schedule();
  }
  function open(){
   if(active||!available()||getRows().length<2)return false;
   focus=overlay.ownerDocument.activeElement;active=true;paused=false;index=0;
   overlay.hidden=false;overlay.classList.add("open");overlay.setAttribute("aria-hidden","false");
   stage.focus();void display();
   return true;
  }
  function close(){
   if(!active)return;
   active=false;epoch++;clearClock();
   overlay.classList.remove("open");overlay.hidden=true;overlay.setAttribute("aria-hidden","true");
   imageBox.replaceChildren();caption.textContent="";counter.textContent="";status.textContent="";
   if(focus?.isConnected)focus.focus();focus=null;
  }
  closeButton.addEventListener("click",event=>{event.stopPropagation();close()});
  stage.addEventListener("click",()=>{if(Date.now()-swipedAt>700)toggle()});
  stage.addEventListener("touchstart",event=>{
   const touch=event.changedTouches?.[0];
   if(touch)touchStart={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  stage.addEventListener("touchend",event=>{
   if(!touchStart)return;
   const touch=event.changedTouches?.[0],dx=touch?touch.clientX-touchStart.x:0,
    dy=touch?touch.clientY-touchStart.y:0;
   touchStart=null;
   if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)*1.2){
    swipedAt=Date.now();event.preventDefault();void go(dx<0?1:-1);
   }
  },{passive:false});
  overlay.ownerDocument.addEventListener("keydown",event=>{
   if(!active)return;
   if(event.key==="Escape"){event.preventDefault();close()}
   else if(event.key==="ArrowRight"){event.preventDefault();void go(1)}
   else if(event.key==="ArrowLeft"){event.preventDefault();void go(-1)}
   else if(event.key===" "&&event.target===stage){event.preventDefault();toggle()}
  });
  return Object.freeze({open,close,go,toggle,get active(){return active},get paused(){return paused},get index(){return index}});
 }
 const api=Object.freeze({init});
 if(root)root.BEAM_TRIP_SLIDESHOW=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
