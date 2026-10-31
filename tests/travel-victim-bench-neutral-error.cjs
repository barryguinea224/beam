// Non-destructive contract guard: the protected victim bench is gated by manual
// staging-destructive approval, so keep its public-error expectations in normal CI.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const bench = fs.readFileSync("travel/supabase/tests/victim_bench.ts", "utf8");
const handler = fs.readFileSync("supabase/functions/_shared/travel-public-errors.ts", "utf8");

const start = bench.indexOf("// Manual resume remains allowed after failed worker retries");
const end = bench.indexOf("// Resolve the blocker, then resume again.", start);
assert.ok(start > 0 && end > start, "manual account deletion refusal checks must exist");
const rejection = bench.slice(start, end);

assert.match(rejection, /r\.status === 503 && r\.body\.error === "DELETE_UNAVAILABLE"/,
  "protected bench must expect the generic HTTP 503 response");
assert.doesNotMatch(rejection, /r\.body\.error[^\n]*OWNED_OBJECTS_REMAIN/,
  "private database codes must never be expected in the public response");
assert.match(rejection, /Object\.keys\(r\.body\)\.length === 1/,
  "public refusal must not reveal additional fields");
assert.match(rejection, /check\(await userExists\(victim\.id\)/,
  "Auth user must still exist after the refusal");
assert.match(rejection, /prof\?\.deleting === true/,
  "profile must stay locked after refusal");
assert.match(rejection,
  /Date\.parse\(String\(prof\.deletion_requested_at\)\) === Date\.parse\(firstRequestedAt\)/,
  "first deletion timestamp must stay unchanged");
assert.match(rejection, /if \(profError\) throw new Error/,
  "profile status lookup errors must fail the bench");
assert.match(handler, /error: "DELETE_UNAVAILABLE", status: 503/,
  "server must return the matching generic error");

console.log("BEAM destructive bench public 503 + private lock assertions: PASS");
