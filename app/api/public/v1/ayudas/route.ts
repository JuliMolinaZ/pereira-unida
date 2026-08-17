import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { getPrivilegedSupabaseOrError } from "@/lib/supabase/privileged";
import {
  checkPublicApiAuth,
  checkPublicApiRateLimit,
  parsePublicLimit,
  publicApiError,
  rateLimitHeaders,
  toPublicAyuda,
  PUBLIC_API_VALID_CATEGORIES,
  PUBLIC_API_VALID_URGENCY,
  type CreateAyudaBody,
} from "@/lib/publicApi";
import { CATEGORY_LABELS, isClosedStatus, type Report, type ReportCategory } from "@/lib/types";
import { normalizePhotoUrls } from "@/lib/photos";
import { DEFAULT_DEPARTMENT, inColombia, isKnownCityName } from "@/lib/regions";

export const dynamic = "force-dynamic";

function embedCount(rel: unknown): number {
  if (!Array.isArray(rel) || rel.length === 0) return 0;
  const n = (rel[0] as { count?: unknown })?.count;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeReport(row: Record<string, unknown>): Report {
  const comments_count = embedCount(row.comments);
  const rest = { ...row };
  delete rest.comments;
  return {
    ...(rest as unknown as Report),
    photo_urls: normalizePhotoUrls(row.photo_urls),
    comments_count,
  };
}

/**
 * GET /api/public/v1/ayudas — solicitudes de ayuda activas (o cerradas/todas
 * con `estado`). Requiere API key (ver lib/publicApi.ts). No incluye
 * `contact_phone`: ver la nota en `toPublicAyuda`.
 */
export async function GET(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "ayudas");
  if (!rl.allowed) {
    return publicApiError(
      "rate_limited",
      "Demasiadas solicitudes. Probá de nuevo en un minuto.",
      429,
      rateLimitHeaders(rl)
    );
  }

  const client = tryCreateServerSupabaseClient();
  if (!client) {
    return publicApiError(
      "not_configured",
      "Supabase no está configurado en el servidor.",
      503,
      rateLimitHeaders(rl)
    );
  }

  const url = new URL(request.url);
  const municipio = url.searchParams.get("municipio");
  const categoriaRaw = url.searchParams.get("categoria");
  const estado = url.searchParams.get("estado") ?? "activo";
  const limit = parsePublicLimit(url.searchParams.get("limit"));

  if (categoriaRaw && !(categoriaRaw in CATEGORY_LABELS)) {
    return publicApiError(
      "invalid_categoria",
      `categoria inválida. Valores válidos: ${Object.keys(CATEGORY_LABELS).join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!["activo", "cerrado", "todos"].includes(estado)) {
    return publicApiError(
      "invalid_estado",
      "estado inválido. Valores válidos: activo, cerrado, todos.",
      400,
      rateLimitHeaders(rl)
    );
  }

  let query = client
    .from("reports")
    .select("*, comments(count)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (municipio) query = query.eq("municipality", municipio);
  if (categoriaRaw) query = query.eq("category", categoriaRaw as ReportCategory);

  const { data, error } = await query;
  if (error) {
    return publicApiError("upstream_error", error.message, 502, rateLimitHeaders(rl));
  }

  let rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeReport);
  if (estado === "activo") rows = rows.filter((r) => !isClosedStatus(r.status));
  if (estado === "cerrado") rows = rows.filter((r) => isClosedStatus(r.status));

  return Response.json(
    {
      data: rows.map(toPublicAyuda),
      count: rows.length,
      generated_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(rl) } }
  );
}

/**
 * POST /api/public/v1/ayudas — registra una solicitud de ayuda desde una
 * app aliada (misma API key que el GET). Queda visible en Pereira Unida
 * igual que un reporte creado desde la propia web: mismo nivel de
 * confianza (anónimo + rate limit + validación), sin cola de moderación.
 * Nunca se devuelve `contact_phone` en la respuesta ni en ningún GET
 * posterior — ver `toPublicAyuda`.
 */
export async function POST(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "ayudas:post", 20, 60_000);
  if (!rl.allowed) {
    return publicApiError(
      "rate_limited",
      "Demasiados envíos. Probá de nuevo en un minuto.",
      429,
      rateLimitHeaders(rl)
    );
  }

  let body: Partial<CreateAyudaBody>;
  try {
    body = (await request.json()) as Partial<CreateAyudaBody>;
  } catch {
    return publicApiError("invalid_json", "El body debe ser JSON válido.", 400, rateLimitHeaders(rl));
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = body.category as ReportCategory;
  const urgentLevel = (body.urgent_level as Report["urgent_level"]) || "moderado";
  const municipality = String(body.municipality ?? "").trim();
  const department = String(body.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
  const locationName = String(body.location_name ?? "").trim() || "Ubicación exacta";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const contactPhone = String(body.contact_phone ?? "").trim();

  if (!title) {
    return publicApiError("invalid_title", "title es obligatorio.", 400, rateLimitHeaders(rl));
  }
  if (!PUBLIC_API_VALID_CATEGORIES.includes(category)) {
    return publicApiError(
      "invalid_category",
      `category inválida. Valores válidos: ${PUBLIC_API_VALID_CATEGORIES.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!PUBLIC_API_VALID_URGENCY.includes(urgentLevel)) {
    return publicApiError(
      "invalid_urgent_level",
      `urgent_level inválido. Valores válidos: ${PUBLIC_API_VALID_URGENCY.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!isKnownCityName(municipality)) {
    return publicApiError("invalid_municipality", "municipality inválido.", 400, rateLimitHeaders(rl));
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inColombia(lat, lng)) {
    return publicApiError(
      "invalid_coordinates",
      "lat/lng son obligatorios y deben estar dentro de Colombia.",
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!contactPhone) {
    return publicApiError("invalid_contact_phone", "contact_phone es obligatorio.", 400, rateLimitHeaders(rl));
  }

  const sb = getPrivilegedSupabaseOrError();
  if (!sb.client) {
    return publicApiError("not_configured", sb.error, 503, rateLimitHeaders(rl));
  }

  const { data, error } = await sb.client
    .from("reports")
    .insert({
      title: title.slice(0, 200),
      description: description.slice(0, 2000),
      category,
      urgent_level: urgentLevel,
      status: "buscando",
      municipality,
      department,
      location_name: locationName.slice(0, 200),
      lat,
      lng,
      contact_phone: contactPhone.slice(0, 40),
      photo_urls: [],
    })
    .select("*, comments(count)")
    .single();

  if (error) {
    return publicApiError("insert_failed", error.message, 502, rateLimitHeaders(rl));
  }

  return Response.json(
    { data: toPublicAyuda(normalizeReport(data as Record<string, unknown>)) },
    { status: 201, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(rl) } }
  );
}
