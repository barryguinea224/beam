"use strict";
const fs=require("node:fs");
const path=require("node:path");
// Deterministic anchors from the largest polygon ring for each ISO country.
// SVG path geometry is restricted to absolute M/L/Z; no external dependencies.
function buildCentroids(svg){
  if(!/<svg\b[^>]*viewBox="0 0 1000 445"/.test(svg))throw Error("Expected 1000x445 map");
  const inside=(p,poly)=>{
    let yes=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    }
    return yes;
  };
  const analyze=(ring)=>{
    let twiceArea=0,sx=0,sy=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];
      twiceArea+=cross;sx+=(a[0]+b[0])*cross;sy+=(a[1]+b[1])*cross;
      minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);minY=Math.min(minY,a[1]);maxY=Math.max(maxY,a[1]);
    }
    let point=Math.abs(twiceArea)>1e-8?[sx/(3*twiceArea),sy/(3*twiceArea)]:[(minX+maxX)/2,(minY+maxY)/2];
    if(!inside(point,ring)){
      // Concave polygon: select the most sheltered interior point on a small grid.
      let best=null,score=-1;
      for(let y=0;y<25;y++)for(let x=0;x<25;x++){
        const p=[minX+(x+.5)*(maxX-minX)/25,minY+(y+.5)*(maxY-minY)/25];
        if(!inside(p,ring))continue;
        let d=Infinity;
        for(let j=0;j<ring.length;j++){
          const a=ring[j],b=ring[(j+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1];
          const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/((dx*dx+dy*dy)||1)));
          d=Math.min(d,(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2);
        }
        if(d>score){score=d;best=p;}
      }
      point=best||ring[0];
    }
    return {area:Math.abs(twiceArea)/2,point};
  };
  const out={};
  for(const m of svg.matchAll(/<path\b[^>]*data-country="([A-Z]{2})"[^>]*d="([^"]+)"/g)){
    const code=m[1],tokens=m[2].match(/[MLZ]|-?\d+(?:\.\d+)?/g)||[];
    let i=0,ring=[],rings=[];
    while(i<tokens.length){
      const command=tokens[i++];
      if(command==="M"){if(ring.length>=3)rings.push(ring);ring=[];ring.push([Number(tokens[i++]),Number(tokens[i++])]);}
      else if(command==="L")ring.push([Number(tokens[i++]),Number(tokens[i++])]);
      else if(command==="Z"){if(ring.length>=3)rings.push(ring);ring=[];}
      else throw Error("Unexpected SVG path command "+command+" for "+code);
    }
    if(ring.length>=3)rings.push(ring);
    if(!rings.length)continue;
    const winner=rings.map(analyze).sort((a,b)=>b.area-a.area)[0];
    out[code]=winner.point.map(v=>Math.round(v*100)/100);
  }
  return Object.fromEntries(Object.keys(out).sort().map(code=>[code,out[code]]));
}
if(require.main===module){
 const root=path.resolve(__dirname,"..");
 const source=fs.readFileSync(path.join(root,"travel/assets/world-map.svg"),"utf8");
 const centroids=buildCentroids(source);
 fs.writeFileSync(path.join(root,"travel/assets/world-centroids.json"),JSON.stringify(centroids)+"\n");
 console.log("Generated "+Object.keys(centroids).length+" largest-landmass anchors");
}
module.exports={buildCentroids};
