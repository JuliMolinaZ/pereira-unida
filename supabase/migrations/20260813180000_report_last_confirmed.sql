-- Confirmación comunitaria: "¿Sigue activa esta necesidad?"
alter table public.reports
  add column if not exists last_confirmed_at timestamptz;

update public.reports
set last_confirmed_at = created_at
where last_confirmed_at is null;

create index if not exists reports_last_confirmed_at_idx
  on public.reports (last_confirmed_at desc);
