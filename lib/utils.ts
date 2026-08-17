import {
  HELP_SKILL_LABELS,
  SERVICE_KIND_LABELS,
  SERVICE_SEVERITY_SHORT_LABELS,
  SERVICE_STATUS_LABELS,
  type CollectionPoint,
  type HelpOffer,
  type Rental,
  type Report,
  type ServiceOutage,
} from "./types";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pereiraunida.com";

/**
 * Normaliza un teléfono colombiano a dígitos internacionales (57…) para
 * wa.me. Acepta 3001234567, +57 300 123 4567, 573001234567, etc.
 */
export function toWhatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("57") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.length === 10) return `57${digits}`;
  if (digits.length === 11 && digits.startsWith("3")) return `57${digits.slice(0, 10)}`;
  if (digits.length >= 10) return digits;
  return null;
}

/**
 * Abre el chat de WhatsApp con quien pidió ayuda (su `contact_phone`),
 * con un mensaje corto ya escrito para que sepa de qué solicitud se trata.
 */
export function shareToWhatsApp(report: Report): string {
  const reportUrl = `${SITE_URL}/?reporte=${report.id}`;
  const mapsUrl = googleMapsUrl(report.lat, report.lng);
  const number = toWhatsAppNumber(report.contact_phone);

  const message = [
    `Hola, vi tu solicitud en Pereira Unida: *${report.title}* (${report.location_name}, ${report.municipality}).`,
    mapsUrl ? `Cómo llegar: ${mapsUrl}` : null,
    `¿Te puedo ayudar? ${reportUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Abre WhatsApp con quien ofreció su oficio o profesión. */
export function shareToWhatsAppOffer(offer: HelpOffer): string {
  const number = toWhatsAppNumber(offer.phone);
  const skill = HELP_SKILL_LABELS[offer.skill];
  const message = `Hola ${offer.full_name}, vi en Pereira Unida que ofreces ayuda de ${skill}. ¿Me puedes orientar?`;
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

const MY_OFFER_IDS_KEY = "pereiraunida:my-offer-ids";

export function readMyOfferIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_OFFER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberMyOfferId(id: string) {
  if (typeof window === "undefined") return;
  const next = Array.from(new Set([...readMyOfferIds(), id]));
  window.localStorage.setItem(MY_OFFER_IDS_KEY, JSON.stringify(next));
}

const MY_RENTAL_IDS_KEY = "pereiraunida:my-rental-ids";

export function readMyRentalIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_RENTAL_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberMyRentalId(id: string) {
  if (typeof window === "undefined") return;
  const next = Array.from(new Set([...readMyRentalIds(), id]));
  window.localStorage.setItem(MY_RENTAL_IDS_KEY, JSON.stringify(next));
}

export function formatCop(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Precio a convenir";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function parseContactPhones(contact: string): string[] {
  const matches = contact.match(/\d{7,}/g) ?? [];
  return Array.from(new Set(matches));
}

const MY_ACOPIO_IDS_KEY = "pereiraunida:my-acopio-ids";

export function readMyAcopioIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_ACOPIO_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberMyAcopioId(id: string) {
  if (typeof window === "undefined") return;
  const next = Array.from(new Set([...readMyAcopioIds(), id]));
  window.localStorage.setItem(MY_ACOPIO_IDS_KEY, JSON.stringify(next));
}

export function shareToWhatsAppAcopio(point: CollectionPoint): string {
  const number = toWhatsAppNumber(point.contact);
  const mapsUrl = googleMapsUrl(point.lat, point.lng);
  const need = point.supplies_needed.slice(0, 4).join(", ");
  const message = [
    `Hola, vi en Pereira Unida el centro de acopio *${point.name}* (${point.address}, ${point.municipality}).`,
    need ? `Vi que necesitan: ${need}.` : null,
    mapsUrl ? `Cómo llegar: ${mapsUrl}` : null,
    "¿Puedo llevar donaciones?",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function shareToWhatsAppRental(rental: Rental): string {
  const phones = parseContactPhones(rental.contact);
  const number = phones[0] ? toWhatsAppNumber(phones[0]) : null;
  const place = [rental.neighborhood, rental.address].filter(Boolean).join(" · ");
  const price = formatCop(rental.monthly_rent);
  const message = `Hola, vi en Pereira Unida el ${rental.property_type.toLowerCase()} en ${place} (${price}). ¿Sigue disponible?`;
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Link directo a una solicitud puntual (para reenviar por WhatsApp, no para contactar). */
export function reportShareUrl(reportId: string): string {
  return `${SITE_URL}/?reporte=${reportId}`;
}

/** Link directo a un arriendo puntual. */
export function rentalShareUrl(rentalId: string): string {
  return `${SITE_URL}/?arriendo=${rentalId}`;
}

/**
 * Link a una vista filtrada de la app (p. ej. todos los arriendos de una
 * ciudad) para reenviar por grupos de WhatsApp. `vista` es el valor de
 * `CategoryQuickFilter` (arriendos, ofrezco, puntos_acopio…).
 */
export function listShareUrl(vista: string, cityId?: string): string {
  const params = new URLSearchParams({ vista });
  if (cityId) params.set("ciudad", cityId);
  return `${SITE_URL}/?${params.toString()}`;
}

/**
 * Formatea una fecha ISO como "Hace X minutos/horas/días" en español.
 */
export function formatTimeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSeconds < 60) return "Hace instantes";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} ${diffMinutes === 1 ? "minuto" : "minutos"}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `Hace ${diffDays} ${diffDays === 1 ? "día" : "días"}`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  return `Hace ${diffWeeks} ${diffWeeks === 1 ? "semana" : "semanas"}`;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Última señal de que la necesidad sigue vigente. */
export function reportActivityAt(
  report: Pick<Report, "created_at"> & { last_confirmed_at?: string | null }
): number {
  const iso = report.last_confirmed_at || report.created_at;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function isReportFromLastHours(
  report: Pick<Report, "created_at"> & { last_confirmed_at?: string | null },
  hours = 6
): boolean {
  const windowMs = hours === 6 ? SIX_HOURS_MS : hours * 60 * 60 * 1000;
  return Date.now() - reportActivityAt(report) <= windowMs;
}

function toCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True solo si hay un par lat/lng usable para navegar. */
export function hasExactCoords(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): boolean {
  const a = toCoord(lat);
  const b = toCoord(lng);
  if (a === null || b === null) return false;
  if (a === 0 && b === 0) return false;
  return a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

export function formatExactCoords(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): string | null {
  const a = toCoord(lat);
  const b = toCoord(lng);
  if (a === null || b === null || !hasExactCoords(a, b)) return null;
  return `${a.toFixed(7)}, ${b.toFixed(7)}`;
}

/**
 * Ruta de Google Maps al punto exacto.
 * Nunca busca por nombre: eso puede mandar a otro barrio / un POI cercano.
 */
export function googleMapsUrl(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined
): string | null {
  const a = toCoord(lat);
  const b = toCoord(lng);
  if (a === null || b === null || !hasExactCoords(a, b)) return null;
  const dest = `${a.toFixed(7)},${b.toFixed(7)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function bogotaStamp(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
  const hora = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { fecha, hora };
}

/** CSV con BOM para que Excel en Windows abra tildes bien. */
export function buildServiceOutagesCsv(
  rows: ServiceOutage[],
  opts?: { includeContact?: boolean }
): string {
  const headers = [
    "fecha",
    "hora",
    "severidad",
    "servicio",
    "estado",
    "detalle",
    "direccion",
    "ciudad",
    "departamento",
    "lat",
    "lng",
    "maps",
    "fotos",
  ];
  if (opts?.includeContact) headers.push("contacto");
  const lines = [headers.join(",")];
  for (const row of rows) {
    const { fecha, hora } = bogotaStamp(row.created_at);
    const cells = [
      fecha,
      hora,
      SERVICE_SEVERITY_SHORT_LABELS[row.severity] ?? row.severity,
      SERVICE_KIND_LABELS[row.service] ?? row.service,
      SERVICE_STATUS_LABELS[row.status] ?? row.status,
      row.description,
      row.address,
      row.municipality,
      row.department ?? "",
      row.lat != null ? String(row.lat) : "",
      row.lng != null ? String(row.lng) : "",
      googleMapsUrl(row.lat, row.lng) ?? "",
      (row.photo_urls ?? []).join(" "),
    ];
    if (opts?.includeContact) cells.push(row.contact);
    lines.push(cells.map((cell) => csvCell(String(cell))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
