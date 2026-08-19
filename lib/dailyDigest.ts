import "server-only";
import { getPrivilegedSupabaseClient } from "./supabase/privileged";
import type { PushPayload } from "./push";

/** Colombia = America/Bogota, UTC-5 todo el año (sin horario de verano). */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function todayColombiaRange(): { start: string; end: string; label: string } {
  const nowBogota = new Date(Date.now() - BOGOTA_OFFSET_MS);
  const y = nowBogota.getUTCFullYear();
  const m = nowBogota.getUTCMonth();
  const d = nowBogota.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0) + BOGOTA_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) + BOGOTA_OFFSET_MS);
  const label = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(nowBogota);
  return { start: start.toISOString(), end: end.toISOString(), label };
}

async function countSince(
  client: ReturnType<typeof getPrivilegedSupabaseClient>,
  table: string,
  start: string,
  end: string
): Promise<number> {
  const { count } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", end);
  return count ?? 0;
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/**
 * Resumen diario de actividad comunitaria (solicitudes, ofertas, acopio,
 * cortes de servicio, arriendos) para el push de las 7pm — ver
 * app/api/cron/daily-digest/route.ts. Nunca incluye detalles técnicos: esto
 * lo lee cualquier vecino con la app instalada.
 */
export async function buildDailyDigestPayload(): Promise<PushPayload> {
  const client = getPrivilegedSupabaseClient();
  const { start, end, label } = todayColombiaRange();

  const [reports, offers, points, outages, rentals] = await Promise.all([
    countSince(client, "reports", start, end),
    countSince(client, "help_offers", start, end),
    countSince(client, "collection_points", start, end),
    countSince(client, "service_outages", start, end),
    countSince(client, "rentals", start, end),
  ]);

  const total = reports + offers + points + outages + rentals;

  if (total === 0) {
    return {
      title: "🫂 Pereira Unida",
      body: `Hoy ${label} no hubo publicaciones nuevas. Gracias por seguir pendiente de tu comunidad 💙`,
      url: "/",
      tag: "daily-digest",
    };
  }

  const parts: string[] = [];
  if (reports > 0) {
    parts.push(`🆘 ${reports} ${plural(reports, "solicitud nueva", "solicitudes nuevas")}`);
  }
  if (offers > 0) {
    parts.push(`🤝 ${offers} ${plural(offers, "oferta de ayuda", "ofertas de ayuda")}`);
  }
  if (points > 0) {
    parts.push(`📦 ${points} ${plural(points, "centro de acopio", "centros de acopio")}`);
  }
  if (outages > 0) {
    parts.push(`⚡ ${outages} ${plural(outages, "corte de servicio", "cortes de servicio")}`);
  }
  if (rentals > 0) {
    parts.push(`🏠 ${rentals} ${plural(rentals, "arriendo publicado", "arriendos publicados")}`);
  }

  return {
    title: "🫂 Pereira Unida — Resumen de hoy",
    body: `${label}: ${parts.join(" · ")}. Toca para ver el mapa y ayudar.`,
    url: "/",
    tag: "daily-digest",
  };
}
