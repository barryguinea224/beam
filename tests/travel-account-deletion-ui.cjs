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

// The state renderer can be tested without a browser, credentials or network.
for (const id of [
  "deletionPending", "finishDeletion", "finishDeletionMessage",
  "accountStatusUnavailable", "accountStatusChecking", "retryAccountStatus",
  "travelHero", "residencePanel", "travelPanels",
]) {
  assert.ok(html.includes('id="' + id + '"'), "missing account-status UI: " + id);
}
assert.ok(html.includes('.select("country_of_residence,deleting")'),
  "profile deleting flag must be read at load");
assert.ok(html.includes('if(current.deleting===true)'), "pending accounts must be recognized");
assert.ok(html.includes('$("#finishDeletion").onclick=()=>runAccountDeletion(true)'),
  "locked accounts need an independent resume action");
assert.ok(html.includes('if(pending?accountState!=="deleting":accountState!=="active"'),
  "resume allowed only for confirmed pending accounts");
assert.ok(html.includes('if(!confirmed&&user){try{await load()}'),
  "ambiguous deletion outcomes must refresh server state");

const script = match[1];
const stateStart = script.indexOf("function setAccountState(state){");
const stateEnd = script.indexOf("\nasync function load(){", stateStart);
assert.ok(stateStart > 0 && stateEnd > stateStart, "status renderer not found");
const renderer = script.slice(stateStart, stateEnd);

function statusNodes() {
  const nodes = new Map();
  return {
    $: (selector) => {
      if (!nodes.has(selector)) {
        const classes = new Set();
        nodes.set(selector, {
          classList: {
            toggle: (key, force) => { if (force) classes.add(key); else classes.delete(key); },
            remove: (key) => { classes.delete(key); },
            contains: (key) => classes.has(key),
          },
        });
      }
      return nodes.get(selector);
    },
  };
}
const fake = statusNodes();
const context = vm.createContext({ accountState: "loading", $: fake.$ });
vm.runInContext(renderer, context);

vm.runInContext('setAccountState("deleting")', context);
for (const id of ["#travelHero","#residencePanel","#travelPanels","#myAccount"]) {
  assert.ok(fake.$(id).classList.contains("hidden"), id + " must hide when deleting");
}
assert.equal(fake.$("#deletionPending").classList.contains("hidden"), false,
  "pending deletion banner must show");
assert.ok(fake.$("#accountStatusUnavailable").classList.contains("hidden"),
  "unavailable banner should be hidden for deleting");

vm.runInContext('setAccountState("unavailable")', context);
assert.ok(!fake.$("#accountStatusUnavailable").classList.contains("hidden"),
  "unknown account status must be visible");
for (const id of ["#travelHero","#residencePanel","#travelPanels","#myAccount"]) {
  assert.ok(fake.$(id).classList.contains("hidden"), id + " must fail closed");
}

vm.runInContext('setAccountState("active")', context);
for (const id of ["#travelHero","#residencePanel","#travelPanels","#myAccount"]) {
  assert.ok(!fake.$(id).classList.contains("hidden"), id + " should reopen for active account");
}
assert.ok(fake.$("#deletionPending").classList.contains("hidden"),
  "pending banner must hide for active account");

console.log("BEAM account pending-deletion UI transitions: PASS");

console.log("BEAM account deletion UI contract and JS syntax: PASS");
