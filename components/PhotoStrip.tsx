"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface PhotoStripProps {
  urls: string[] | null | undefined;
  alt: string;
  size?: "sm" | "md";
}

/**
 * Miniaturas con vista previa dentro de la app: tocar una foto la abre en
 * grande sobre la misma pantalla, sin navegar a otra pestaña ni disparar la
 * descarga/guardado que algunos navegadores móviles ofrecen al abrir una
 * imagen suelta.
 */
export default function PhotoStrip({ urls, alt, size = "sm" }: PhotoStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!urls || urls.length === 0) return null;
  const box = size === "md" ? "h-20 w-20" : "h-14 w-14";
  const open = openIndex !== null ? urls[openIndex] : null;

  return (
    <>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex(index);
            }}
            aria-label={`Ver foto ${index + 1} de ${alt} en grande`}
            className="shrink-0 appearance-none border-0 bg-transparent p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos de usuario en CDN (Spaces) */}
            <img
              src={url}
              alt={`${alt} ${index + 1}`}
              width={size === "md" ? 80 : 56}
              height={size === "md" ? 80 : 56}
              loading="lazy"
              decoding="async"
              className={`${box} rounded-xl object-cover`}
            />
          </button>
        ))}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setOpenIndex(null);
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex(null);
            }}
            aria-label="Cerrar vista previa"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa en pantalla, no un <Image> del layout */}
          <img
            src={open}
            alt={alt}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
