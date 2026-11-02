"use strict";
// Pure test of the exact matcher used in travel-delete/index.ts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
(async () => {
  const file=path.resolve(__dirname,"../supabase/functions/_shared/travel-cors.mjs");
  const {isAllowedTravelOrigin: allow}=await import(pathToFileURL(file).href);
  const staging="coigbvhxywbmqgacmhzf.supabase.co";
  const production="aojxeujjluhmnkwscndc.supabase.co";
  const preview=n=>`https://deploy-preview-${n}--inquisitive-boba-e06b58.netlify.app`;
  for(const n of [1,3,63,123456]){
    assert.equal(allow(staging,preview(n)),true, "staging must accept numeric preview "+n);
    assert.equal(allow(production,preview(n)),false, "production must reject preview "+n);
  }
  assert.equal(allow(production,"https://beamguinee.com"),true);
  assert.equal(allow(production,"https://www.beamguinee.com"),false);
  assert.equal(allow(staging,"https://beamguinee.com"),true);
  assert.equal(allow(staging,"https://www.beamguinee.com"),true);
  for(const url of [
    "https://deploy-preview-63--another-netlify-site.netlify.app",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app.evil.example",
    "https://evil.deploy-preview-63--inquisitive-boba-e06b58.netlify.app",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app.attacker.netlify.app",
    "http://deploy-preview-63--inquisitive-boba-e06b58.netlify.app",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app/",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app:443",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app?x=1",
    "https://deploy-preview-X--inquisitive-boba-e06b58.netlify.app",
    "https://deploy-preview--inquisitive-boba-e06b58.netlify.app",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.com",
    "https://deploy-preview-63--inquisitive-boba-e06b58.netlify.app@evil.example",
    "",null,undefined,
  ]){
    assert.equal(allow(staging,url),false,"staging rejected "+String(url));
    assert.equal(allow(production,url),false,"production rejected "+String(url));
  }
  for(const host of ["", "unrecognized.supabase.co", null]){
    assert.equal(allow(host,preview(63)),false);
    assert.equal(allow(host,"https://beamguinee.com"),false);
  }
  const index=fs.readFileSync(path.resolve(__dirname,"../supabase/functions/travel-delete/index.ts"),"utf8");
  // Both the response headers and OPTIONS authorization MUST use this matcher.
  assert.match(index,/return isAllowedTravelOrigin\(projectHost, origin\) \?/);
  assert.match(index,/if \(!isAllowedTravelOrigin\(projectHost, origin\)\) return new Response\(null, \{ status: 403 \}\)/);
  assert.match(index,/from "\.\.\/_shared\/travel-cors\.mjs"/);
  assert.doesNotMatch(index,/ALLOWED_ORIGINS\.has\(origin\)|origin\.includes\(/);
  console.log("PASS staging preview CORS, other Netlify/poisoned host rejected, production exact, both request gates");
})().catch(e=>{console.error(e);process.exitCode=1});
