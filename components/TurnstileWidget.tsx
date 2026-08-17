"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el anti-spam."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Widget invisible/liviano de Cloudflare Turnstile. Bloqueá el botón de
 * envío hasta que `onVerify` te dé un token — mientras no llegue, no hay
 * nada que mandarle al server action. No requiere cuenta ni cookies del
 * visitante, solo la site key pública (segura de exponer, es lo mismo que
 * hace cualquier sitio con Turnstile).
 */
export default function TurnstileWidget({
  action,
  onVerify,
  onExpire,
}: {
  /** 1-32 caracteres, letras/números/guiones/guion bajo — identifica qué formulario es en el dashboard de Cloudflare. */
  action: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          callback: onVerify,
          "expired-callback": onExpire,
          "error-callback": onExpire,
          size: "flexible",
        });
      })
      .catch(() => {
        // Sin Turnstile disponible (bloqueado por un adblocker, sin red):
        // no tumbamos el formulario, solo queda sin verificación extra —
        // el server action igual valida lo demás.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="min-h-[65px]" />;
}
