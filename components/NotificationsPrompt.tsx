"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { usePushNotifications, isPushSupported } from "@/lib/hooks/usePushNotifications";

const DISMISS_KEY = "pereiraunida:notif-prompt-dismissed-at";
const SNOOZE_DAYS = 14;
const SHOW_DELAY_MS = 3000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage puede fallar en modo privado; no es crítico.
  }
}

/**
 * Banner de reenganche: a quien ya instaló la app (standalone) y todavía no
 * activó ni rechazó las notificaciones desde el navegador, se le pregunta
 * una vez por sesión, con un pequeño retraso para no sentirse invasivo. Si
 * dice "Ahora no", no vuelve a aparecer por 14 días. Si el navegador no
 * soporta push, o la persona ya decidió (aceptó o bloqueó), no se muestra.
 */
export default function NotificationsPrompt({
  municipality,
  department,
}: {
  municipality: string | null;
  department: string | null;
}) {
  const [eligible] = useState(() => {
    if (!isPushSupported() || !isStandalone() || wasDismissedRecently()) return false;
    return typeof Notification !== "undefined" && Notification.permission === "default";
  });
  const [visible, setVisible] = useState(false);
  const { status, busy, subscribe } = usePushNotifications(municipality, department);

  useEffect(() => {
    if (!eligible || status !== "off") return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, status]);

  if (!visible || status !== "off") return null;

  function handleDismiss() {
    markDismissed();
    setVisible(false);
  }

  async function handleActivate() {
    const ok = await subscribe();
    if (ok) setVisible(false);
  }

  return (
    <div className="pointer-events-none absolute inset-x-2.5 bottom-[calc(var(--sheet-current)+var(--dock-offset)+0.75rem)] z-30 flex justify-center lg:inset-x-3 lg:right-[calc(var(--sheet-panel-width)+1.5rem)] lg:left-3 lg:bottom-[calc(var(--dock-height)+0.75rem)]">
      <div
        role="dialog"
        aria-label="Activar notificaciones"
        className="glass pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[22px] p-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carmine/12 text-carmine">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">¿Activar notificaciones?</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
            Te avisamos cuando alguien pida o ofrezca ayuda cerca tuyo. Podés desactivarlas cuando
            quieras desde la campana de arriba.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 rounded-full bg-black/5 py-1.5 text-[12px] font-medium text-ink dark:bg-white/10"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={handleActivate}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-carmine py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Activar"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar"
          className="shrink-0 text-ink/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
