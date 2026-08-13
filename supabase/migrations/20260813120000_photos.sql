-- ============================================================================
-- Pereira Unida — Fotos en reportes y red familiar
--
-- Bucket público de Supabase Storage (plan gratuito, CDN incluido) +
-- columna photo_urls. Idempotente.
-- ============================================================================

alter table public.reports
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists photo_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-photos',
  'community-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
