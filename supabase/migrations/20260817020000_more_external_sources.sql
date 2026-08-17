-- ============================================================================
-- MIGRACIÓN — Dos fuentes externas más: Pereira Ayuda y Reporte CO
-- (2026-08-17)
--
-- Reusa las tablas external_centros/external_ayudas/external_afectaciones
-- que ya existen (son genéricas por `fuente`) — solo hace falta sembrar la
-- fila de candado en external_sync_state para que el mecanismo atómico de
-- sincronización (ver lib/externalSync.ts) también cubra a estas dos.
-- Idempotente.
-- ============================================================================

insert into public.external_sync_state (fuente)
values ('pereira_ayuda'), ('reporte_co')
on conflict (fuente) do nothing;
