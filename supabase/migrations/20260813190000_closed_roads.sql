-- Vías cerradas / no transitables (líneas en el mapa).

create table if not exists public.closed_roads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(trim(name)) > 0),
  reason       text not null default 'otro' check (reason in (
                 'derrumbe', 'inundacion', 'arbol', 'hundimiento', 'bloqueo', 'otro'
               )),
  note         text not null default '',
  municipality text not null default 'Pereira' check (municipality in ('Pereira', 'Dosquebradas')),
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
