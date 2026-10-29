-- BEAM Travel History V1 — privilege regression checks
-- Run after schema migrations. Every assertion below must remain true.

do $$
begin
  if has_column_privilege('authenticated','public.profiles','deleting','UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can UPDATE profiles.deleting';
  end if;
  if has_column_privilege('authenticated','public.profiles','deletion_requested_at','UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can UPDATE profiles.deletion_requested_at';
  end if;
  if has_column_privilege('authenticated','public.profiles','public_code','UPDATE') then
    raise exception 'SECURITY REGRESSION: authenticated can UPDATE profiles.public_code';
  end if;
  if has_table_privilege('authenticated','public.profiles','INSERT') then
    raise exception 'SECURITY REGRESSION: authenticated can INSERT profiles';
  end if;
  if has_table_privilege('authenticated','public.profiles','DELETE') then
    raise exception 'SECURITY REGRESSION: authenticated can DELETE profiles';
  end if;
end
$$;

-- Positive control for staging:
-- authenticated must still have UPDATE on the user-editable columns.
select
  has_column_privilege('authenticated','public.profiles','display_name','UPDATE') as can_update_display_name,
  has_column_privilege('authenticated','public.profiles','nationality','UPDATE') as can_update_nationality,
  has_column_privilege('authenticated','public.profiles','home_city','UPDATE') as can_update_home_city;
