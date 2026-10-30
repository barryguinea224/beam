-- Disposable test fixture for real simultaneous inserts. Runs on CI PostgreSQL only.
insert into auth.users(id) values ('30000000-0000-4000-8000-000000000010');
insert into public.trips(id,user_id,country_code,entry_date,exit_date,purpose)
values('40000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000010','GN','2022-01-01','2022-01-02','autre');
insert into public.media(id,trip_id,user_id,storage_path,kind,bytes)
select x.id,
 '40000000-0000-4000-8000-000000000010'::uuid,
 '30000000-0000-4000-8000-000000000010'::uuid,
 '30000000-0000-4000-8000-000000000010/40000000-0000-4000-8000-000000000010/'||x.id::text||'.webp',
 'photo',1024
from (select gen_random_uuid() as id from generate_series(1,9)) x;
