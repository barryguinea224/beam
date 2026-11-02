-- Supabase SQL Editor, admin only. Replace email and 1/2-year duration.
begin;
do $admin$
declare
 v_email text := 'REMPLACER_PAR_EMAIL_CLIENT';
 v_duration text := '1 year'; -- ONLY '1 year' or '2 years'
 v_uid uuid;
 v_until date;
 v_years integer;
begin
 if v_duration not in ('1 year','2 years') then raise exception 'DURATION_MUST_BE_1_OR_2_YEARS'; end if;
 v_years := case v_duration when '1 year' then 1 else 2 end;
 select id into strict v_uid from auth.users where lower(email)=lower(btrim(v_email));
 update public.profiles p
 set access_until=(greatest(current_date,coalesce(p.access_until,current_date))
   + make_interval(years=>v_years))::date
 where id=v_uid returning access_until into v_until;
 if not found then raise exception 'PROFILE_NOT_FOUND_FOR_EMAIL'; end if;
 raise notice 'Compte % prolongé jusqu’au %',v_email,v_until;
exception
 when no_data_found then raise exception 'EMAIL_NOT_FOUND';
 when too_many_rows then raise exception 'EMAIL_NOT_UNIQUE';
end $admin$;
commit;
-- Check:
-- select u.email,p.access_until,p.access_until>=current_date as writable
-- from auth.users u join public.profiles p on p.id=u.id
-- where lower(u.email)=lower('REMPLACER_PAR_EMAIL_CLIENT');
