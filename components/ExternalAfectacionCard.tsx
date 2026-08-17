"use client";

import { Camera, Navigation, ThumbsUp } from "lucide-react";
import type { ExternalAfectacion } from "@/lib/types";
import { cn, googleMapsUrl } from "@/lib/utils";
import FuenteBadge from "./FuenteBadge";

const TIPO_LABEL: Record<ExternalAfectacion["tipo"], string> = {
  housing: "Edificio dañado",
  road: "Vía afectada",
  support: "Servicio de apoyo",
};

const GRAVEDAD_LABEL: Record<string, string> = {
  alta: "Riesgo alto",
  media: "Riesgo medio",
  "sin-clasificar": "Sin clasificar",
};

/**
 * Tarjeta para una afectación de cualquier fuente externa (Pereira Responde,
 * Pereira Ayuda, Reporte CO) — ver `afectacion.fuente`. Nunca carga fotos
 * ajenas, solo muestra cuántas hay.
 */
export default function ExternalAfectacionCard({ afectacion }: { afectacion: ExternalAfectacion }) {
  const alta = afectacion.gravedad === "alta";
  const mapsHref = googleMapsUrl(afectacion.lat, afectacion.lng);
  return (
    <article className="glass overflow-hidden rounded-[22px] p-3">
      <div className="flex items-center gap-1.5">
        <p
          className={cn(
            "text-[12px] font-medium",
            alta ? "text-carmine" : "text-ink-soft"
          )}
        >
          {TIPO_LABEL[afectacion.tipo]}
          {afectacion.subtipo ? ` · ${afectacion.subtipo}` : ""}
        </p>
        {afectacion.gravedad ? (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold",
              alta ? "bg-carmine/10 text-carmine" : "bg-black/5 text-ink-soft dark:bg-white/10"
            )}
          >
            {GRAVEDAD_LABEL[afectacion.gravedad] ?? afectacion.gravedad}
          </span>
        ) : null}
      </div>
      <h3 className="mt-0.5 line-clamp-2 text-[16px] leading-snug font-semibold text-ink">
        {afectacion.title}
      </h3>
      {afectacion.nota ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-soft">{afectacion.nota}</p>
      ) : (
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Sin dirección exacta de la fuente — tocá &ldquo;Cómo llegar&rdquo; para ver dónde queda.
        </p>
      )}

      {mapsHref ? (
        <div className="mt-2 flex items-center gap-2">
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Cómo llegar
          </a>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-soft">
        {afectacion.photo_count > 0 ? (
          <span className="flex items-center gap-1">
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            {afectacion.photo_count}
          </span>
        ) : null}
        {afectacion.votes > 0 ? (
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            {afectacion.votes}
          </span>
        ) : null}
        <FuenteBadge fuente={afectacion.fuente} />
      </div>
    </article>
  );
}
