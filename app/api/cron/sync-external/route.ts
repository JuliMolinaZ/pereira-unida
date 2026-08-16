import { runExternalSync } from "@/lib/externalSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Disparo manual/externo de la sincronización (además del disparo por
 * tráfico en getHomeData(), ver lib/externalSync.ts). Útil para probar en
 * caliente o para engancharlo a un cron externo (GitHub Actions, etc.) si
 * más adelante hace falta más frecuencia de la que da el tráfico solo.
 *
 * Protegido con CRON_SECRET — mismo header que usa Vercel Cron cuando esa
 * variable está configurada: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "Sincronización deshabilitada: falta configurar CRON_SECRET." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const summary = await runExternalSync();
  return Response.json({ summary, ran_at: new Date().toISOString() });
}
