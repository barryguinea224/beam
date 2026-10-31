-- Simulates legacy over-quota records on disposable PostgreSQL only.
insert into auth.users(id) values('a0000000-0000-4000-8000-000000000020');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose) values
('b0000000-0000-4000-8000-000000000020',
 'a0000000-0000-4000-8000-000000000020','GN','2026-03-01','2026-03-02','autre');
alter table public.activities disable trigger activities_quota_before_write;
insert into public.activities(trip_id,user_id,title)
select 'b0000000-0000-4000-8000-000000000020'::uuid,
       'a0000000-0000-4000-8000-000000000020'::uuid,
       'Legacy activity '||n
from generate_series(1,51) as n;
alter table public.activities enable trigger activities_quota_before_write;
