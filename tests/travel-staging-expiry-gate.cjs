"use strict";
// Non-secret checks: existing A/B staging test is allowed to RUN automatically,
// but expiration itself stays covered by disposable local SQL tests.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const wf=fs.readFileSync(".github/workflows/hostile-ab.yml","utf8");
const bench=fs.readFileSync("travel/supabase/tests/hostile_ab.ts","utf8");
const sql=fs.readFileSync("travel/supabase/STAGING_ACCESS_EXPIRY_SETUP.sql","utf8");
const doc=fs.readFileSync("travel/supabase/STAGING_HOSTILE_EXPIRY.md","utf8");
const local=wf.slice(wf.indexOf("  schema-parse:"),wf.indexOf("  hostile-ab:"));
const live=wf.slice(wf.indexOf("  hostile-ab:"));
assert.match(wf,/pull_request:\s*\n\s*branches: \[main, feature\/beam-travel-history-v1\]/);
assert.match(live,/environment: staging\s*\n/);
assert.match(live,/Run hostile A\/B bench against staging/);
assert.match(live,/SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets.STAGING_ANON_KEY \}\}/);
assert.doesNotMatch(live,/staging-destructive|STAGING_SERVICE_ROLE_KEY|staging_migration_applied/);
assert.match(live,/if: github.event_name != 'pull_request'/);
assert.doesNotMatch(bench,/STAGING_SERVICE_ROLE_KEY|auth.admin|const admin\s*=|testExpiredDisposable|setFixtureAccess|twoYearsOut/);
assert.match(bench,/const sa=await login\("A"/);
assert.match(bench,/const sb=await login\("B"/);
assert.match(bench,/\.from\("profiles"\)\s*\.select\("access_until"\)\.eq\("id",uid\)\.single\(\)/);
assert.match(bench,/await assertAccessValid\("A",A,sa.user.id\)/);
assert.match(bench,/await assertAccessValid\("B",B,sb.user.id\)/);
assert.match(bench,/Renouvelez son accès dans le SQL Editor staging/);
assert.ok(bench.indexOf('await assertAccessValid("B",B,sb.user.id)')<
 bench.indexOf('A.from("trips").insert(original)'),"Expiry preflight must precede all writes");
assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
assert.match(sql,/UPDATE public.profiles\s*\nSET access_until = \(CURRENT_DATE \+ INTERVAL '2 years'\)::date/);
assert.match(doc,/avant le 2 novembre 2028/);
assert.match(doc,/access_expiry_guards.sql/);
assert.match(doc,/automatique sur les PR/);
assert.match(local,/Canonical schema parses on clean Postgres/);
console.log("PASS auto staging A/B bench (no admin key); read-only date preflight; expiry stays in local SQL");
