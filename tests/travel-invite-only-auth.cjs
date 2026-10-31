// Static invite-only login contract. The protected staging probe exercises GoTrue itself.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("travel/index.html","utf8");
const toml = fs.readFileSync("supabase/config.toml","utf8");
const match = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(m => m[1].includes('const AUTH_STATE_KEY="beam.travel.auth.pending"'));
assert.ok(match, "expected inline authentication script");
new vm.Script(match[1], {filename:"travel/index.html:inline.js"});

const authStart = match[1].indexOf('const AUTH_STATE_KEY="beam.travel.auth.pending"');
const authEnd = match[1].indexOf("async function clearPwaSession(){", authStart);
assert.ok(authStart >= 0 && authEnd > authStart, "auth handlers found");
const auth = match[1].slice(authStart, authEnd);

assert.match(auth, /signInWithOtp\(\{[\s\S]*?shouldCreateUser:false/, "OTP must never create accounts");
assert.doesNotMatch(auth, /\.signUp\s*\(/, "no public signUp calls");
assert.match(auth, /savePending\(email\);\s*showOtp\(email\)/, "all addresses receive same flow");
assert.match(auth, /catch\s*\{\s*\}/, "auth transport failure must not expose existence");
assert.doesNotMatch(auth, /error\.message|error\.code|error\.status/, "never expose Auth user-existence details");
assert.match(auth, /loginNotice\(\);/, "same neutral access notice for existing and unknown email");
assert.match(html, /id="accessHelp"[^>]*>Ce carnet est réservé aux clients BEAM\./);
assert.match(html, /href="https:\/\/wa\.me\/224622095630"/);
const otpBox = html.split('<div id="otpBox" class="hidden">')[1]?.split('<p id="loginMsg"')[0];
assert.ok(otpBox, "OTP panel must exist");
assert.match(otpBox, /id="otp"[^>]*aria-describedby="otpHelp"/, "help must be attached to the OTP field");
assert.match(otpBox, /id="otpHelp">Pas de code après 2 minutes \? Vérifiez vos spams, ou /,
  "two-minute help must appear below the code input");
assert.match(otpBox, /<a href="https:\/\/wa\.me\/224622095630"[^>]*>écrivez-nous sur WhatsApp<\/a>/,
  "OTP help must link to official BEAM WhatsApp");
assert.match(html, /id="loginMsg"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(toml, /\[auth\]\s*enable_signup\s*=\s*false/);
assert.match(toml, /\[auth\.email\]\s*enable_signup\s*=\s*false/);
console.log("BEAM invite-only Auth client + local config contract: PASS");
