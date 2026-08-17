"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, MapPin, MessageCircle, Navigation, Phone, Share2, Zap } from "lucide-react";
import { updateServiceOutageStatus } from "@/app/actions";
import {
  SERVICE_KIND_COLORS,
  SERVICE_KIND_EMOJI,
  SERVICE_KIND_LABELS,
  SERVICE_KINDS,
  SERVICE_SEVERITY_COLORS,
  SERVICE_SEVERITY_EMOJI,
  SERVICE_SEVERITY_RANK,
  SERVICE_SEVERITY_SHORT_LABELS,
  SERVICE_STATUS_LABELS,
  type ServiceKind,
  type ServiceOutage,
  type ServiceOutageStatus,
} from "@/lib/types";
import {
  buildServiceOutagesCsv,
  cn,
  downloadTextFile,
  formatTimeAgo,
  googleMapsUrl,
  listShareUrl,
  toWhatsAppNumber,
} from "@/lib/utils";
import ExpandableText from "./ExpandableText";
import PhotoStrip from "./PhotoStrip";
import ShareButton from "./ShareButton";

const PHONE_LIKE_RE = /^[+\d][\d\s()-]{5,}$/;

interface ServiceOutagesProps {
  outages: ServiceOutage[];
  onPublish: () => void;
  onUpdated: (outage: ServiceOutage) => void;
  showCtas?: boolean;
  cityName?: string;
  cityId?: string;
}

export default function ServiceOutages({
  outages,
  onPublish,
  onUpdated,
  showCtas = true,
  cityName,
  cityId,
}: ServiceOutagesProps) {
  const [kind, setKind] = useState<ServiceKind | "todos">("todos");
  const [onlyToday, setOnlyToday] = useState(showCtas);
  const [hideResolved, setHideResolved] = useState(true);

  const todayKey = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()),
    []
  );

  const visible = useMemo(() => {
    return outages
      .filter((item) => {
        if (kind !== "todos" && item.service !== kind) return false;
        if (hideResolved && item.status === "resuelto") return false;
        if (onlyToday) {
          const day = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Bogota",
          }).format(new Date(item.created_at));
          if (day !== todayKey) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank = SERVICE_SEVERITY_RANK[a.severity] - SERVICE_SEVERITY_RANK[b.severity];
        if (rank !== 0) return rank;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [outages, kind, hideResolved, onlyToday, todayKey]);

  function handleDownload() {
    const csv = buildServiceOutagesCsv(visible, { includeContact: true });
    const stamp = todayKey.replaceAll("-", "");
    const who = cityName ? `-${cityName.toLowerCase().replace(/\s+/g, "-")}` : "";
    downloadTextFile(
      `servicios${who}-${stamp}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  }

  return (
    <div>
      <div className={showCtas ? "flex items-center gap-2" : "mb-1 flex justify-end"}>
        {showCtas ? (
          <button
            type="button"
            onClick={onPublish}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#ca8a04]/90 text-[13px] font-semibold text-white"
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            Reportar daño
          </button>
        ) : null}
          <button
            type="button"
            onClick={handleDownload}
            disabled={visible.length === 0}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink disabled:opacity-40 dark:bg-white/10"
            aria-label="Descargar CSV para cuadrillas"
            title="Descargar Excel/CSV"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>
          {showCtas ? (
            <ShareButton
              title="Daños de servicios en Pereira Unida"
              text={
                cityName
                  ? `Mira los daños de energía, agua, gas e internet en ${cityName}.`
                  : "Mira los daños de energía, agua, gas e internet en Pereira Unida."
              }
              url={listShareUrl("servicios", cityId)}
              label="Compartir la lista de daños de servicios"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </ShareButton>
          ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <FilterChip
          active={kind === "todos"}
          onClick={() => setKind("todos")}
          label="Todos"
        />
        {SERVICE_KINDS.map((key) => (
          <FilterChip
            key={key}
            active={kind === key}
            onClick={() => setKind(key)}
            label={`${SERVICE_KIND_EMOJI[key]} ${SERVICE_KIND_LABELS[key]}`}
            color={SERVICE_KIND_COLORS[key]}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <FilterChip
          active={onlyToday}
          onClick={() => setOnlyToday((v) => !v)}
          label="Hoy"
        />
        <FilterChip
          active={hideResolved}
          onClick={() => setHideResolved((v) => !v)}
          label="Ocultar resueltos"
        />
      </div>

      {visible.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {onlyToday
              ? "Hoy no hay daños reportados con estos filtros."
              : "Aún no hay daños de servicios en esta zona."}
          </p>
          {showCtas ? (
            <button
              type="button"
              onClick={onPublish}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-[#ca8a04]/90 px-4 text-[13px] font-semibold text-white"
            >
              Reportar el primero
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {visible.map((item) => (
            <OutageCard key={item.id} outage={item} onUpdated={onUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-medium",
        active ? "text-white" : "bg-black/5 text-ink dark:bg-white/10"
      )}
      style={active ? { backgroundColor: color ?? "#1c1917" } : undefined}
    >
      {label}
    </button>
  );
}

function OutageCard({
  outage,
  onUpdated,
}: {
  outage: ServiceOutage;
  onUpdated: (outage: ServiceOutage) => void;
}) {
  const [pending, setPending] = useState<ServiceOutageStatus | null>(null);
  const maps = googleMapsUrl(outage.lat, outage.lng);
  const phone = PHONE_LIKE_RE.test(outage.contact.trim());
  const color = SERVICE_KIND_COLORS[outage.service];

  async function setStatus(status: ServiceOutageStatus) {
    setPending(status);
    const result = await updateServiceOutageStatus(outage.id, status);
    setPending(null);
    if (result.success && result.data) onUpdated(result.data);
  }

  return (
    <article className="glass overflow-hidden rounded-[22px] p-3">
      {outage.severity === "peligro_critico" ? (
        <div
          className="mb-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-white"
          style={{ backgroundColor: SERVICE_SEVERITY_COLORS.peligro_critico }}
        >
          <span aria-hidden="true">{SERVICE_SEVERITY_EMOJI.peligro_critico}</span>
          {SERVICE_SEVERITY_SHORT_LABELS.peligro_critico}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-2xl text-[16px]"
          style={{ backgroundColor: `${color}22` }}
          aria-hidden="true"
        >
          {SERVICE_KIND_EMOJI[outage.service]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color }}>
            {SERVICE_KIND_LABELS[outage.service]}
          </p>
          <p className="text-[11px] text-ink-soft">{formatTimeAgo(outage.created_at)}</p>
        </div>
        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft dark:bg-white/10">
          {SERVICE_STATUS_LABELS[outage.status]}
        </span>
      </div>

      <ExpandableText
        text={outage.description}
        className="mt-1.5 text-[15px] leading-snug whitespace-pre-wrap break-words text-ink"
      />

      <PhotoStrip urls={outage.photo_urls} alt={outage.description} />

      <p className="mt-1.5 flex items-center gap-1 text-[13px] text-ink-soft">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="line-clamp-2">
          {outage.address}
          {outage.municipality ? ` · ${outage.municipality}` : ""}
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {outage.status !== "en_atencion" ? (
          <button
            type="button"
            onClick={() => setStatus("en_atencion")}
            disabled={pending !== null}
            className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-ink disabled:opacity-50 dark:bg-white/10"
          >
            {pending === "en_atencion" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "En atención"
            )}
          </button>
        ) : null}
        {outage.status !== "resuelto" ? (
          <button
            type="button"
            onClick={() => setStatus("resuelto")}
            disabled={pending !== null}
            className="rounded-full bg-forest/12 px-2.5 py-1 text-[11px] font-medium text-forest disabled:opacity-50"
          >
            {pending === "resuelto" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Resuelto"}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {maps ? (
          <a
            href={maps}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Cómo llegar
          </a>
        ) : null}
        {phone ? (
          <>
            <a
              href={`https://wa.me/${toWhatsAppNumber(outage.contact) ?? ""}?text=${encodeURIComponent(`Hola, vi en Pereira Unida el daño de ${SERVICE_KIND_LABELS[outage.service]} en ${outage.address}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--whatsapp)] text-white"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href={`tel:${outage.contact.replace(/\s+/g, "")}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
              aria-label="Llamar"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          </>
        ) : null}
      </div>
    </article>
  );
}
