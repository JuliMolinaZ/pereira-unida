"use client";

import { useEffect } from "react";
import { isInAppBrowser } from "@/lib/device";

/**
 * Un solo service worker en /sw.js. Si quedó uno registrado con ?v=3/?v=4,
 * se desregistra: ese era el que recargaba y devolvía el dock de Familia.
 * Nunca hacemos location.reload() al actualizar.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (isInAppBrowser()) return;

    let idleId = 0;
    let timeoutId = 0;
    let cancelled = false;

    const register = async () => {
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map((reg) => {
            const script = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
            if (script.includes("?")) return reg.unregister();
            return Promise.resolve(false);
          })
        );

        if (cancelled) return;
        await navigator.serviceWorker.register("/sw.js");
        await fetch("/api/offline-kit");
      } catch {
        // Registro silencioso: si falla, la app sigue funcionando sin PWA.
      }
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => {
          void register();
        }, { timeout: 2500 });
      } else {
        timeoutId = window.setTimeout(() => {
          void register();
        }, 1500);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
