-- ----------------------------------------------------------------------------
-- Fuentes externas sincronizadas (Ayudas Pereira, Corag, Pereira Responde).
--
-- Estas tablas NO se escriben desde el navegador: las llena
-- app/api/cron/sync-external/route.ts con la service role key (bypassa RLS a
-- propósito, igual que createCollectionPoint). Por eso solo hay policy de
-- select público, sin insert/update público — a diferencia de reports/rentals
-- que sí aceptan altas directas del cliente.
--
-- `id` lleva el prefijo de la fuente (ej. 'ayudas_pereira:<uuid>') para poder
-- hacer upsert por clave primaria sin una unique compuesta aparte.
-- ----------------------------------------------------------------------------

-- Centros de acopio de "Ayudas Pereira" (Supabase yjkyzfuixdpuhgthoeua).
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

-- Ayuda directa entre personas de Corag (ayuda.corag.app), tipo request u offer.
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

-- Daños estructurales y vías cerradas de Pereira Responde.
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

-- Candado de sincronización: sin Cron frecuente (plan Hobby de Vercel = 1x al
-- día), la sync la dispara el propio tráfico de la app (ver
-- lib/externalSync.ts). Esta tabla evita que cientos de visitas simultáneas
-- disparen la misma sincronización a la vez: se "reclama" con un UPDATE
-- atómico que solo un request puede ganar.
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

-- Sin policy de select/insert/update público a propósito: esta tabla es
-- operativa, no contenido; solo la toca la service role key desde el server.
