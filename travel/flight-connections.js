// BEAM Travel History · original, deterministic connections on the local world SVG.
// Public geometry only. Never cache or persist the residence or trip selections.
(function(root){
"use strict";
const NS="http://www.w3.org/2000/svg";
const valid=code=>typeof code==="string"&&/^[A-Z]{2}$/.test(code);
const point=(centroids,code)=>{
 const p=valid(code)&&centroids&&Object.prototype.hasOwnProperty.call(centroids,code)?centroids[code]:null;
 return Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&
  p[0]>=0&&p[0]<=1000&&p[1]>=0&&p[1]<=445?p:null;
};
function routes(residence,destinations,centroids){
 const start=point(centroids,residence);
 if(!start)return [];
 const unique=[...new Set(Array.isArray(destinations)?destinations:[])].filter(code=>
  valid(code)&&code!==residence&&point(centroids,code)).sort();
 return unique.map((code,index)=>{
  const end=point(centroids,code),dx=end[0]-start[0],dy=end[1]-start[1];
  // A quadratic Bézier control lies ABOVE both endpoints. Nearby arcs receive
  // slightly different lift, without randomness or a dependency on DOM size.
  const lift=Math.min(76,Math.max(10,Math.abs(dx)*.13+Math.abs(dy)*.07))+
   (index%5)*2.2;
  const control=[Number(((start[0]+end[0])/2).toFixed(2)),
   Number((Math.max(3,Math.min(start[1],end[1])-lift)).toFixed(2))];
  return {country:code,from:start,to:end,control,
   d:"M"+start[0]+" "+start[1]+" Q"+control[0]+" "+control[1]+" "+end[0]+" "+end[1]};
 });
}
function draw(svg,residence,destinations,centroids,options={}){
 if(!svg?.ownerDocument?.createElementNS)return [];
 const old=svg.querySelector?.('g[data-flight-connections="true"]');
 if(old)old.remove();
 const source=point(centroids,residence);
 if(!source)return [];
 const model=routes(residence,destinations,centroids);
 const doc=svg.ownerDocument,group=doc.createElementNS(NS,"g");
 group.setAttribute("data-flight-connections","true");
 group.setAttribute("aria-hidden","true");
 group.setAttribute("pointer-events","none");
 group.style.pointerEvents="none";
 const make=(tag,klass)=>{const el=doc.createElementNS(NS,tag);el.setAttribute("class",klass);el.style.pointerEvents="none";group.appendChild(el);return el};
 const animated=options.animate===true&&!(root?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
 for(const [index,route] of model.entries()){
  const path=make("path","flightArc"+(animated?" flightMotion":""));
  path.setAttribute("d",route.d);
  path.setAttribute("data-destination",route.country);
  path.style.fill="none";
  path.style.stroke="#2f6f53";
  path.style.strokeWidth="1.8";
  path.setAttribute("vector-effect","non-scaling-stroke");
  path.style.strokeLinecap="round";
  path.style.opacity=".75";
  if(animated){
   path.setAttribute("pathLength","100");
   path.style.strokeDasharray="100";
   path.style.strokeDashoffset="100";
   path.style.animationDelay=(model.length===1?0:Math.min(.98,index*.98/(model.length-1))).toFixed(3)+"s";
  }
 }
 // Point below destination dots: a single unobtrusive halo for the residence.
 const halo=make("circle","flightHomeHalo");
 halo.setAttribute("cx",source[0]);halo.setAttribute("cy",source[1]);halo.setAttribute("r","15");
 halo.style.fill="#2f6f53";halo.style.opacity=".18";
 for(const route of model){
  const p=make("circle","flightDestination");
  p.setAttribute("cx",route.to[0]);p.setAttribute("cy",route.to[1]);p.setAttribute("r","5.5");
  p.style.fill="#2f6f53";p.style.stroke="#ffffff";p.style.strokeWidth="1.4";
  p.setAttribute("vector-effect","non-scaling-stroke");
 }
 const home=make("circle","flightResidence");
 home.setAttribute("cx",source[0]);home.setAttribute("cy",source[1]);home.setAttribute("r","8");
 home.style.fill="#24513e";home.style.stroke="#ffffff";home.style.strokeWidth="2";
 home.setAttribute("vector-effect","non-scaling-stroke");
 svg.appendChild(group);
 return model;
}
const api=Object.freeze({routes,draw,point});
if(root)root.BEAM_FLIGHT_CONNECTIONS=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:undefined);
