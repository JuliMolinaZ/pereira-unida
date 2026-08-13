-- Estados comunitarios: info falsa / duplicado, además del flujo de ayuda.
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status in (
    'buscando',
    'en_camino',
    'resuelto',
    'informacion_falsa',
    'duplicado'
  ));
