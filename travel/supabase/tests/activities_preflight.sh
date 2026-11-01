#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=postgres
psql_cmd=(psql -h localhost -U postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" -f travel/supabase/tests/activities_preflight_setup.sql
if "${psql_cmd[@]}" -f travel/supabase/migrations/20261030182500_activities_quota_50.sql >/tmp/beam-activities-preflight.log 2>&1; then
 echo "::error::Migration incorrectly accepted 51 pre-existing activities"; exit 1
fi
if ! grep -q 'ACTIVITY_QUOTA_ALREADY_EXCEEDED' /tmp/beam-activities-preflight.log; then
 echo "::error::Migration failed for wrong reason"; cat /tmp/beam-activities-preflight.log; exit 1
fi
count=$("${psql_cmd[@]}" -tA -c "select count(*) from public.activities where trip_id='b0000000-0000-4000-8000-000000000020'")
if [ "$count" != "51" ]; then
 echo "::error::Preflight modified pre-existing data: $count"; exit 1
fi
echo "PASS: atomic migration refused legacy 51; 51 records retained"
