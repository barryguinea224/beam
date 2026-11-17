"use strict";
// Shared PWA cache contract. No test should pin an exact date, suffix or vNN.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const ROOT=path.resolve(__dirname,"../..");
const SW=path.join(ROOT,"travel/sw.js");
const MIN_VERSION=60; // Minimum shipped release; future vNN revisions remain valid.
function parse(source){
 const definitions=[...String(source).matchAll(/^\s*const\s+CACHE_NAME\s*=\s*["']([^"']+)["']\s*;\s*$/gm)];
 assert.equal(definitions.length,1,"Service worker must define exactly one literal CACHE_NAME");
 const name=definitions[0][1];
 const fields=/^beam-travel-shell-v1-(\d{8})-jyetais-v(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(name);
 assert.ok(fields,"CACHE_NAME requires beam-travel-shell-v1-, YYYYMMDD, jyetais-vNN and a slug");
 const date=fields[1],year=Number(date.slice(0,4)),month=Number(date.slice(4,6)),day=Number(date.slice(6,8));
 const parsed=new Date(Date.UTC(year,month-1,day));
 assert.equal(parsed.toISOString().slice(0,10).replaceAll("-",""),date,"CACHE_NAME must contain a valid YYYYMMDD date");
 const version=Number(fields[2]);
 assert.ok(Number.isSafeInteger(version)&&version>0,"CACHE_NAME version must be a positive integer");
 return {name,date,version};
}
function assertCacheName(source=fs.readFileSync(SW,"utf8")){
 const current=parse(source);
 assert.ok(current.version>=MIN_VERSION,`CACHE_NAME must not regress below v${MIN_VERSION}`);
 // Compare with the immediate Git parent when available, including local merges.
 // Shallow CI checkouts have no parent: the minimum version still protects them.
 try{
  const prior=execFileSync("git",["show","HEAD^:travel/sw.js"],{cwd:ROOT,encoding:"utf8",stdio:["ignore","pipe","ignore"]});
  const previous=parse(prior);
  if(current.name!==previous.name){
   assert.ok(current.version>previous.version,"A renamed CACHE_NAME must increase its vNN revision");
   assert.ok(current.date>=previous.date,"A new CACHE_NAME cannot move the release date backward");
  }
 }catch(error){
  if(error instanceof assert.AssertionError)throw error;
  // Parent not available outside a full Git checkout.
 }
 return current.name;
}
module.exports={assertCacheName,parse,MIN_VERSION};
