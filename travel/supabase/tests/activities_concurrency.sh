#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=postgres
psql_cmd=(psql -h localhost -U postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" -f travel/supabase/tests/activities_concurrency_setup.sql
trip="b0000000-0000-4000-8000-000000000010"
uid="a0000000-0000-4000-8000-000000000010"
# Stop both inserts at the same trip lock with count 49. The second must
# observe the first commit and reject with ACTIVITY_LIMIT_REACHED.
"${psql_cmd[@]}" -c "begin; select id from public.trips where id='$trip' for update; select pg_sleep(2); commit;" >/tmp/beam-activity-parent-lock.log 2>&1 &
locker=$!
sleep 0.4
for n in 1 2; do
  "${psql_cmd[@]}" -c "insert into public.activities(trip_id,user_id,title) values('$trip','$uid','Concurrent activity $n');" >"/tmp/beam-activity-$n.log" 2>&1 &
  if [ "$n" = "1" ]; then one=$!; else two=$!; fi
done
wait "$locker"
successes=0
if wait "$one"; then successes=$((successes+1)); fi
if wait "$two"; then successes=$((successes+1)); fi
count=$("${psql_cmd[@]}" -tA -c "select count(*) from public.activities where trip_id='$trip'")
if [ "$successes" != "1" ] || [ "$count" != "50" ]; then
  echo "::error::Concurrent activities quota failed; accepted=$successes count=$count"
  cat /tmp/beam-activity-1.log /tmp/beam-activity-2.log
  exit 1
fi
if ! grep -q ACTIVITY_LIMIT_REACHED /tmp/beam-activity-1.log /tmp/beam-activity-2.log; then
  echo "::error::Rejected activity did not receive stable quota error"
  exit 1
fi
echo "PASS: two concurrent inserts at 49; accepted 1, refused 1, count=50"
