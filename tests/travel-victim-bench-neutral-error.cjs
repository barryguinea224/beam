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

// Reservation-first fixtures are checked here because the destructive bench
// is intentionally excluded from unattended CI. A failed upload without a
// reserved row is a false positive for the deletion-lock tests.
const addPhotoStart = bench.indexOf("async function addPhoto(");
const addPhotoEnd = bench.indexOf("async function objectPresent(", addPhotoStart);
assert.ok(addPhotoStart >= 0 && addPhotoEnd > addPhotoStart, "photo helper must exist");
const addPhoto = bench.slice(addPhotoStart, addPhotoEnd);
assert.ok(addPhoto.indexOf("await reservePhoto(a, tripId)") < addPhoto.indexOf(".upload(reserved.path,"),
  "addPhoto must reserve media BEFORE uploading the exact path");
assert.match(addPhoto, /admin\.from\("media"\)\.delete\(\)/,
  "a failed upload must clean up the disposable media reservation via admin");

const fixtureStart = bench.indexOf("// Fixtures (distinct past dates");
const fixtureEnd = bench.indexOf("// The worker is privileged", fixtureStart);
const initialFixtures = bench.slice(fixtureStart, fixtureEnd);
assert.match(initialFixtures, /const unreserved = /, "positive guard for missing reservation required");
assert.match(initialFixtures, /upload\(unreserved, webp\(\)/,
  "positive guard must attempt an actual unreserved upload");
assert.match(initialFixtures, /check\(!!error, "normal active trip rejects Storage upload without media reservation"/,
  "unreserved upload must be explicitly denied on an active trip");
assert.match(initialFixtures, /await countOwned\(victim\.id\) === ownedBefore/,
  "unreserved upload must preserve Storage ownership count");

const tripFixture = bench.slice(bench.indexOf("// 4. Synthetic interruption"),
  bench.indexOf("// 4b. The worker"));
assert.ok(tripFixture.indexOf("await reservePhoto(victim, t3)") < tripFixture.indexOf("deleting: true"),
  "trip fixture must reserve before marking the trip deleting");
assert.match(tripFixture, /upload\(lockedReservation\.path, webp\(\)/,
  "locked trip must attempt upload at the reserved path");
assert.match(tripFixture, /rowCount\("media", "id", lockedReservation\.mediaId\) === 1/,
  "locked trip must retain the exact reservation");

const accountFixture = bench.slice(bench.indexOf("// 5b. Synthetic interruption"),
  bench.indexOf("// 5d. Real worker failure"));
assert.ok(accountFixture.indexOf("await reservePhoto(victim, t4)") <
  accountFixture.indexOf("deleting: true"),
  "account fixture must reserve before marking profile deleting");
assert.match(accountFixture, /upload\(reserved\.path, webp\(\)/,
  "locked account must attempt upload at the reserved path");
assert.match(accountFixture, /await countOwned\(victim\.id\) === ownedBeforeRefusal/,
  "locked account refusal must preserve Storage ownership count");
assert.match(accountFixture, /reservedRowsBefore \+ 4 <= 10/,
  "account fixture must stay inside the media quota");
assert.match(bench, /const reserved = await addPhoto\(victim, t4\)/,
  "orphan source must also use reservation-first client upload");

console.log("BEAM destructive bench public 503 + private lock assertions: PASS");
