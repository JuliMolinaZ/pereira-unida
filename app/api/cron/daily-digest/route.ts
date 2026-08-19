import { buildDailyDigestPayload } from "@/lib/dailyDigest";
import { notifyAllSubscribers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Push diario (7pm Colombia, ver vercel.json) con el resumen de actividad
 * del día a todos los suscritos, sin importar el topic. Protegido con
 * CRON_SECRET — mismo header que Vercel Cron envía cuando esa variable está
 * configurada: `Authorization: Bearer <CRON_SECRET>` (ver
 * app/api/cron/sync-external/route.ts, mismo patrón).
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "Notificación deshabilitada: falta configurar CRON_SECRET." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const payload = await buildDailyDigestPayload();
  const result = await notifyAllSubscribers(payload);

  return Response.json({ ...result, payload, ran_at: new Date().toISOString() });
}
