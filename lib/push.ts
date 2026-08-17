import "server-only";
import webpush from "web-push";
import { getPrivilegedSupabaseClient } from "./supabase/privileged";

/**
 * Notificaciones push (Web Push estándar, VAPID) para "alguien pidió ayuda
 * cerca", "alguien ofrece ayuda cerca" y "se publicó un arriendo cerca".
 * Sin servicio de terceros — el navegador entrega directo al endpoint push
 * del dispositivo suscrito. Opt-in explícito (ver NotificationsOptIn.tsx),
 * nunca se activa solo.
 */

export type PushTopic = "ayudas" | "ofertas" | "arriendos";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

/** Mínimo entre dos notificaciones al mismo dispositivo, sin importar el
 * tema — "muy sutiles, sin saturar": en una emergencia real se crean
 * decenas de reportes por hora, y nadie quiere un push por cada uno. */
const COOLDOWN_MS = 10 * 60_000;

let configured = false;
function ensureConfigured(): boolean {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  }
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT);
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_notified_at: string | null;
}

/**
 * Envía `payload` a todos los suscritos a `topic` en `municipality` (o sin
 * municipio guardado — se suman a todos). Nunca lanza: un fallo acá no debe
 * tumbar la creación del reporte/oferta/arriendo que lo dispara. Tolerante a
 * fallos de PUSH_VAPID no configurado (no-op silencioso) y a suscripciones
 * vencidas (410/404 → se borran solas).
 */
export async function notifySubscribers(
  topic: PushTopic,
  municipality: string | null,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const client = getPrivilegedSupabaseClient();
    let query = client
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, last_notified_at")
      .contains("topics", [topic]);
    if (municipality) {
      query = query.or(`municipality.is.null,municipality.eq.${municipality}`);
    }

    const { data, error } = await query.limit(500);
    if (error || !data) return;

    const now = Date.now();
    const due = (data as SubscriptionRow[]).filter((row) => {
      if (!row.last_notified_at) return true;
      return now - new Date(row.last_notified_at).getTime() > COOLDOWN_MS;
    });
    if (due.length === 0) return;

    const body = JSON.stringify(payload);
    const expiredIds: string[] = [];
    const notifiedIds: string[] = [];

    await Promise.all(
      due.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body
          );
          notifiedIds.push(row.id);
        } catch (err) {
          const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 404 || statusCode === 410) expiredIds.push(row.id);
        }
      })
    );

    if (notifiedIds.length > 0) {
      await client
        .from("push_subscriptions")
        .update({ last_notified_at: new Date().toISOString() })
        .in("id", notifiedIds);
    }
    if (expiredIds.length > 0) {
      await client.from("push_subscriptions").delete().in("id", expiredIds);
    }
  } catch (err) {
    console.error("notifySubscribers error:", err instanceof Error ? err.message : err);
  }
}
