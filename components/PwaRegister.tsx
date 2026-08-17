"use client";

import { useEffect } from "react";
import { isInAppBrowser } from "@/lib/device";

/**
 * Registra el service worker vanilla (public/sw.js). Solo en producción:
 * en dev interferiría con la recarga en caliente de Turbopack.
 * En Instagram/Facebook el WebView no aprovecha el SW y compite por la red.
 *
 * No recargamos la página al activar un SW nuevo: en iOS (app instalada)
 * esa recarga devolvía el shell viejo y volvía a salir Familia.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (isInAppBrowser()) return;

    let idleId = 0;
    let timeoutId = 0;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js?v=4")
        .then((registration) => {
          registration.update();
          return navigator.serviceWorker.ready;
        })
        .then(() => fetch("/api/offline-kit"))
        .catch(() => {
          // Registro silencioso: si falla, la app sigue funcionando sin PWA.
        });
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(register, { timeout: 2500 });
      } else {
        timeoutId = window.setTimeout(register, 1500);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      window.removeEventListener("load", schedule);
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
