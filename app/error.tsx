"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/** Red de seguridad de último recurso: si algo revienta fuera de los
 * modales (que ya tienen su propio ErrorBoundary), esto evita una pantalla
 * en blanco y deja recargar de un toque. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#1c1410] px-4">
      <div className="glass w-full max-w-sm space-y-4 rounded-[28px] p-6 text-center text-ink">
        <AlertTriangle className="mx-auto h-9 w-9 text-carmine" aria-hidden="true" />
        <div>
          <p className="text-[17px] font-semibold text-ink">Algo salió mal</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft break-words">
            {error.message || "Error desconocido"}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ca8a04] text-[15px] font-semibold text-white"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    </div>
  );
}
