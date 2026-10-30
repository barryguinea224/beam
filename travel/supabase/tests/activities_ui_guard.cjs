"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const html=fs.readFileSync("travel/index.html","utf8");
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline,{filename:"travel/index.html"});
assert.ok(inline.includes('error.code==="23514" && error.message?.includes("ACTIVITY_LIMIT_REACHED")'),
  "Quota breach should show actionable and specific message");
assert.ok(inline.includes("Limite de 50 activités atteinte pour ce voyage."),
  "Do not leave the user with a generic error at 50");
assert.ok(html.includes('id="detailActivityForm"'),
  "Title/place/optional date must remain a simple form");
assert.ok(inline.includes("window.confirm(\"Retirer cette activité du voyage ?\")"),
  "Deletion confirmation must remain");
const sql=fs.readFileSync("travel/supabase/migrations/20261030182500_activities_quota_50.sql","utf8");
assert.match(sql,/lock table public\.activities in share row exclusive mode/);
assert.match(sql,/ACTIVITY_QUOTA_ALREADY_EXCEEDED/);
assert.match(sql,/for update/);
assert.match(sql,/existing_count >= 50/);
assert.match(sql,/ACTIVITY_LIMIT_REACHED/);
assert.match(sql,/revoke execute on function public\.enforce_activity_quota\(\)/);
assert.match(sql,/from public,anon,authenticated/);
assert.match(sql,/tg_op='UPDATE' and new\.trip_id=old\.trip_id and new\.user_id=old\.user_id/);
assert.ok(!sql.includes("delete from public.activities"));
console.log("PASS: activity quota feedback, restricted trigger, preflight and no data deletion");
