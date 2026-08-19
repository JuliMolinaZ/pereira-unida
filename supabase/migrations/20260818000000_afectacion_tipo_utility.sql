-- Pereira Responde empezó a mandar type "utility" (daño en servicios
-- públicos: acueducto, energía) además de housing/road/support. El check
-- constraint lo rechazaba y tumbaba el upsert completo del lote (183
-- reportes), no solo los de ese tipo — ver lib/externalSync.ts.
alter table public.external_afectaciones drop constraint if exists external_afectaciones_tipo_check;
alter table public.external_afectaciones
  add constraint external_afectaciones_tipo_check
  check (tipo in ('housing', 'road', 'support', 'utility'));
