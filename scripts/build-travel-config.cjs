"use strict";
const fs=require("node:fs"),path=require("node:path");
const PROJECTS={
 production:{url:"https://aojxeujjluhmnkwscndc.supabase.co",key:"BEAM_TRAVEL_PRODUCTION_PUBLIC_KEY"},
 staging:{url:"https://coigbvhxywbmqgacmhzf.supabase.co",key:"BEAM_TRAVEL_STAGING_PUBLIC_KEY"}
};
function context(e){
 if(e.NETLIFY!=="true")throw Error("Netlify build required");
 if(e.CONTEXT==="production"){
  if(e.BRANCH!=="main")throw Error("Production config only from main");
  return "production";
 }
 if(["deploy-preview","branch-deploy","preview-server","dev"].includes(e.CONTEXT))return "staging";
 throw Error("Unknown Netlify context");
}
function publicKey(s){
 if(typeof s!=="string"||!s||s!==s.trim())return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(s))return true;
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s))return false;
 try{return JSON.parse(Buffer.from(s.split(".")[1],"base64url").toString("utf8")).role==="anon";}
 catch{return false;}
}
function render(e){
 const mode=context(e),target=PROJECTS[mode],key=e[target.key];
 if(!publicKey(key))throw Error("Missing or non-public key: "+target.key);
 const other=PROJECTS[mode==="production"?"staging":"production"];
 if(e[other.key]&&e[other.key]===key)throw Error("Staging and production keys must differ");
 return "window.BEAM_TRAVEL_CONFIG = "+JSON.stringify({supabaseUrl:target.url,supabaseAnonKey:key})+";\n";
}
if(require.main===module){
 fs.writeFileSync(path.resolve(__dirname,"../travel/config.js"),render(process.env),"utf8");
 console.log("Created public Travel configuration for "+context(process.env));
}
module.exports={context,publicKey,render};
