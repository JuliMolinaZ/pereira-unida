"use client";

import { MessageCircle, ExternalLink } from "lucide-react";
import { EXTERNAL_FUENTE_LABELS, type ExternalAyuda } from "@/lib/types";
import { formatTimeAgo, toWhatsAppNumber } from "@/lib/utils";
import FuenteBadge from "./FuenteBadge";

/** Tarjeta para ayuda directa entre personas concretas (peticiones y ofrecimientos),
 * de cualquier fuente externa que alimente `external_ayudas` — ver `ayuda.fuente`. */
export default function ExternalAyudaCard({ ayuda }: { ayuda: ExternalAyuda }) {
  const fuenteLabel = EXTERNAL_FUENTE_LABELS[ayuda.fuente];
  const number = ayuda.contact_whatsapp ? toWhatsAppNumber(ayuda.contact_whatsapp) : null;
  const waHref = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(`Hola, vi "${ayuda.title}" en Pereira Unida (vía ${fuenteLabel}) y quiero ayudar.`)}`
    : null;

  return (
    <article className="glass overflow-hidden rounded-[22px] p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[12px] font-medium text-ink-soft">
          {ayuda.tipo === "request" ? "Pide ayuda" : "Ofrece ayuda"}
          {ayuda.category ? ` · ${ayuda.category}` : ""}
        </p>
        <span className="ml-auto" suppressHydrationWarning>
          {ayuda.created_at_source ? formatTimeAgo(ayuda.created_at_source) : ""}
        </span>
      </div>
      <h3 className="mt-0.5 line-clamp-2 text-[16px] leading-snug font-semibold text-ink">
        {ayuda.title}
      </h3>
      {ayuda.description ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-soft">{ayuda.description}</p>
      ) : null}
      {ayuda.address || ayuda.municipality ? (
        <p className="mt-1 text-[12px] text-ink-soft">
          {[ayuda.address, ayuda.municipality].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--whatsapp)] px-3 text-[13px] font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            WhatsApp
          </a>
        ) : null}
        {ayuda.public_url ? (
          <a
            href={ayuda.public_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ver en ${fuenteLabel}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
        <FuenteBadge fuente={ayuda.fuente} />
      </div>
    </article>
  );
}
