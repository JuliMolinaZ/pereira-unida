"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari, sin API estándar.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Botón "Instalar" — solo aparece cuando el navegador ofrece el prompt
 * nativo (Chrome/Edge/Android; Safari/iOS no lo soporta y no se muestra).
 * Mismo resultado que "Agregar acceso directo" desde la barra de URL, pero
 * sin que la persona tenga que encontrarlo ahí.
 */
export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  async function handleClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Instalar Pereira Unida en este dispositivo"
      className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-carmine transition active:scale-[0.97]"
    >
      <Download className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
