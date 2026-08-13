-- ============================================================================
-- Pereira Unida — Migración: Dosquebradas, red familiar y acopio
--
-- Se aplica sobre 20260813000000_init.sql, que quedó desactualizada
-- (categorías viejas, sin `municipality`, sin `people_status`). Este
-- archivo NO reescribe esa migración: la complementa de forma idempotente,
-- así que es seguro ejecutarlo tanto si solo corriste el init original
-- como si ya aplicaste manualmente el bloque "MIGRACIÓN" de schema.sql.
--
-- Cómo aplicarlo:
--   supabase db push
--   (o pegar este archivo completo en el SQL Editor de Supabase)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. reports: columna municipality + categorías de emergencia nuevas
-- ----------------------------------------------------------------------------
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

alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports
  add constraint reports_category_check
  check (category in (
    'alimentos', 'herramientas', 'medicinas', 'voluntariado', 'otros',
    'herramientas_rescate', 'conectividad_energia', 'mascotas',
    'revision_ingenieria', 'transporte_logistica'
  ));

-- ----------------------------------------------------------------------------
-- 2. people_status: tabla del módulo "Estoy Bien" / red de búsqueda
--    familiar, con policy de UPDATE para que cada quien pueda actualizar
--    su propio estado (el "dueño" es quien guarda el id en su dispositivo,
--    ver localStorage "pereiraunida:my-status-ids" en FamilyStatusModal).
-- ----------------------------------------------------------------------------
create table if not exists public.people_status (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (char_length(trim(full_name)) > 0),
  document_id    text,
  municipality   text not null check (municipality in ('Pereira', 'Dosquebradas')),
  neighborhood   text not null,
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

drop policy if exists "people_status_update_public" on public.people_status;
create policy "people_status_update_public"
  on public.people_status for update
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.people_status;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. collection_points: columna municipality (Pereira/Dosquebradas)
-- ----------------------------------------------------------------------------
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

update public.collection_points
  set municipality = 'Pereira'
  where name like 'CAFE %';

update public.collection_points
  set municipality = 'Dosquebradas'
  where name like 'Banco de Alimentos%';

delete from public.collection_points
  where name in (
    'Cruz Roja Risaralda',
    'Coliseo Menor - Punto de Acopio',
    'Alcaldía de Dosquebradas — punto de acopio (verificar)'
  );

-- ----------------------------------------------------------------------------
-- 4. OPCIONAL — solo si configuraste SUPABASE_SERVICE_ROLE_KEY (ver
--    .env.local.example). createCollectionPoint inserta con la service
--    role cuando está presente, así que el PIN del server pasa a ser la
--    única puerta y puedes cerrar el insert público con la anon key
--    ejecutando esta línea A MANO (no se ejecuta automáticamente aquí):
--
--    drop policy if exists "collection_points_insert_public" on public.collection_points;
--
--    Si NO configuraste la service role, no la ejecutes: seguiría abierto
--    el insert a la anon key (documentado en README).
-- ----------------------------------------------------------------------------
