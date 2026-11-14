-- J'y étais : réserver un voyage avant son départ sans élargir les droits.
-- A exécuter uniquement via la procédure de migration revue ; jamais schema.sql en production.
-- Idempotente : CREATE OR REPLACE conserve l'identité et les ACL de la vue.
begin;

create or replace function public.check_trip_dates()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.entry_date > (now() at time zone 'utc')::date + interval '2 years' then
    raise exception 'Un voyage ne peut pas commencer dans plus de deux ans.';
  end if;
  return new;
end $$;

create or replace view public.travel_history_pdf
with (security_invoker=true) as
select user_id,country_code,cities,entry_date,exit_date,duration_days,purpose
from public.trips
where not is_domestic and not deleting
  and exit_date < (now() at time zone 'utc')::date;

commit;
