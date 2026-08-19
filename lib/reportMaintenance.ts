import "server-only";
import { getPrivilegedSupabaseOrError } from "@/lib/supabase/privileged";

const STALE_DAYS = 7;

/**
 * Cierra automáticamente las solicitudes ("buscando") que nadie confirmó
 * como vigentes en STALE_DAYS días — mismo botón "sigue activo" que marca
 * `last_confirmed_at` en `confirmReportActive()` (app/actions.ts). Si nunca
 * se confirmó, usa `created_at` como referencia. No toca "en_camino": ahí ya
 * hay alguien en terreno y cerrarlo solo sin confirmación sería incorrecto.
 * Se llama en segundo plano desde `getHomeData()`, mismo patrón que
 * `scheduleExternalSync` — es un UPDATE idempotente y barato (índice en
 * status/last_confirmed_at), así que no necesita candado propio.
 */
export async function autoResolveStaleReports(): Promise<void> {
  const sb = getPrivilegedSupabaseOrError();
  if (!sb.client) return;

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await sb.client
    .from("reports")
    .update({ status: "resuelto" })
    .eq("status", "buscando")
    .or(`last_confirmed_at.lt.${cutoff},and(last_confirmed_at.is.null,created_at.lt.${cutoff})`);

  if (error) console.error("autoResolveStaleReports error:", error.message);
}
