"use strict";
const assert=require("node:assert/strict");
const {assertCacheName,parse,MIN_VERSION}=require("./helpers/cache-name.cjs");
assert.equal(MIN_VERSION,60);
const real=assertCacheName();
assert.ok(real.startsWith("beam-travel-shell-v1-"));
assert.ok(parse(`const CACHE_NAME = "beam-travel-shell-v1-20261117-jyetais-v61-prochaine-version";`).version>parse(`const CACHE_NAME = "beam-travel-shell-v1-20261117-jyetais-v60-version-actuelle";`).version);
for(const bad of [
 "const CACHE_NAME = \"brand-other-v61-test\";",
 "const CACHE_NAME = \"beam-travel-shell-v1-20261341-jyetais-v61-test\";",
 "const CACHE_NAME = \"beam-travel-shell-v1-20261117-jyetais-v0-test\";"
])assert.throws(()=>parse(bad));
assert.throws(()=>assertCacheName('const CACHE_NAME = "beam-travel-shell-v1-20261117-jyetais-v59-old";'));
console.log("PASS PWA cache format and increasing revision:",real);
