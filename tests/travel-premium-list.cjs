"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const LIST=require("../travel/trip-list.js");
const rows=[
 {id:"a",country_code:"SN",entry_date:"2025-09-02",exit_date:"2025-09-10"},
 {id:"b",country_code:"GN",entry_date:"2024-02-02",exit_date:"2024-02-10"},
 {id:"c",country_code:"FR",entry_date:"2026-11-08",exit_date:"2026-11-18"}
];
const names=x=>({FR:"France",GN:"Guinée",SN:"Sénégal"})[x];
const ids=list=>list.map(x=>x.id);
const original=ids(rows);
assert.deepEqual(ids(LIST.order(rows,"recent",names)),["c","a","b"]);
assert.deepEqual(ids(LIST.order(rows,"oldest",names)),["b","a","c"]);
assert.deepEqual(ids(LIST.order(rows,"country",names)),["c","b","a"]);
assert.deepEqual(ids(rows),original,"Sorting must not change original rows");
assert.equal(LIST.normalize("bad"),"recent");
let stored=null;
const storage={getItem(k){assert.equal(k,LIST.KEY);return stored},setItem(k,v){assert.equal(k,LIST.KEY);stored=v}};
assert.equal(LIST.read(storage),"recent");
assert.equal(LIST.write(storage,"oldest"),"oldest");
assert.equal(LIST.read(storage),"oldest");
assert.equal(LIST.write(storage,"evil"),"recent");
const blocked={getItem(){throw Error("Storage blocked")},setItem(){throw Error("Storage blocked")}};
assert.equal(LIST.read(blocked),"recent");
assert.equal(LIST.write(blocked,"country"),"country");
const html=fs.readFileSync("travel/index.html","utf8");
const css=fs.readFileSync("travel/trip-list.css","utf8");
const sw=fs.readFileSync("travel/sw.js","utf8");
for(const id of ["tripListToolbar","tripListSummary","tripListMap","tripListFilter","tripListSort","tripSortMenu"])assert.ok(html.includes('id="'+id+'"'));
for(const mode of LIST.MODES)assert.ok(html.includes('data-trip-sort="'+mode+'"'));
assert.match(css,/#tripListToolbar\{position:sticky;/);
assert.match(css,/top:env\(safe-area-inset-top/);
assert.match(html,/LIST\.order\(visible\.filter\(/);
assert.match(html,/LIST\.write\(sortStorage\(\),choice\.dataset\.tripSort\)/);
assert.ok(html.includes('scrollIntoView({behavior:"smooth",block:"start"})'));
assert.ok(sw.includes("./trip-list.js")&&sw.includes("./trip-list.css"));
assert.ok(sw.includes("beam-travel-shell-v1-20261116-jyetais-v58-moments-souvenir"));
console.log("PASS premium list: three sort modes, local storage, toolbar and cache");
