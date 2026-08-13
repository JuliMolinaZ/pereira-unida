"use client";

import { useState } from "react";
import { ArrowLeft, Package } from "lucide-react";
import { CreatePointForm } from "./CollectionPoints";
import { type CollectionPoint } from "@/lib/types";

interface AcopioAdminClientProps {
  accessKey: string;
  initialPoints: CollectionPoint[];
}

export default function AcopioAdminClient({
  accessKey,
  initialPoints,
}: AcopioAdminClientProps) {
  const [points, setPoints] = useState(initialPoints);

  return (
    <div className="min-h-dvh bg-[#0e0e10] px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-lg">
        <a
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al mapa
        </a>

        <div className="glass rounded-[24px] p-3">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-ink-soft" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-ink-soft">Ruta interna</p>
              <h1 className="text-[18px] leading-tight font-semibold text-ink">
                Crear punto de acopio
              </h1>
            </div>
          </div>

          <CreatePointForm
            accessKey={accessKey}
            onCreated={(point) => setPoints((prev) => [point, ...prev])}
          />
        </div>

        <p className="mt-4 mb-2 px-1 text-[12px] font-medium text-white/55">
          {points.length === 0
            ? "Todavía no hay puntos publicados."
            : `${points.length} punto${points.length === 1 ? "" : "s"} en el mapa`}
        </p>

        <div className="space-y-2">
          {points.map((point) => (
            <article key={point.id} className="glass rounded-[22px] px-3 py-2.5">
              <p className="text-[15px] font-semibold text-ink">{point.name}</p>
              <p className="mt-0.5 text-[13px] text-ink-soft">{point.address}</p>
              {point.lat !== null && point.lng !== null ? (
                <p className="mt-1 font-mono text-[11px] text-ink-soft">
                  {point.lat}, {point.lng}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
