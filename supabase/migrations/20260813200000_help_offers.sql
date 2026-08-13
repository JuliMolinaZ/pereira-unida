-- Ofertas de ayuda (médicos, psicología, oficios, etc.).

create table if not exists public.help_offers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (char_length(trim(full_name)) > 0),
  skill        text not null check (skill in (
                 'psicologia', 'medico', 'enfermeria', 'rescate', 'ingenieria',
                 'transporte', 'oficios', 'legal', 'alimentacion', 'otro'
               )),
  description  text not null default '',
  phone        text not null check (char_length(trim(phone)) > 0),
  municipality text not null default 'Pereira' check (municipality in ('Pereira', 'Dosquebradas')),
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
