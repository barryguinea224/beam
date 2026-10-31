-- Fixtures intentionally persisted ONLY in disposable CI PostgreSQL.
insert into auth.users(id) values('a0000000-0000-4000-8000-000000000010');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
('b0000000-0000-4000-8000-000000000010',
 'a0000000-0000-4000-8000-000000000010','FR','2026-01-10','2026-01-11','tourisme');
insert into public.activities(trip_id,user_id,title)
select 'b0000000-0000-4000-8000-000000000010'::uuid,
       'a0000000-0000-4000-8000-000000000010'::uuid,
       'Activité '||n
from generate_series(1,49) as n;
