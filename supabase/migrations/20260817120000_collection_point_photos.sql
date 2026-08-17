-- Fotos y descripción en centros de acopio publicados por la gente.

alter table public.collection_points
  add column if not exists photo_urls text[] not null default '{}';

alter table public.collection_points
  add column if not exists description text not null default '';

-- Por si alguna base todavía limita acopio a Pereira/Dosquebradas.
alter table public.collection_points
  drop constraint if exists collection_points_municipality_check;
