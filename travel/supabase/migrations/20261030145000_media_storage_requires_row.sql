-- DRAFT ONLY: do not apply before review. No cron, no destructive DDL.
-- Require an owned media reservation with the same Storage object path.
drop policy if exists "storage ajouter" on storage.objects;
create policy "storage ajouter" on storage.objects for insert to authenticated with check(
 bucket_id='media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and public.trip_accepts_writes(
   auth.uid(),
   case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid else null end
) and exists (
   select 1 from public.media m
   where m.storage_path=name and m.user_id=auth.uid()
)
);
