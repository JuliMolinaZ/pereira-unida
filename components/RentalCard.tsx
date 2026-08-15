"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle, Navigation, Phone } from "lucide-react";
import { updateRentalStatus } from "@/app/actions";
import PhotoStrip from "./PhotoStrip";
import CommentsSection from "./CommentsSection";
import {
  RENTAL_COLOR,
  RENTAL_EMOJI,
  RENTAL_STATUS_LABELS,
  type Rental,
} from "@/lib/types";
import {
  cn,
  formatCop,
  formatTimeAgo,
  googleMapsUrl,
  parseContactPhones,
  rentalShareUrl,
  shareToWhatsAppRental,
} from "@/lib/utils";
import ShareButton from "./ShareButton";

interface RentalCardProps {
  rental: Rental;
  selected?: boolean;
  compact?: boolean;
  onSelect?: () => void;
  onStatusUpdated?: (rental: Rental) => void;
  showMunicipality?: boolean;
}

export default function RentalCard({
  rental,
  selected = false,
  compact = false,
  onSelect,
  onStatusUpdated,
  showMunicipality = false,
}: RentalCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mapsHref = googleMapsUrl(rental.lat, rental.lng);
  const phones = parseContactPhones(rental.contact);
  const place = [rental.neighborhood, rental.address].filter(Boolean).join(" · ");
  const when = rental.submitted_at || rental.created_at;
  const available = rental.status === "disponible";
  const comments = Math.max(0, rental.comments_count || 0);

  function handleStatus(next: "disponible" | "ocupada") {
    if (next === rental.status) return;
    setError(null);
    startTransition(async () => {
      const result = await updateRentalStatus(rental.id, next);
      if (result.success && result.data) {
        onStatusUpdated?.(result.data);
      } else {
        setError(result.error ?? "No se pudo actualizar el arriendo.");
      }
    });
  }

  return (
    <article
      id={`rental-${rental.id}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        "overflow-hidden rounded-[22px] px-2.5 py-2.5",
        selected && "bg-black/5 dark:bg-white/10",
        onSelect && "cursor-pointer",
        !available && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[20px]"
          style={{ backgroundColor: `${RENTAL_COLOR}22` }}
          aria-hidden="true"
        >
          {RENTAL_EMOJI}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color: RENTAL_COLOR }}>
            {rental.property_type}
            {rental.furnished ? " · Amoblada" : " · Sin amoblar"}
          </p>
          <h3 className="mt-0.5 text-[16px] leading-snug font-semibold text-ink">
            {formatCop(rental.monthly_rent)}
          </h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink">
            {place || "Ubicación por confirmar"}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-soft">
            {showMunicipality ? `${rental.municipality} · ` : ""}
            <span suppressHydrationWarning>{formatTimeAgo(when)}</span>
            {rental.lat == null ? " · Sin pin en el mapa" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
              comments > 0 ? "bg-[#1a6b78] text-white" : "bg-black/10 text-ink-soft"
            )}
            aria-label={`${comments} ${comments === 1 ? "nota" : "notas"}`}
          >
            {comments > 99 ? "99+" : comments}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
              available ? "bg-[#1a6b78]/12 text-[#1a6b78]" : "bg-black/10 text-ink-soft"
            )}
          >
            {RENTAL_STATUS_LABELS[rental.status]}
          </span>
        </div>
      </div>

      <PhotoStrip urls={rental.photo_urls} alt={rental.property_type} size={compact ? "sm" : "md"} />

      {!compact ? (
        <>
          <div className="mt-2.5 flex items-center gap-2">
            <a
              href={shareToWhatsAppRental(rental)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--whatsapp)] px-3 text-[13px] font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
            <ShareButton
              title={`${rental.property_type} en arriendo`}
              text={`${rental.property_type} en ${place || rental.municipality} — ${formatCop(rental.monthly_rent)}. Pereira Unida.`}
              url={rentalShareUrl(rental.id)}
              label="Compartir este arriendo"
            />
            {phones[0] ? (
              <a
                href={`tel:${phones[0]}`}
                aria-label="Llamar al propietario"
                onClick={(e) => e.stopPropagation()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Cómo llegar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {phones.length > 1 ? (
            <p className="mt-1.5 text-[11px] text-ink-soft">Contacto: {rental.contact}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {available ? (
              <button
                type="button"
                onClick={() => handleStatus("ocupada")}
                disabled={isPending}
                className="rounded-full bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-ink disabled:opacity-50"
              >
                {isPending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Ya no está disponible"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStatus("disponible")}
                disabled={isPending}
                className="rounded-full bg-[#1a6b78]/12 px-2.5 py-1 text-[11px] font-semibold text-[#1a6b78] disabled:opacity-50"
              >
                {isPending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Reabrir · sigue disponible"}
              </button>
            )}
          </div>
          {error ? (
            <p className="mt-1 text-[11px] font-medium text-carmine" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-1.5 pb-1" onClick={(e) => e.stopPropagation()}>
            <CommentsSection rentalId={rental.id} />
          </div>
        </>
      ) : null}
    </article>
  );
}
