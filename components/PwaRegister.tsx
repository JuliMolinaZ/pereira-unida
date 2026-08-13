"use client";

import { useEffect } from "react";

/**
 * Registra el service worker vanilla (public/sw.js). Solo en producción:
 * en dev interferiría con la recarga en caliente de Turbopack.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registro silencioso: si falla, la app sigue funcionando sin PWA.
    });
  }, []);

  return null;
}
