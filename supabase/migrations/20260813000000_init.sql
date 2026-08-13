-- ============================================================================
-- Pereira Unida — Esquema de base de datos (Supabase / PostgreSQL)
-- Coordinación ciudadana de ayuda tras una emergencia en Pereira.
--
-- Cómo aplicarlo:
--   1. Abrir el SQL Editor en el dashboard de Supabase.
--   2. Pegar y ejecutar este archivo completo (crea tablas, índices, RLS y
--      políticas, y habilita Realtime).
--
-- Modelo de seguridad (MVP de emergencia):
--   Lectura pública y escritura libre (sin autenticación) para que cualquier
--   persona pueda reportar o actualizar una necesidad de inmediato. No se
--   permite DELETE desde el cliente (sin política = bloqueado por RLS).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabla: reports
-- ----------------------------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(trim(title)) > 0),
  description    text not null default '',
  category       text not null check (category in ('alimentos', 'herramientas', 'medicinas', 'voluntariado', 'otros')),
  urgent_level   text not null default 'moderado' check (urgent_level in ('critico', 'moderado', 'atendido')),
  status         text not null default 'buscando' check (status in ('buscando', 'en_camino', 'resuelto')),
  location_name  text not null,
  lat            float8,
  lng            float8,
  contact_phone  text not null,
  created_at     timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_category_idx on public.reports (category);
create index if not exists reports_urgent_level_idx on public.reports (urgent_level);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

create policy "reports_select_public"
  on public.reports for select
  using (true);

create policy "reports_insert_public"
  on public.reports for insert
  with check (true);

create policy "reports_update_public"
  on public.reports for update
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Tabla: comments
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  author_name  text not null default 'Anónimo',
  content      text not null check (char_length(trim(content)) > 0),
  created_at   timestamptz not null default now()
);

create index if not exists comments_report_id_idx on public.comments (report_id);
create index if not exists comments_created_at_idx on public.comments (created_at asc);

alter table public.comments enable row level security;

create policy "comments_select_public"
  on public.comments for select
  using (true);

create policy "comments_insert_public"
  on public.comments for insert
  with check (true);

-- ----------------------------------------------------------------------------
-- Tabla: collection_points (Centros de Acopio)
-- ----------------------------------------------------------------------------
create table if not exists public.collection_points (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(trim(name)) > 0),
  address         text not null,
  supplies_needed text[] not null default '{}',
  open_hours      text not null default '',
  contact         text not null default '',
  lat             float8,
  lng             float8
);

alter table public.collection_points enable row level security;

create policy "collection_points_select_public"
  on public.collection_points for select
  using (true);

create policy "collection_points_insert_public"
  on public.collection_points for insert
  with check (true);

-- ----------------------------------------------------------------------------
-- Realtime: publicar cambios de reports y comments a los clientes suscritos
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.comments;

-- Los centros de acopio se crean desde la app (PIN + pin en el mapa).
