-- Severidad del daño de servicio: para que las cuadrillas prioricen peligro
-- de muerte (cable vivo, poste cayéndose) antes que cortes de sector o
-- fallas puntuales. Reportes existentes quedan como 'falla_puntual' (no se
-- asume peligro sobre datos viejos sin ese dato).

alter table public.service_outages
  add column if not exists severity text not null default 'falla_puntual'
    check (severity in ('peligro_critico', 'corte_sector', 'falla_puntual'));

create index if not exists service_outages_severity_idx on public.service_outages (severity);
