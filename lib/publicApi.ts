import "server-only";
import type { HelpOffer, Report } from "./types";

/**
 * API pública para que otras apps consuman ("ayudas"/"ayudantes", solo
 * lectura) y envíen ("ayudas"/"ayudantes", POST) datos de Pereira Unida.
 * Protegida por una API key compartida (PUBLIC_API_KEY), sin cuentas —
 * mismo espíritu que ACOPIO_PIN en app/actions.ts.
 */

export const PUBLIC_API_VERSION = "v1";
export const PUBLIC_API_MAX_LIMIT = 200;
export const PUBLIC_API_DEFAULT_LIMIT = 100;

/** Forma estándar de error de toda /api/public/v1/*: un código estable para
 * que integraciones puedan hacer `if (error.code === "...")` sin parsear
 * texto, más un mensaje legible en español. */
export interface PublicApiErrorBody {
  error: { code: string; message: string };
}

export function publicApiError(
  code: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return Response.json(
    { error: { code, message } } satisfies PublicApiErrorBody,
    { status, headers: { "Cache-Control": "no-store", ...extraHeaders } }
  );
}

/** Compara dos strings en tiempo constante (evita timing attacks sobre la key). */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  return null;
}

export type PublicApiAuthResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

/** Verifica la API key. Si PUBLIC_API_KEY no está configurada, la API queda deshabilitada (fail closed). */
export function checkPublicApiAuth(request: Request): PublicApiAuthResult {
  const expected = process.env.PUBLIC_API_KEY;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "api_disabled",
      error: "API pública deshabilitada: falta configurar PUBLIC_API_KEY en el servidor.",
    };
  }
  const provided = extractApiKey(request);
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "invalid_api_key",
      error: "API key inválida o ausente. Enviá 'Authorization: Bearer <key>'.",
    };
  }
  return { ok: true };
}

/**
 * Rate limit muy simple en memoria por API key + endpoint. No es
 * distribuido (se resetea en cada redeploy/instancia); igual que el de
 * app/actions.ts, alcanza para frenar abuso trivial de un MVP.
 */
const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export interface PublicApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** epoch seconds, para el header estándar X-RateLimit-Reset */
  resetAt: number;
}

export function checkPublicApiRateLimit(
  request: Request,
  endpoint: string,
  limit = 60,
  windowMs = 60_000
): PublicApiRateLimitResult {
  const key = extractApiKey(request) ?? "unknown";
  const bucketKey = `${endpoint}:${key}`;
  const now = Date.now();
  const bucket = RATE_LIMIT_BUCKETS.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    const resetAt = now + windowMs;
    RATE_LIMIT_BUCKETS.set(bucketKey, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt: Math.ceil(resetAt / 1000) };
  }
  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: Math.ceil(bucket.resetAt / 1000) };
  }
  bucket.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - bucket.count,
    resetAt: Math.ceil(bucket.resetAt / 1000),
  };
}

/** Headers estándar de rate limit (mismo nombre que usan GitHub/Stripe/etc.),
 * para que cualquier cliente HTTP pueda hacer backoff sin leer el body. */
export function rateLimitHeaders(rl: PublicApiRateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)),
    "X-RateLimit-Reset": String(rl.resetAt),
  };
}

export function parsePublicLimit(raw: string | null): number {
  const n = raw ? Number(raw) : PUBLIC_API_DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return PUBLIC_API_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), PUBLIC_API_MAX_LIMIT);
}

export interface PublicAyuda {
  id: string;
  title: string;
  description: string;
  category: Report["category"];
  urgent_level: Report["urgent_level"];
  status: Report["status"];
  municipality: string;
  department: string | null;
  location_name: string;
  lat: number | null;
  lng: number | null;
  photo_urls: string[];
  comments_count: number;
  created_at: string;
  last_confirmed_at: string | null;
}

/**
 * Nunca incluye `contact_phone`: es el teléfono personal de quien pide
 * ayuda. Dentro de la propia app se muestra completo a propósito (ver
 * README, "Notas de seguridad") porque un humano lo ve de a uno; acá se
 * expone en bloque a cualquier app con la key, así que lo dejamos afuera
 * por defecto.
 */
export function toPublicAyuda(report: Report): PublicAyuda {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    category: report.category,
    urgent_level: report.urgent_level,
    status: report.status,
    municipality: report.municipality,
    department: report.department ?? null,
    location_name: report.location_name,
    lat: report.lat,
    lng: report.lng,
    photo_urls: report.photo_urls,
    comments_count: report.comments_count,
    created_at: report.created_at,
    last_confirmed_at: report.last_confirmed_at ?? null,
  };
}

export interface PublicAyudante {
  id: string;
  full_name: string;
  skill: HelpOffer["skill"];
  description: string;
  municipality: string;
  department: string | null;
  status: HelpOffer["status"];
  created_at: string;
}

/** Igual que toPublicAyuda: sin `phone`. */
export function toPublicAyudante(offer: HelpOffer): PublicAyudante {
  return {
    id: offer.id,
    full_name: offer.full_name,
    skill: offer.skill,
    description: offer.description,
    municipality: offer.municipality,
    department: offer.department ?? null,
    status: offer.status,
    created_at: offer.created_at,
  };
}

// ---------------------------------------------------------------------------
// Validación de los cuerpos de POST /api/public/v1/ayudas y /ayudantes.
// Misma validación que aplica app/actions.ts a los formularios de la propia
// app (createReport/createHelpOffer): una integración con la API key tiene
// el mismo nivel de confianza que cualquier visitante anónimo de la web —
// anónimo + rate limit + validación, sin cola de moderación.
// ---------------------------------------------------------------------------

export const PUBLIC_API_VALID_CATEGORIES: ReadonlyArray<Report["category"]> = [
  "alimentos",
  "herramientas",
  "medicinas",
  "voluntariado",
  "otros",
  "herramientas_rescate",
  "conectividad_energia",
  "mascotas",
  "revision_ingenieria",
  "transporte_logistica",
];

export const PUBLIC_API_VALID_URGENCY: ReadonlyArray<Report["urgent_level"]> = [
  "critico",
  "moderado",
  "atendido",
];

export type PublicApiFieldError = { field: string; message: string };

export interface CreateAyudaBody {
  title: string;
  description: string;
  category: Report["category"];
  urgent_level: Report["urgent_level"];
  municipality: string;
  department: string;
  location_name: string;
  lat: number;
  lng: number;
  contact_phone: string;
}

export interface CreateAyudanteBody {
  full_name: string;
  skill: HelpOffer["skill"];
  description: string;
  phone: string;
  municipality: string;
  department: string;
}

