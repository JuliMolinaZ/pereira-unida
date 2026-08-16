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
  category       text not null check (category in (
                   'alimentos', 'herramientas', 'medicinas', 'voluntariado', 'otros',
                   'herramientas_rescate', 'conectividad_energia', 'mascotas',
                   'revision_ingenieria', 'transporte_logistica'
                 )),
  urgent_level   text not null default 'moderado' check (urgent_level in ('critico', 'moderado', 'atendido')),
  status         text not null default 'buscando' check (status in (
                   'buscando', 'en_camino', 'resuelto', 'informacion_falsa', 'duplicado'
                 )),
  municipality   text not null default 'Pereira',
  department     text not null default 'Risaralda',
  location_name  text not null,
  lat            float8,
  lng            float8,
  contact_phone  text not null,
  created_at     timestamptz not null default now(),
  last_confirmed_at timestamptz,
  photo_urls     text[] not null default '{}'
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_category_idx on public.reports (category);
create index if not exists reports_urgent_level_idx on public.reports (urgent_level);
create index if not exists reports_municipality_idx on public.reports (municipality);
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
-- Tabla: people_status (Módulo "Estoy Bien" / Red de búsqueda familiar)
-- ----------------------------------------------------------------------------
create table if not exists public.people_status (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (char_length(trim(full_name)) > 0),
  document_id    text,
  municipality   text not null,
  department     text not null default 'Risaralda',
  neighborhood   text not null,
  lat            float8,
  lng            float8,
  status         text not null check (status in ('a_salvo', 'necesito_traslado', 'sin_conexion')),
  contact_number text not null,
  created_at     timestamptz not null default now()
);

create index if not exists people_status_full_name_idx on public.people_status (full_name);
create index if not exists people_status_document_id_idx on public.people_status (document_id);
create index if not exists people_status_municipality_idx on public.people_status (municipality);
create index if not exists people_status_created_at_idx on public.people_status (created_at desc);

alter table public.people_status enable row level security;

create policy "people_status_select_public"
  on public.people_status for select
  using (true);

create policy "people_status_insert_public"
  on public.people_status for insert
  with check (true);

-- ----------------------------------------------------------------------------
-- Realtime: publicar cambios de reports, comments y people_status a los
-- clientes suscritos
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.people_status;

-- Los centros de acopio se crean desde la app (PIN + pin en el mapa).
-- No sembrar puntos de ejemplo.

-- ============================================================================
-- MIGRACIÓN — Dosquebradas + módulos de emergencia (2026-08-12)
--
-- Idempotente: seguro de ejecutar sobre una base de datos donde el bloque
-- anterior ya fue aplicado (los `create table if not exists` no alteran
-- tablas existentes). Pegar y ejecutar solo esta sección en el SQL Editor
-- si `public.reports` ya existía antes de este cambio.
-- ============================================================================

-- 1. Columna municipality en reports
alter table public.reports
  add column if not exists municipality text not null default 'Pereira';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_municipality_check'
  ) then
    alter table public.reports
      add constraint reports_municipality_check
      check (municipality in ('Pereira', 'Dosquebradas'));
  end if;
end $$;

create index if not exists reports_municipality_idx on public.reports (municipality);

-- 2. Nuevas categorías de emergencia en reports
alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports
  add constraint reports_category_check
  check (category in (
    'alimentos', 'herramientas', 'medicinas', 'voluntariado', 'otros',
    'herramientas_rescate', 'conectividad_energia', 'mascotas',
    'revision_ingenieria', 'transporte_logistica'
  ));

-- 3. Tabla people_status (Módulo "Estoy Bien")
create table if not exists public.people_status (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (char_length(trim(full_name)) > 0),
  document_id    text,
  municipality   text not null,
  department     text not null default 'Risaralda',
  neighborhood   text not null,
  lat            float8,
  lng            float8,
  status         text not null check (status in ('a_salvo', 'necesito_traslado', 'sin_conexion')),
  contact_number text not null,
  created_at     timestamptz not null default now()
);

create index if not exists people_status_full_name_idx on public.people_status (full_name);
create index if not exists people_status_document_id_idx on public.people_status (document_id);
create index if not exists people_status_municipality_idx on public.people_status (municipality);
create index if not exists people_status_created_at_idx on public.people_status (created_at desc);

alter table public.people_status enable row level security;

drop policy if exists "people_status_select_public" on public.people_status;
create policy "people_status_select_public"
  on public.people_status for select
  using (true);

drop policy if exists "people_status_insert_public" on public.people_status;
create policy "people_status_insert_public"
  on public.people_status for insert
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.people_status;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- MIGRACIÓN 2 — Red familiar (actualizar estado) + Acopio en Dosquebradas
-- (2026-08-13)
--
-- Idempotente: seguro de re-ejecutar. Pegar y ejecutar solo este bloque si
-- las migraciones anteriores de este archivo ya se aplicaron.
-- ============================================================================

-- 1. Permitir que people_status.status se actualice desde el cliente (anon).
--    Sin autenticación: el "dueño" de un registro es quien tiene su id
--    guardado en su propio dispositivo (localStorage). No se puede tocar
--    full_name/document_id/contact_number desde updatePersonStatus (eso lo
--    aplica el server action, no esta policy — la policy solo controla
--    quién puede intentar el UPDATE, no qué columnas cambia el cliente).
drop policy if exists "people_status_update_public" on public.people_status;
create policy "people_status_update_public"
  on public.people_status for update
  using (true)
  with check (true);

-- 2. Columna municipality en collection_points (los centros de acopio
--    ahora también pueden estar en Dosquebradas).
alter table public.collection_points
  add column if not exists municipality text not null default 'Pereira';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'collection_points_municipality_check'
  ) then
    alter table public.collection_points
      add constraint collection_points_municipality_check
      check (municipality in ('Pereira', 'Dosquebradas'));
  end if;
end $$;

create index if not exists collection_points_municipality_idx
  on public.collection_points (municipality);

-- 3. Municipio de los CAFE / Banco de Alimentos (idempotente).
update public.collection_points
  set municipality = 'Pereira'
  where name like 'CAFE %';

update public.collection_points
  set municipality = 'Dosquebradas'
  where name like 'Banco de Alimentos%';

-- 5. OPCIONAL — solo si configuraste SUPABASE_SERVICE_ROLE_KEY (ver
--    .env.local.example). En ese caso createCollectionPoint ya inserta con
--    la service role (bypassa RLS) y el PIN del server es la única puerta,
--    así que puedes cerrar el insert público con la anon key ejecutando
--    esta línea A MANO (no se ejecuta automáticamente):
--
--    drop policy if exists "collection_points_insert_public" on public.collection_points;
--
--    Si NO configuraste la service role, NO ejecutes esto: seguiría
--    dejando el insert abierto a la anon key (documentado en README).

-- ============================================================================
-- MIGRACIÓN 3 — Fotos (Supabase Storage, bucket público community-photos)
-- (2026-08-13)
-- ============================================================================

alter table public.reports
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists lat float8;

alter table public.people_status
  add column if not exists lng float8;

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

-- ============================================================================
-- MIGRACIÓN 4 — Coordenadas WGS84 + confirmación de reportes
-- (2026-08-13)
-- ============================================================================

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

create index if not exists reports_last_confirmed_at_idx
  on public.reports (last_confirmed_at desc);

-- ============================================================================
-- MIGRACIÓN 5 — Vías cerradas (2026-08-13)
-- ============================================================================

create table if not exists public.closed_roads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) > 0),
  reason       text not null default 'otro' check (reason in (
                 'derrumbe', 'inundacion', 'arbol', 'hundimiento', 'bloqueo', 'otro'
               )),
  note         text not null default '',
  municipality text not null default 'Pereira',
  department   text not null default 'Risaralda',
  path         jsonb not null,
  status       text not null default 'cerrada' check (status in ('cerrada', 'reabierta')),
  created_at   timestamptz not null default now()
);

create index if not exists closed_roads_status_idx on public.closed_roads (status);
create index if not exists closed_roads_municipality_idx on public.closed_roads (municipality);
create index if not exists closed_roads_created_at_idx on public.closed_roads (created_at desc);

alter table public.closed_roads enable row level security;

drop policy if exists "closed_roads_select_public" on public.closed_roads;
create policy "closed_roads_select_public"
  on public.closed_roads for select
  using (true);

drop policy if exists "closed_roads_insert_public" on public.closed_roads;
create policy "closed_roads_insert_public"
  on public.closed_roads for insert
  with check (true);

drop policy if exists "closed_roads_update_public" on public.closed_roads;
create policy "closed_roads_update_public"
  on public.closed_roads for update
  using (true)
  with check (true);

alter table public.closed_roads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.closed_roads;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- MIGRACIÓN 6 — Ofertas de ayuda (2026-08-13)
-- ============================================================================

create table if not exists public.help_offers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (char_length(trim(full_name)) > 0),
  skill        text not null check (skill in (
                 'psicologia', 'medico', 'enfermeria', 'rescate', 'ingenieria',
                 'transporte', 'oficios', 'legal', 'alimentacion', 'otro'
               )),
  description  text not null default '',
  phone        text not null check (char_length(trim(phone)) > 0),
  municipality text not null default 'Pereira',
  department   text not null default 'Risaralda',
  status       text not null default 'activa' check (status in ('activa', 'ocultada')),
  created_at   timestamptz not null default now()
);

create index if not exists help_offers_status_idx on public.help_offers (status);
create index if not exists help_offers_skill_idx on public.help_offers (skill);
create index if not exists help_offers_municipality_idx on public.help_offers (municipality);
create index if not exists help_offers_created_at_idx on public.help_offers (created_at desc);

alter table public.help_offers enable row level security;

drop policy if exists "help_offers_select_public" on public.help_offers;
create policy "help_offers_select_public"
  on public.help_offers for select
  using (true);

drop policy if exists "help_offers_insert_public" on public.help_offers;
create policy "help_offers_insert_public"
  on public.help_offers for insert
  with check (true);

drop policy if exists "help_offers_update_public" on public.help_offers;
create policy "help_offers_update_public"
  on public.help_offers for update
  using (true)
  with check (true);

alter table public.help_offers replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.help_offers;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- MIGRACIÓN 7 — Zonas de Colombia (2026-08-13)
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select con.conname, cls.relname
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname in (
        'reports', 'collection_points', 'people_status', 'closed_roads', 'help_offers'
      )
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%municipality%'
      and pg_get_constraintdef(con.oid) ilike '%Pereira%'
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.reports
  add column if not exists department text not null default 'Risaralda';
alter table public.collection_points
  add column if not exists department text not null default 'Risaralda';
alter table public.people_status
  add column if not exists department text not null default 'Risaralda';
alter table public.closed_roads
  add column if not exists department text not null default 'Risaralda';
alter table public.help_offers
  add column if not exists department text not null default 'Risaralda';

create index if not exists reports_department_idx on public.reports (department);
create index if not exists collection_points_department_idx on public.collection_points (department);
create index if not exists people_status_department_idx on public.people_status (department);
create index if not exists closed_roads_department_idx on public.closed_roads (department);
create index if not exists help_offers_department_idx on public.help_offers (department);

-- ----------------------------------------------------------------------------
-- Tabla: rentals (viviendas en arriendo)
-- ----------------------------------------------------------------------------
create table if not exists public.rentals (
  id            uuid primary key default gen_random_uuid(),
  municipality  text not null default 'Pereira',
  department    text not null default 'Risaralda',
  neighborhood  text not null default '',
  address       text not null check (char_length(trim(address)) > 0),
  property_type text not null check (char_length(trim(property_type)) > 0),
  furnished     boolean not null default false,
  contact       text not null check (char_length(trim(contact)) > 0),
  monthly_rent  integer,
  photo_urls    text[] not null default '{}',
  lat           float8,
  lng           float8,
  submitted_at  timestamptz,
  status        text not null default 'disponible' check (status in ('disponible', 'ocupada', 'ocultada')),
  created_at    timestamptz not null default now(),
  check (monthly_rent is null or monthly_rent > 0)
);

create index if not exists rentals_status_idx on public.rentals (status);
create index if not exists rentals_municipality_idx on public.rentals (municipality);
create index if not exists rentals_department_idx on public.rentals (department);
create index if not exists rentals_created_at_idx on public.rentals (created_at desc);

alter table public.rentals enable row level security;

drop policy if exists "rentals_select_public" on public.rentals;
create policy "rentals_select_public"
  on public.rentals for select
  using (true);

drop policy if exists "rentals_insert_public" on public.rentals;
create policy "rentals_insert_public"
  on public.rentals for insert
  with check (true);

drop policy if exists "rentals_update_public" on public.rentals;
create policy "rentals_update_public"
  on public.rentals for update
  using (true)
  with check (true);

alter table public.rentals replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rentals;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Tabla: rental_comments
-- ----------------------------------------------------------------------------
create table if not exists public.rental_comments (
  id           uuid primary key default gen_random_uuid(),
  rental_id    uuid not null references public.rentals (id) on delete cascade,
  author_name  text not null default 'Anónimo',
  content      text not null check (char_length(trim(content)) > 0),
  created_at   timestamptz not null default now()
);

create index if not exists rental_comments_rental_id_idx on public.rental_comments (rental_id);
create index if not exists rental_comments_created_at_idx on public.rental_comments (created_at asc);

alter table public.rental_comments enable row level security;

drop policy if exists "rental_comments_select_public" on public.rental_comments;
create policy "rental_comments_select_public"
  on public.rental_comments for select
  using (true);

drop policy if exists "rental_comments_insert_public" on public.rental_comments;
create policy "rental_comments_insert_public"
  on public.rental_comments for insert
  with check (true);

alter table public.rental_comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rental_comments;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Migración: 20260817000000_external_sources.sql
-- Fuentes externas sincronizadas (Ayudas Pereira, Corag, Pereira Responde).
-- Solo select público: las llena app/api/cron/sync-external con la service
-- role key, no el navegador. Ver el archivo de migración para el detalle.
-- ----------------------------------------------------------------------------

create table if not exists public.external_centros (
  id           text primary key,
  fuente       text not null default 'ayudas_pereira',
  external_id  text not null,
  nombre       text not null,
  direccion    text,
  municipality text,
  lat          float8,
  lng          float8,
  abierto      boolean not null default true,
  foto         text,
  necesidades  jsonb not null default '[]',
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists external_centros_fuente_idx on public.external_centros (fuente);
create index if not exists external_centros_municipality_idx on public.external_centros (municipality);

alter table public.external_centros enable row level security;

drop policy if exists "external_centros_select_public" on public.external_centros;
create policy "external_centros_select_public"
  on public.external_centros for select
  using (true);

alter table public.external_centros replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.external_centros;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.external_ayudas (
  id                text primary key,
  fuente            text not null default 'corag',
  external_id       text not null,
  tipo              text not null check (tipo in ('request', 'offer')),
  title             text not null,
  description       text,
  category          text,
  urgency           text,
  status            text,
  address           text,
  municipality      text,
  lat               float8,
  lng               float8,
  contact_name      text,
  contact_whatsapp  text,
  public_url        text,
  created_at_source timestamptz,
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists external_ayudas_fuente_idx on public.external_ayudas (fuente);
create index if not exists external_ayudas_tipo_idx on public.external_ayudas (tipo);

alter table public.external_ayudas enable row level security;

drop policy if exists "external_ayudas_select_public" on public.external_ayudas;
create policy "external_ayudas_select_public"
  on public.external_ayudas for select
  using (true);

alter table public.external_ayudas replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.external_ayudas;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.external_afectaciones (
  id                text primary key,
  fuente            text not null default 'pereira_responde',
  external_id       text not null,
  tipo              text not null check (tipo in ('housing', 'road', 'support')),
  gravedad          text,
  title             text not null,
  subtipo           text,
  nota              text,
  lat               float8,
  lng               float8,
  photo_count       integer not null default 0,
  votes             integer not null default 0,
  score             integer not null default 0,
  created_at_source timestamptz,
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists external_afectaciones_tipo_idx on public.external_afectaciones (tipo);

alter table public.external_afectaciones enable row level security;

drop policy if exists "external_afectaciones_select_public" on public.external_afectaciones;
create policy "external_afectaciones_select_public"
  on public.external_afectaciones for select
  using (true);

alter table public.external_afectaciones replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.external_afectaciones;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.external_sync_state (
  fuente          text primary key,
  last_synced_at  timestamptz,
  syncing_since   timestamptz,
  last_error      text
);

insert into public.external_sync_state (fuente)
values ('ayudas_pereira'), ('corag'), ('pereira_responde')
on conflict (fuente) do nothing;

alter table public.external_sync_state enable row level security;
