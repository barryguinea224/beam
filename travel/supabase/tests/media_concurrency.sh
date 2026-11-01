#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=postgres
psql_cmd=(psql -h localhost -U postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" -f travel/supabase/tests/media_concurrency_setup.sql
trip="40000000-0000-4000-8000-000000000010"
uid="30000000-0000-4000-8000-000000000010"
# Hold the trip row lock so both inserts arrive while count=9.
"${psql_cmd[@]}" -c "begin; select id from public.trips where id='$trip' for update; select pg_sleep(2); commit;" >/tmp/beam-parent-lock.log 2>&1 &
locker=$!
sleep 0.3
for n in 1 2; do
  mid=$(printf '50000000-0000-4000-8000-%012d' "$n")
  "${psql_cmd[@]}" -c "insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
    values('$mid','$trip','$uid','$uid/$trip/$mid.webp','photo',1024)" >"/tmp/beam-photo-$n.log" 2>&1 &
  if [ "$n" = "1" ]; then one=$!; else two=$!; fi
done
wait "$locker"
successes=0
if wait "$one"; then successes=$((successes+1)); fi
if wait "$two"; then successes=$((successes+1)); fi
count=$("${psql_cmd[@]}" -tA -c "select count(*) from public.media where trip_id='$trip'")
if [ "$successes" != "1" ] || [ "$count" != "10" ]; then
  echo "::error::Concurrent quota failed, successes=$successes count=$count"
  cat /tmp/beam-photo-1.log /tmp/beam-photo-2.log
  exit 1
fi
echo "Concurrent photo quota: 1 accepted, 1 refused; final count=10 (PASS)"
