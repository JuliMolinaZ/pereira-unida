"use client";

import { Bell, BellOff, BellRing, X } from "lucide-react";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";

interface NotificationsOptInProps {
  municipality: string | null;
  department: string | null;
}

/**
 * Campana de notificaciones push en el header, opt-in: alguien pidió/ofreció
 * ayuda o publicó un arriendo cerca. Nunca se activa sola — hay que tocarla.
 */
export default function NotificationsOptIn({ municipality, department }: NotificationsOptInProps) {
  const { status, busy, error, subscribe, unsubscribe, clearError } = usePushNotifications(
    municipality,
    department
  );

  if (status === "unsupported" || status === "unknown") return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={status === "on" ? unsubscribe : subscribe}
        disabled={busy}
        aria-pressed={status === "on"}
        aria-label={status === "on" ? "Desactivar notificaciones" : "Activar notificaciones cercanas"}
        className="glass flex h-11 w-11 items-center justify-center rounded-full text-carmine transition active:scale-[0.97] disabled:opacity-60"
      >
        {status === "on" ? (
          <BellRing className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bell className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      {error ? (
        <div
          role="alert"
          className="glass absolute top-full right-0 z-50 mt-2 w-64 rounded-2xl p-3 text-[12px] leading-snug text-ink"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold text-carmine">
              <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              No se pudo activar
            </span>
            <button type="button" onClick={clearError} aria-label="Cerrar" className="text-ink/50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {error}
        </div>
      ) : null}
    </div>
  );
}
