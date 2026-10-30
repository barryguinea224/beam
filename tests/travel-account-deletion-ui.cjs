// Static contract + syntax guard; real deletion is verified separately on staging.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync("travel/index.html", "utf8");

const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, "inline Travel History script is present");
new vm.Script(match[1], { filename: "travel/index.html:inline.js" });

for (const id of [
  "deleteAccountOpen", "deleteAccountForm", "deleteAccountConfirm",
  "deleteAccountSubmit", "deleteAccountCancel", "deleteAccountMessage",
]) {
  assert.ok(html.includes('id="' + id + '"'), "missing accessible account deletion control: " + id);
}
assert.ok(!html.includes("deleteAccountPreview"), "inert demo must be removed");
assert.ok(html.includes('pattern="SUPPRIMER"'), "exact required confirmation word");
assert.ok(html.includes('$("#deleteAccountConfirm").value!=="SUPPRIMER"'), "submit checks typed word");
assert.ok(html.includes('S.functions.invoke("travel-delete"'), "must call protected Edge Function");
assert.ok(html.includes('action:"delete_account",confirmation:"SUPPRIMER"'), "must supply required server confirmation");
assert.ok(html.includes('data?.account_deleted!==true'), "success must require server-confirmed deletion");
assert.ok(html.includes("RECENT_AUTH_REQUIRED"), "must guide user to fresh sign-in");
assert.ok(html.includes('S.auth.signOut({scope:"local"})'), "clear local login after confirmed deletion");
assert.ok(!html.includes('.from("profiles").delete('), "never delete Auth profile directly in browser");
console.log("BEAM account deletion UI contract and JS syntax: PASS");
