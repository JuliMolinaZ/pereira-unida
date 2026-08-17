"use client";

import { useEffect, useState } from "react";

/**
 * Detecta cortes de conectividad del navegador (eventos online/offline) y
 * guarda desde cuándo está sin conexión — para poder mostrar "datos
 * guardados hace X" en vez de un genérico "sin internet". Pensado para
 * brigadistas entrando a zonas con señal celular intermitente.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    if (!navigator.onLine) setOfflineSince(new Date().toISOString());

    function handleOnline() {
      setOnline(true);
      setOfflineSince(null);
    }
    function handleOffline() {
      setOnline(false);
      setOfflineSince(new Date().toISOString());
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online, offlineSince };
}
