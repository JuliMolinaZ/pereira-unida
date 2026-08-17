-- ============================================================================
-- MIGRACIÓN — Balance "Falta / Sobra" en centros de acopio (2026-08-17)
--
-- collection_points.supplies_needed ya existía (qué le falta). Se agrega
-- supplies_surplus (qué le sobra) para poder mostrar un indicador rápido por
-- centro y evitar que se sigan mandando donaciones de algo que ya no hace
-- falta. Idempotente.
-- ============================================================================

alter table public.collection_points
  add column if not exists supplies_surplus text[] not null default '{}';
