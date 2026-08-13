-- Pereira Unida — migraciones pendientes (idempotente)
-- Fotos, estados comunitarios e ubicación exacta en Familia.

alter table public.reports
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists lat float8;

alter table public.people_status
  add column if not exists lng float8;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status in (
    'buscando',
    'en_camino',
    'resuelto',
    'informacion_falsa',
    'duplicado'
  ));

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
  using (bucket_id = 'community-photos');

drop policy if exists "community_photos_insert" on storage.objects;
create policy "community_photos_insert"
  on storage.objects for insert
  with check (bucket_id = 'community-photos');

-- Recalibración WGS84 + confirmación de reportes
update public.reports
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;

update public.collection_points
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;

update public.people_status
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;

alter table public.reports
  add column if not exists last_confirmed_at timestamptz;

update public.reports
set last_confirmed_at = created_at
where last_confirmed_at is null;
