-- Policies públicas del bucket community-photos.
-- El bucket puede existir (creado por API) sin estas policies; sin ellas
-- el rol anon no puede subir. El server usa service role como respaldo.

drop policy if exists "community_photos_select" on storage.objects;
create policy "community_photos_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'community-photos');

drop policy if exists "community_photos_insert" on storage.objects;
create policy "community_photos_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'community-photos');

drop policy if exists "community_photos_update" on storage.objects;
create policy "community_photos_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'community-photos')
  with check (bucket_id = 'community-photos');
