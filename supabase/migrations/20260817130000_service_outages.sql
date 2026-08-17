-- Daños de servicios públicos (postes, energía, agua, gas, internet).
-- Select público para el mapa; escritura solo por Server Actions (service role).

create table if not exists public.service_outages (
  id           uuid primary key default gen_random_uuid(),
  service      text not null check (service in ('energia', 'poste', 'agua', 'gas', 'internet')),
  description  text not null default '',
  address      text not null default '',
  municipality text not null default 'Pereira',
  department   text not null default 'Risaralda',
  contact      text not null default '',
  photo_urls   text[] not null default '{}',
  lat          float8,
  lng          float8,
  status       text not null default 'reportado' check (status in ('reportado', 'en_atencion', 'resuelto')),
  created_at   timestamptz not null default now()
);

create index if not exists service_outages_status_idx on public.service_outages (status);
create index if not exists service_outages_service_idx on public.service_outages (service);
create index if not exists service_outages_municipality_idx on public.service_outages (municipality);
create index if not exists service_outages_department_idx on public.service_outages (department);
create index if not exists service_outages_created_at_idx on public.service_outages (created_at desc);

alter table public.service_outages enable row level security;

drop policy if exists "service_outages_select_public" on public.service_outages;
create policy "service_outages_select_public"
  on public.service_outages for select
  using (true);

alter table public.service_outages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.service_outages;
exception
  when duplicate_object then null;
end $$;
