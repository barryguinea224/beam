-- BTH · récupération d'un compte avec e-mail perdu
-- Migration idempotente à lancer exclusivement dans le SQL Editor en rôle postgres.
-- Ni nouvelle inscription, ni suppression/recréation du compte, ni clé API.
-- Les comptes voyages, media et carnets conservent leur UUID auth.users.
create schema if not exists private;

create table if not exists private.account_email_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  old_email text not null,
  new_email text not null,
  reason text not null constraint account_email_changes_reason_length
    check (char_length(btrim(reason)) between 10 and 300),
  changed_at timestamptz not null default now(),
  changed_by text not null default current_user
);
create index if not exists account_email_changes_user_date_idx
  on private.account_email_changes(user_id,changed_at desc);
create index if not exists account_email_changes_old_idx
  on private.account_email_changes(lower(old_email));
create index if not exists account_email_changes_new_idx
  on private.account_email_changes(lower(new_email));

-- Double protection : pas de politiques RLS et aucun droit aux rôles web,
-- y compris service_role. Ne PAS révoquer USAGE sur tout le schéma private :
-- les politiques RLS existantes de BTH utilisent ses fonctions internes.
alter table private.account_email_changes enable row level security;
revoke all on table private.account_email_changes from public,anon,authenticated,service_role;
grant all on table private.account_email_changes to postgres;

-- Vérification explicite de la forme de schéma Auth de cette version Supabase.
-- Faire échouer la migration si le fournisseur fait évoluer ces colonnes.
do $schema_check$
declare required_count integer;
begin
 select count(*) into required_count
 from information_schema.columns
 where (table_schema,table_name,column_name) in (
  ('auth','users','id'),('auth','users','email'),
  ('auth','users','email_confirmed_at'),('auth','users','updated_at'),
  ('auth','identities','id'),('auth','identities','user_id'),
  ('auth','identities','provider'),('auth','identities','provider_id'),
  ('auth','identities','identity_data'),('auth','identities','updated_at'),
  ('auth','sessions','user_id'),
  ('auth','refresh_tokens','user_id'));
 if required_count<>12 then
  raise exception using errcode='0A000',
    message='BEAM_AUTH_SCHEMA_INCOMPATIBLE',
    detail='Schéma Supabase Auth différent : interrompre et vérifier auth.users, auth.identities, auth.sessions et auth.refresh_tokens.';
 end if;
end $schema_check$;

create or replace function private.beam_change_client_email(
 p_old_email text,p_new_email text,p_reason text
) returns text
language plpgsql volatile security definer set search_path=''
as $fn$
declare
 v_old text := lower(btrim(coalesce(p_old_email,''),E' \t\n\r'));
 v_new text := lower(btrim(coalesce(p_new_email,''),E' \t\n\r'));
 v_reason text := btrim(coalesce(p_reason,''),E' \t\n\r');
 v_uid uuid;
 v_display text;
 v_deleting boolean;
 v_identities integer;
 v_emails_taken boolean;
begin
 -- Aucune connexion par anon, authenticated ou service_role ne peut passer
 -- le contrôle de droits. SECURITY DEFINER accède à Auth uniquement
 -- sous le propriétaire postgres, pas sous le client.
 if length(v_old)>254 or length(v_new)>254 or
    v_old !~ '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    or v_new !~ '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    or position('..' in v_old)>0 or position('..' in v_new)>0 then
   raise exception using errcode='22023',
    message='BEAM_EMAIL_FORMAT_INVALIDE',
    detail='Saisissez deux adresses e-mail valides (sans espaces, en minuscules après normalisation).';
 end if;
 if v_old=v_new then
   raise exception using errcode='22023',message='BEAM_EMAIL_IDENTIQUE',
    detail='L’ancienne et la nouvelle adresse sont identiques.';
 end if;
 if char_length(v_reason)<10 or char_length(v_reason)>300 then
   raise exception using errcode='22023',message='BEAM_MOTIF_INVALIDE',
    detail='Le motif de vérification en personne doit contenir entre 10 et 300 caractères.';
 end if;

 -- Un seul compte, verrouillé : prévient une récupération concurrente du même
 -- identifiant. On ne change jamais auth.users.id.
 select u.id into v_uid from auth.users u
  where lower(btrim(u.email))=v_old
  for update;
 if not found then
   raise exception using errcode='P0002',message='BEAM_ANCIEN_EMAIL_INTROUVABLE',
     detail='Aucun compte n’utilise cet ancien e-mail.';
 end if;

 select p.display_name,p.deleting into v_display,v_deleting
  from public.profiles p where p.id=v_uid for update;
 if not found then
   raise exception using errcode='P0002',message='BEAM_PROFIL_INTROUVABLE',
    detail='Le profil correspondant est absent. Ne pas recréer le compte.';
 end if;
 if v_deleting then
   raise exception using errcode='23514',message='BEAM_COMPTE_EN_SUPPRESSION',
    detail='Un compte en cours de suppression ne peut pas être récupéré.';
 end if;

 select exists(
  select 1 from auth.users u where lower(btrim(u.email))=v_new and u.id<>v_uid
 ) or exists(
  select 1 from auth.identities i where i.provider='email'
    and lower(coalesce(i.identity_data->>'email',''))=v_new
    and i.user_id<>v_uid
 ) into v_emails_taken;
 if v_emails_taken then
   raise exception using errcode='23505',message='BEAM_NOUVEL_EMAIL_DEJA_UTILISE',
     detail='Cette adresse appartient déjà à un autre compte.';
 end if;

 -- Dans Supabase, provider='email' utilise normalement provider_id = UUID
 -- de l’utilisateur (ne PAS le remplacer par l’adresse). Compatibilité :
 -- l’actualiser uniquement si la base historique l’avait mis à l’ancien e-mail.
 select count(*) into v_identities from auth.identities i
  where i.user_id=v_uid and i.provider='email'
    and lower(coalesce(i.identity_data->>'email',''))=v_old;
 if v_identities<>1 then
   raise exception using errcode='23514',message='BEAM_IDENTITE_EMAIL_INCOHERENTE',
     detail='Une identité e-mail existante et cohérente est requise. Ne modifier aucune table manuellement.';
 end if;

 update auth.users set
  email=v_new,email_confirmed_at=now(),updated_at=now()
 where id=v_uid;

 update auth.identities i set
  identity_data=jsonb_set(coalesce(i.identity_data,'{}'::jsonb),
                          '{email}',to_jsonb(v_new),true),
  provider_id=case when i.provider_id=v_old then v_new else i.provider_id end,
  updated_at=now()
 where i.user_id=v_uid and i.provider='email'
   and lower(coalesce(i.identity_data->>'email',''))=v_old;
 get diagnostics v_identities=row_count;
 if v_identities<>1 then
   raise exception using errcode='23514',message='BEAM_IDENTITE_NON_MISE_A_JOUR';
 end if;

 -- Les sessions v2 utilisent auth.sessions ; les sessions historiques
 -- peuvent en outre avoir des lignes dans auth.refresh_tokens.
 delete from auth.refresh_tokens where user_id=v_uid::text;
 delete from auth.sessions where user_id=v_uid;

 insert into private.account_email_changes
   (user_id,old_email,new_email,reason,changed_by)
 values(v_uid,v_old,v_new,v_reason,current_user);

 return format('E-mail changé pour %s : %s → %s. Toutes les sessions ont été fermées.',
  coalesce(nullif(btrim(v_display),''),'ce client'),v_old,v_new);
 -- Aucune interception d’exception : PostgreSQL annule toute l’instruction
 -- (users, identities, sessions, refresh_tokens et audit) à la moindre erreur.
end
$fn$;

create or replace function private.beam_email_change_history(p_email text)
returns table (
 id uuid,user_id uuid,old_email text,new_email text,
 reason text,changed_at timestamptz,changed_by text
)
language plpgsql stable security definer set search_path=''
as $history$
declare
 v_email text := lower(btrim(coalesce(p_email,''),E' \t\n\r'));
 v_users uuid[];
begin
 if v_email='' then
  raise exception using errcode='22023',message='BEAM_EMAIL_REQUIS';
 end if;
 -- Retrouve toutes les étapes d’historique d’un même UUID, même si
 -- l’e-mail recherché est une adresse ancienne ou intermédiaire.
 select array_agg(distinct matches.uid) into v_users
 from (
  select u.id as uid from auth.users u where lower(btrim(u.email))=v_email
  union all
  select h.user_id as uid from private.account_email_changes h
  where h.old_email=v_email or h.new_email=v_email
 ) as matches;
 if coalesce(cardinality(v_users),0)>1 then
  raise exception using errcode='22023',message='BEAM_HISTORIQUE_EMAIL_AMBIGU',
    detail='Cette adresse a été utilisée par plusieurs comptes; faire une vérification manuelle par UUID.';
 end if;
 if coalesce(cardinality(v_users),0)=0 then
  raise exception using errcode='P0002',message='BEAM_HISTORIQUE_EMAIL_INTROUVABLE';
 end if;
 return query
  select h.id,h.user_id,h.old_email,h.new_email,h.reason,h.changed_at,h.changed_by
  from private.account_email_changes h
  where h.user_id=v_users[1]
  order by h.changed_at,h.id;
end
$history$;

-- Dans une migration antérieure, CREATE OR REPLACE ne remplace pas forcément
-- le propriétaire. Ces deux fonctions ne doivent appartenir qu'à postgres.
alter function private.beam_change_client_email(text,text,text) owner to postgres;
alter function private.beam_email_change_history(text) owner to postgres;

revoke all on function private.beam_change_client_email(text,text,text)
 from public,anon,authenticated,service_role;
revoke all on function private.beam_email_change_history(text)
 from public,anon,authenticated,service_role;
grant execute on function private.beam_change_client_email(text,text,text) to postgres;
grant execute on function private.beam_email_change_history(text) to postgres;
