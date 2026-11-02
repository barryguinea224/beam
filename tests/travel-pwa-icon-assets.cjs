"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
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
const found=expected.map(v=>({...v,...inspect(v.name)}));
for(const v of found)assert.deepEqual([v.w,v.h],[v.size,v.size],v.name+" dimensions");
assert.notEqual(found[0].sha,found[1].sha,"512px must be generated, not a 192px copy");
assert.notEqual(found[1].sha,found[2].sha,"maskable version must have full-bleed artwork");
const maskBytes=fs.readFileSync(path.join(root,"icon-maskable-512.png"));
assert.ok(!maskBytes.includes(Buffer.from("tRNS")),"maskable icon must have no transparent palette");
assert.notEqual(found[2].colorType,6,"maskable icon must use an opaque RGB or palette pixel format");
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
console.log("PASS BTH icon PNG signatures/sizes/palette; SVG source; unchanged manifest; v16 public-only cache");
