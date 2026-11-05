"use strict";
// Geometry regression: generated points must come from the largest SVG ring.
const fs=require("node:fs"),assert=require("node:assert/strict"),vm=require("node:vm");
const {buildCentroids}=require("../scripts/generate-world-centroids.cjs");
const svg=fs.readFileSync("travel/assets/world-map.svg","utf8");
const stored=JSON.parse(fs.readFileSync("travel/assets/world-centroids.json","utf8"));
assert.deepEqual(stored,buildCentroids(svg),"Commit the deterministic generator output");
assert.ok(Object.keys(stored).length>=170&&Object.keys(stored).length<=200);
assert.ok(Buffer.byteLength(JSON.stringify(stored))<12000,"Public cached geometry must stay tiny");
function parseRings(d){
 const tokens=d.match(/[MLZ]|-?\d+(?:\.\d+)?/g)||[],rings=[];
 let ring=[],i=0;
 while(i<tokens.length){
  const cmd=tokens[i++];
  if(cmd==="M"){if(ring.length>=3)rings.push(ring);ring=[[+tokens[i++],+tokens[i++]]]}
  else if(cmd==="L")ring.push([+tokens[i++],+tokens[i++]]);
  else if(cmd==="Z"){if(ring.length>=3)rings.push(ring);ring=[]}
  else throw Error("SVG parser refused "+cmd);
 }
 return rings;
}
function area(ring){let a=0;for(let j=0;j<ring.length;j++){const p=ring[j],q=ring[(j+1)%ring.length];a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a/2)}
function inside(point,ring){
 let yes=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }
 return yes;
}
for(const code of ["FR","US","CA","GN","NO","NL","DK","GB"]){
 const m=[...svg.matchAll(/<path\b[^>]*data-country="([A-Z]{2})"[^>]*d="([^"]+)"/g)].find(x=>x[1]===code);
 assert.ok(m,"Country in SVG: "+code);
 const rings=parseRings(m[2]).sort((a,b)=>area(b)-area(a));
 const position=stored[code];
 assert.ok(position&&inside(position,rings[0]),code+" centroid must be inside LARGEST mainland polygon, not an island/territory");
}
assert.ok(stored.FR[0]>490&&stored.FR[0]<525,"France metropolis");
assert.ok(stored.US[0]>140&&stored.US[0]<295,"United States contiguous mainland");
assert.ok(stored.NO[1]>60,"Norway mainland, not Svalbard");
const source=fs.readFileSync("travel/flight-connections.js","utf8");
new vm.Script(source);
const FLIGHTS=require("../travel/flight-connections.js");
const journeys=["CA","JP","SN","GN","CA"];
const arcs=FLIGHTS.routes("GN",journeys,stored);
assert.deepEqual(arcs.map(x=>x.country),["CA","JP","SN"],"One connection per foreign destination; none for domestic");
for(const arc of arcs){
 assert.ok(arc.control[1]<Math.min(arc.from[1],arc.to[1]),"Upward arc");
 assert.ok(/^M[\d.]+ [\d.]+ Q[\d.]+ [-\d.]+ [\d.]+ [\d.]+$/.test(arc.d));
}
assert.deepEqual(FLIGHTS.routes(null,journeys,stored),[]);
assert.deepEqual(FLIGHTS.routes("GN",["GN"],stored),[]);
assert.ok(!source.includes("https://")&&!source.includes("fetch("),"Rendering is local-only");
console.log("PASS: 174 reproducible largest-polygon centroids, FR/US/CA/GN territory & GN→3 flight arcs");
