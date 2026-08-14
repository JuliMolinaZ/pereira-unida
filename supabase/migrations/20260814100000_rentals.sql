-- Viviendas en arriendo. Pines propios, no mezclados con pedidos de ayuda.

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
