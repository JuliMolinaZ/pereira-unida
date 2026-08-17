"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";

export type PushStatus = "unsupported" | "unknown" | "off" | "on";

const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isPushSupported(): boolean {
  if (typeof window === "undefined" || !vapidKey) return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}

/** VAPID public key viene en base64url — la Push API la pide como Uint8Array. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Estado + acciones de suscripción push, compartido entre la campana del
 * header (NotificationsOptIn) y el banner de reenganche para quien ya
 * instaló la app (NotificationsPrompt) — mismo flujo, dos superficies.
 */
export function usePushNotifications(municipality: string | null, department: string | null) {
  const [status, setStatus] = useState<PushStatus>(() => (isPushSupported() ? "unknown" : "unsupported"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unsupported") return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("off"));
    // Solo al montar: el estado de suscripción no cambia por re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });
      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Suscripción incompleta.");
      }
      const result = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        ["ayudas", "ofertas", "arriendos"],
        municipality,
        department
      );
      if (!result.success) throw new Error(result.error ?? "No se pudo guardar.");
      setStatus("on");
      return true;
    } catch {
      setError(
        /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? "En iPhone/iPad las notificaciones solo funcionan si instalaste la app (botón de instalar arriba)."
          : "No se pudieron activar las notificaciones. Revisá los permisos del navegador."
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("No se pudieron desactivar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return { status, busy, error, subscribe, unsubscribe, clearError: () => setError(null) };
}
