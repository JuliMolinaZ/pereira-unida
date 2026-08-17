-- ============================================================================
-- MIGRACIÓN — Cerrar acceso directo por REST/Realtime a datos sensibles
-- (2026-08-17)
--
-- Por qué: hasta ahora reports/comments/collection_points/closed_roads/
-- help_offers/rentals/rental_comments/people_status tenían RLS con
-- `using (true)` / `with check (true)`, o sea que cualquiera con la anon key
-- (siempre visible en el bundle del navegador, normal en apps Supabase)
-- podía leer y ESCRIBIR esas tablas directo contra
-- https://<proyecto>.supabase.co/rest/v1/<tabla> o vía Realtime, sin pasar
-- por app/actions.ts — saltándose el rate limiting, la validación, y en el
-- caso de people_status, el enmascarado de document_id (cédula) que la app
-- sí aplica en la UI (maskDocumentId) pero que nunca protegía la fila cruda.
--
-- Qué cambia:
--   - people_status: se eliminan las 3 policies públicas (select/insert/
--     update). Queda 100% detrás de SUPABASE_SERVICE_ROLE_KEY, solo
--     accesible desde el server (ver getPrivilegedSupabaseClient en
--     app/actions.ts). Sin esa key configurada, el módulo "Estoy Bien" deja
--     de funcionar — es intencional: preferimos fallar cerrado a exponer
--     cédulas/teléfonos en bloque.
--   - reports, comments, collection_points, closed_roads, help_offers,
--     rentals, rental_comments: se mantiene la policy de SELECT pública (la
--     necesita Realtime para seguir mostrando altas/cambios en vivo, y
--     contact_phone en reports ya es intencionalmente público — ver README).
--     Se eliminan las policies de INSERT/UPDATE públicas: toda escritura
--     pasa a hacerse con la service role desde los Server Actions.
--
-- Idempotente: `drop policy if exists` no falla si ya se corrió antes.
-- ============================================================================

-- people_status: sin ninguna policy pública (select/insert/update).
drop policy if exists "people_status_select_public" on public.people_status;
drop policy if exists "people_status_insert_public" on public.people_status;
drop policy if exists "people_status_update_public" on public.people_status;

-- reports: se mantiene select_public, se cierra insert/update directo.
drop policy if exists "reports_insert_public" on public.reports;
drop policy if exists "reports_update_public" on public.reports;

-- comments: se mantiene select_public, se cierra insert directo.
drop policy if exists "comments_insert_public" on public.comments;

-- collection_points: se mantiene select_public, se cierra insert directo
-- (la app ya inserta con service role vía createCollectionPoint/PIN).
drop policy if exists "collection_points_insert_public" on public.collection_points;

-- closed_roads: se mantiene select_public, se cierra insert/update directo.
drop policy if exists "closed_roads_insert_public" on public.closed_roads;
drop policy if exists "closed_roads_update_public" on public.closed_roads;

-- help_offers: se mantiene select_public, se cierra insert/update directo.
drop policy if exists "help_offers_insert_public" on public.help_offers;
drop policy if exists "help_offers_update_public" on public.help_offers;

-- rentals: se mantiene select_public, se cierra insert/update directo.
drop policy if exists "rentals_insert_public" on public.rentals;
drop policy if exists "rentals_update_public" on public.rentals;

-- rental_comments: se mantiene select_public, se cierra insert directo.
drop policy if exists "rental_comments_insert_public" on public.rental_comments;
