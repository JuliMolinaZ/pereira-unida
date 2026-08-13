"use client";

import { useState, useTransition } from "react";
import { Loader2, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { updateReportStatus, confirmReportActive } from "@/app/actions";
import { formatTimeAgo, googleMapsUrl, shareToWhatsApp, cn } from "@/lib/utils";
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  STATUS_ACTIONS,
  STATUS_LABELS,
  URGENCY_LABELS,
  isClosedStatus,
  pinColorForReport,
  type Report,
  type ReportStatus,
} from "@/lib/types";
import CommentsSection from "./CommentsSection";
import PhotoStrip from "./PhotoStrip";

export default function ReportCard({
  report,
  onStatusUpdated,
  selected = false,
  onSelect,
  compact = false,
  anchor = true,
}: {
  report: Report;
  onStatusUpdated: (report: Report) => void;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
  anchor?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mapsHref = googleMapsUrl(report.lat, report.lng);
  const closed = isClosedStatus(report.status);

  function handleConfirmActive() {
    setError(null);
    startTransition(async () => {
      const result = await confirmReportActive(report.id);
      if (result.success) {
        onStatusUpdated({
          ...report,
          status: "buscando",
          last_confirmed_at: new Date().toISOString(),
        });
      } else {
        setError(result.error ?? "No se pudo confirmar el reporte.");
      }
    });
  }

  function handleSetStatus(nextStatus: ReportStatus) {
    if (nextStatus === report.status) return;
    setError(null);
    startTransition(async () => {
      const result = await updateReportStatus(report.id, nextStatus);
      if (result.success) {
        onStatusUpdated({ ...report, status: nextStatus });
      } else {
        setError(result.error ?? "No se pudo actualizar el estado.");
      }
    });
  }

  if (compact) {
    const comments = Math.max(0, report.comments_count || 0);
    return (
      <article
        id={anchor ? `report-${report.id}` : undefined}
        onClick={onSelect}
        className={cn(
          "report-row cursor-pointer border-b border-black/10 py-2.5 pr-3 pl-0 transition dark:border-white/10",
          closed && "opacity-70",
          selected && "bg-black/5 dark:bg-white/8"
        )}
      >
        <div className="flex items-stretch gap-2.5">
          <span
            className="w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: pinColorForReport(report) }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] leading-snug font-semibold text-ink">
              {report.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-tight text-ink-soft">
              <span className="shrink-0">{CATEGORY_EMOJI[report.category]}</span>
              <span className="min-w-0 truncate">
                {CATEGORY_LABELS[report.category]} · {report.location_name}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-ink-soft/70">
                {formatTimeAgo(report.last_confirmed_at || report.created_at)}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end justify-center gap-1">
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                comments > 0 ? "bg-carmine text-white" : "bg-black/10 text-ink-soft"
              )}
              aria-label={`${comments} ${comments === 1 ? "nota" : "notas"}`}
            >
              {comments > 99 ? "99+" : comments}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                report.status === "informacion_falsa" || report.status === "duplicado"
                  ? "bg-black/10 text-ink-soft"
                  : report.status === "resuelto"
                    ? "bg-forest/12 text-forest"
                    : report.status === "en_camino"
                      ? "bg-[#3b6ea5]/12 text-[#3b6ea5]"
                      : "bg-carmine/10 text-carmine"
              )}
            >
              {report.status === "buscando"
                ? "Buscando"
                : report.status === "informacion_falsa"
                  ? "Falsa"
                  : STATUS_LABELS[report.status]}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      id={anchor ? `report-${report.id}` : undefined}
      onClick={onSelect}
      className={cn(
        "glass overflow-hidden rounded-[22px] p-3 transition",
        onSelect && "cursor-pointer",
        selected && "ring-1 ring-carmine/40",
        closed && "opacity-80"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: pinColorForReport(report) }}
          aria-hidden="true"
        />
        <span className="text-[12px] font-medium text-ink-soft">
          <span className="sr-only">{URGENCY_LABELS[report.urgent_level]} · </span>
          {CATEGORY_EMOJI[report.category]} {CATEGORY_LABELS[report.category]}
        </span>
        <span className="ml-auto shrink-0 text-[12px] text-ink-soft/70">
          {formatTimeAgo(report.last_confirmed_at || report.created_at)}
        </span>
      </div>

      <h3 className="mt-0.5 line-clamp-2 text-[17px] leading-snug font-semibold text-ink">
        {report.title}
      </h3>
      {report.description ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-soft">{report.description}</p>
      ) : null}

      <PhotoStrip urls={report.photo_urls} alt={report.title} />

      <p className="mt-1 flex items-center gap-1 text-[13px] text-ink-soft">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="line-clamp-1">
          {report.location_name} · {report.municipality}
        </span>
      </p>

      <p className="mt-1 text-[12px] font-semibold text-ink-soft">
        {STATUS_LABELS[report.status]}
      </p>

      {error ? <p className="mt-1 text-[12px] font-medium text-carmine">{error}</p> : null}

      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <a
          href={shareToWhatsApp(report)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--whatsapp)] px-3 text-[13px] font-semibold text-white"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          WhatsApp
        </a>

        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Cómo llegar al punto exacto"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}

        {report.contact_phone ? (
          <a
            href={`tel:${report.contact_phone}`}
            aria-label="Llamar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!closed ? (
          <button
            type="button"
            onClick={handleConfirmActive}
            disabled={isPending}
            className="rounded-full bg-carmine/10 px-2.5 py-1 text-[11px] font-semibold text-carmine disabled:opacity-50"
          >
            {isPending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "¿Sigue activa?"}
          </button>
        ) : null}
        {STATUS_ACTIONS.filter((action) => action.status !== report.status).map((action) => (
          <button
            key={action.status}
            type="button"
            onClick={() => handleSetStatus(action.status)}
            disabled={isPending}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50",
              action.kind === "flag"
                ? "bg-black/10 text-ink"
                : action.kind === "done"
                  ? "bg-forest/12 text-forest"
                  : "bg-[#3b6ea5]/12 text-[#3b6ea5]"
            )}
          >
            {isPending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : action.label}
          </button>
        ))}
        {closed ? (
          <button
            type="button"
            onClick={handleConfirmActive}
            disabled={isPending}
            className="rounded-full bg-carmine/10 px-2.5 py-1 text-[11px] font-semibold text-carmine disabled:opacity-50"
          >
            Reabrir · sigue activa
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 pb-1" onClick={(e) => e.stopPropagation()}>
        <CommentsSection reportId={report.id} />
      </div>
    </article>
  );
}
