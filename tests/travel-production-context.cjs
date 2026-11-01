"use strict";
// Test prepared for a future explicit run; not executed during this PR.
const a=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {render,publicKey}=require("../scripts/build-travel-config.cjs");
const e={NETLIFY:"true",BRANCH:"main",BEAM_TRAVEL_PRODUCTION_PUBLIC_KEY:"sb_publishable_prod_example",BEAM_TRAVEL_STAGING_PUBLIC_KEY:"sb_publishable_staging_example"};
function result(add){const x={window:{}};vm.runInNewContext(render({...e,...add}),x);return x.window.BEAM_TRAVEL_CONFIG;}
a.equal(result({CONTEXT:"production"}).supabaseUrl,"https://aojxeujjluhmnkwscndc.supabase.co");
for(const CONTEXT of ["deploy-preview","branch-deploy","preview-server","dev"]){
 a.equal(result({CONTEXT,BRANCH:"feature/test"}).supabaseUrl,"https://coigbvhxywbmqgacmhzf.supabase.co");
}
a.throws(()=>result({CONTEXT:"production",BRANCH:"feature/test"}),/main/);
a.throws(()=>result({CONTEXT:"unrecognized"}),/Unknown/);
a.throws(()=>result({CONTEXT:"production",BEAM_TRAVEL_PRODUCTION_PUBLIC_KEY:"sb_secret_private"}),/non-public/);
a.throws(()=>result({CONTEXT:"production",BEAM_TRAVEL_PRODUCTION_PUBLIC_KEY:e.BEAM_TRAVEL_STAGING_PUBLIC_KEY}),/differ/);
const b=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
a.ok(publicKey(b({alg:"HS256"})+"."+b({role:"anon"})+".sig"));
a.ok(!publicKey(b({alg:"HS256"})+"."+b({role:"service_role"})+".sig"));
const w=fs.readFileSync(".github/workflows/deploy-production-functions.yml","utf8");
a.match(w,/workflow_dispatch:/);a.doesNotMatch(w,/^\s+(push|pull_request|schedule):/m);
a.match(w,/environment: production/);a.match(w,/refs\/heads\/main/);
console.log("PASS static production/staging config separation");
