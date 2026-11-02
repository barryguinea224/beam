"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const root=path.resolve(__dirname,"../travel/icons");
const manifest=JSON.parse(fs.readFileSync("travel/manifest.webmanifest","utf8"));
const expected=[
 {name:"icon-192.png",size:192,purpose:"any"},
 {name:"icon-512.png",size:512,purpose:"any"},
 {name:"icon-maskable-512.png",size:512,purpose:"maskable"}
];
assert.deepEqual(manifest.icons,expected.map(v=>({
 src:"/travel/icons/"+v.name,sizes:v.size+"x"+v.size,type:"image/png",purpose:v.purpose
})),"Keep original manifest byte-for-byte; icon paths/purposes must be unchanged");
function inspect(file){
 const b=fs.readFileSync(path.join(root,file));
 assert.ok(b.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")),file+" must be a real PNG");
 assert.equal(b.toString("ascii",12,16),"IHDR",file+" must have an IHDR chunk");
 assert.ok(b.length>100&&b.length<300000);
 return {w:b.readUInt32BE(16),h:b.readUInt32BE(20),colorType:b[25],bytes:b.length,sha:require("node:crypto").createHash("sha256").update(b).digest("hex")};
}

// Sample a real decoded PNG pixel, not only its PNG palette or metadata.
// An 8-bit truecolour PNG is required; other formats must not silently pass.
function pixelAt(file,x,y){
 const png=fs.readFileSync(path.join(root,file));
 const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
 const depth=png[24],type=png[25],interlace=png[28];
 assert.equal(depth,8,file+" must be 8-bit truecolour");
 assert.ok(type===2||type===6,file+" must be RGB/RGBA, never indexed palette mode P");
 assert.equal(interlace,0,file+" requires non-interlaced PNG for pixel sampling");
 assert.ok(x>=0&&x<w&&y>=0&&y<h);
 const chunks=[];
 for(let i=8;i+12<=png.length;){
  const size=png.readUInt32BE(i),tag=png.toString("ascii",i+4,i+8);
  if(tag==="IDAT")chunks.push(png.subarray(i+8,i+8+size));
  i+=size+12;
  if(tag==="IEND")break;
 }
 assert.ok(chunks.length>0,file+" PNG must contain IDAT data");
 const bytes=zlib.inflateSync(Buffer.concat(chunks));
 const channels=type===6?4:3,stride=w*channels;
 assert.equal(bytes.length,h*(stride+1),file+" decoded PNG size mismatch");
 let prev=Buffer.alloc(stride),offset=0;
 for(let row=0;row<=y;row++){
  const filter=bytes[offset++],current=Buffer.alloc(stride);
  for(let k=0;k<stride;k++){
   const left=k>=channels?current[k-channels]:0;
   const up=prev[k],upperLeft=k>=channels?prev[k-channels]:0;
   let predicted;
   switch(filter){
    case 0:predicted=0;break;
    case 1:predicted=left;break;
    case 2:predicted=up;break;
    case 3:predicted=Math.floor((left+up)/2);break;
    case 4:{
     const p=left+up-upperLeft,da=Math.abs(p-left),db=Math.abs(p-up),dc=Math.abs(p-upperLeft);
     predicted=da<=db&&da<=dc?left:db<=dc?up:upperLeft;break;
    }
    default:assert.fail(file+" unsupported PNG scanline filter "+filter);
   }
   current[k]=(bytes[offset++]+predicted)&255;
  }
  if(row===y)return [...current.subarray(x*channels,x*channels+channels)];
  prev=current;
 }
 throw new Error(file+" pixel not found");
}

const found=expected.map(v=>({...v,...inspect(v.name)}));
for(const v of found){
 assert.deepEqual([v.w,v.h],[v.size,v.size],v.name+" dimensions");
 assert.ok(v.colorType===2||v.colorType===6,
   v.name+" must be 8-bit RGB/RGBA (PNG colorType 2/6), not mode P (palette/colorType 3)");
 // Center of the globe is at 50% width / 32% height in the chosen artwork.
 // Target gold = #E3A93A = (227,169,58), tolerating slight edge/ICC shifts.
 const gold=pixelAt(v.name,Math.floor(v.w/2),Math.floor(v.h*0.32));
 const target=[0xe3,0xa9,0x3a];
 for(let channel=0;channel<3;channel++)
  assert.ok(Math.abs(gold[channel]-target[channel])<=18,
    v.name+" globe centre lost its gold #E3A93A: got "+gold.join(","));
 if(gold.length===4)assert.equal(gold[3],255,v.name+" gold globe must be opaque");
}
assert.notEqual(found[0].sha,found[1].sha,"512px must be generated, not a 192px copy");
assert.notEqual(found[1].sha,found[2].sha,"maskable version must have full-bleed artwork");
const maskBytes=fs.readFileSync(path.join(root,"icon-maskable-512.png"));
assert.ok(!maskBytes.includes(Buffer.from("tRNS")),"maskable icon must have no transparent palette");
assert.ok(found[2].colorType===2||found[2].colorType===6,
 "maskable icon must be full-colour RGB/RGBA, never indexed palette");
for(const name of ["bth-logo.svg","bth-maskable.svg"]){
 const data=fs.readFileSync(path.join(root,"src",name),"utf8");
 assert.match(data,/<svg[^>]+viewBox="0 0 192 192"/);
 for(const color of ["#174d3a","#e3a93a","#f4efe2","#e6dcc6","#5f917a"])
  assert.ok(data.includes(color),name+" missing logo palette "+color);
 assert.doesNotMatch(data,/<image\b|data:image|<script\b|<(?:foreignObject|use)\b|\bhref=/i,
  "SVG must be genuinely vector, editable, self-contained and scriptless");
}
const maskSVG=fs.readFileSync(path.join(root,"src","bth-maskable.svg"),"utf8");
assert.match(maskSVG,/<rect[^>]+width="192"[^>]+height="192"/);
const sw=fs.readFileSync("travel/sw.js","utf8");
assert.match(sw,/beam-travel-shell-v1-20261102-bth-logo-v16/);
for(const v of expected)assert.ok(sw.includes('"./icons/'+v.name+'"'),
 "Install cache must include "+v.name);
assert.doesNotMatch(sw,/"\.\/icons\/src\//,"source vectors need not be cached for the PWA");
console.log("PASS BTH truecolour RGB/RGBA icons, gold globe pixels, SVG source; unchanged manifest; v16 cache");
