"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

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

/** iPhone/iPad con Safari (o cualquier navegador in-app basado en WebKit en
 * iOS): nunca disparan `beforeinstallprompt`, así que sin este chequeo el
 * botón de instalar no aparecía jamás en iPhone. */
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ se identifica como Mac, pero con soporte táctil.
  return ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
}

/**
 * Botón "Instalar":
 * - Chrome/Edge/Android: usa el prompt nativo `beforeinstallprompt`.
 * - iPhone/iPad (Safari): no existe un prompt programático, así que se
 *   muestra igual el botón y abre instrucciones ("Compartir → Agregar a
 *   pantalla de inicio").
 * - Ya instalada, o navegador sin ningún soporte de instalación: no se
 *   muestra nada.
 */
export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [ios] = useState(() => isIOS());
  const [showIosHelp, setShowIosHelp] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !showIosHelp) return;
    if (!dialog.open) dialog.showModal();

    function handleClose() {
      setShowIosHelp(false);
    }
    function handleBackdropClick(e: MouseEvent) {
      if (e.target !== dialog) return;
      const rect = dialog!.getBoundingClientRect();
      const insidePanel =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!insidePanel) dialogRef.current?.close();
    }
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [showIosHelp]);

  if (installed || (!deferredPrompt && !ios)) return null;

  async function handleClick() {
    if (ios && !deferredPrompt) {
      setShowIosHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Instalar Pereira Unida en este dispositivo"
        className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-carmine transition active:scale-[0.97]"
      >
        <Download className="h-5 w-5" aria-hidden="true" />
      </button>

      {ios && showIosHelp ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="install-ios-title"
          className="glass m-0 mt-auto w-full max-w-sm rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
          <div className="flex items-center justify-between px-4 pt-2 pb-2">
            <h2 id="install-ios-title" className="text-[17px] font-semibold text-ink">
              Instalar en iPhone/iPad
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-ink-soft dark:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-3 px-4 pb-5 text-sm text-ink">
            <p className="text-ink-soft">
              Safari no deja instalar apps con un botón — se hace en 2 pasos, desde el propio navegador:
            </p>
            <div className="flex items-center gap-3 rounded-2xl bg-black/5 px-3 py-2.5 dark:bg-white/10">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-carmine/15 text-xs font-bold text-carmine">
                1
              </span>
              <span className="flex items-center gap-1.5">
                Toca <Share className="h-4 w-4 text-carmine" aria-hidden="true" /> <strong>Compartir</strong>{" "}
                en la barra de Safari
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-black/5 px-3 py-2.5 dark:bg-white/10">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-carmine/15 text-xs font-bold text-carmine">
                2
              </span>
              <span className="flex items-center gap-1.5">
                Elige <SquarePlus className="h-4 w-4 text-carmine" aria-hidden="true" />{" "}
                <strong>Agregar a pantalla de inicio</strong>
              </span>
            </div>
            <p className="text-xs text-ink-soft">
              Si estás dentro de otra app (Instagram, WhatsApp), primero abrí este enlace en Safari con
              el menú ⋯ de arriba a la derecha — Safari es el único que puede instalar en iPhone.
            </p>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
