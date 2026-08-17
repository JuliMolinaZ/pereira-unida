import { revalidatePath } from "next/cache";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { getPrivilegedSupabaseOrError } from "@/lib/supabase/privileged";
import {
  checkPublicApiAuth,
  checkPublicApiRateLimit,
  parsePublicLimit,
  publicApiError,
  rateLimitHeaders,
} from "@/lib/publicApi";
import {
  SERVICE_KIND_LABELS,
  SERVICE_KINDS,
  SERVICE_SEVERITIES,
  SERVICE_SEVERITY_LABELS,
  SERVICE_SEVERITY_RANK,
  SERVICE_STATUS_LABELS,
  type ServiceKind,
  type ServiceOutage,
  type ServiceOutageSeverity,
  type ServiceOutageStatus,
} from "@/lib/types";
import { normalizePhotoUrls } from "@/lib/photos";
import { buildServiceOutagesCsv, googleMapsUrl } from "@/lib/utils";
import { DEFAULT_DEPARTMENT, inColombia, isKnownCityName } from "@/lib/regions";

export const dynamic = "force-dynamic";

const STATUSES: ServiceOutageStatus[] = ["reportado", "en_atencion", "resuelto"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeOutage(row: ServiceOutage): ServiceOutage {
  return {
    ...row,
    photo_urls: normalizePhotoUrls(row.photo_urls, 3),
  };
}

function toPublicOutage(row: ServiceOutage) {
  return {
    id: row.id,
    service: row.service,
    service_label: SERVICE_KIND_LABELS[row.service],
    severity: row.severity,
    severity_label: SERVICE_SEVERITY_LABELS[row.severity],
    description: row.description,
    address: row.address,
    municipality: row.municipality,
    department: row.department ?? null,
    lat: row.lat,
    lng: row.lng,
    maps_url: googleMapsUrl(row.lat, row.lng),
    photo_urls: row.photo_urls,
    status: row.status,
    status_label: SERVICE_STATUS_LABELS[row.status],
    created_at: row.created_at,
  };
}

/**
 * GET /api/public/v1/servicios — daños de energía, postes, agua, gas e internet.
 * Pensado para dashboards de cuadrillas (Energía de Pereira, etc.). Siempre
 * ordenado por severidad (peligro_critico primero) y luego por fecha, para
 * que el despacho vea primero lo que puede matar. Nunca incluye teléfono.
 * `format=csv` abre directo en Excel.
 */
export async function GET(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "servicios");
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
  const departamento = url.searchParams.get("departamento");
  const servicioRaw = url.searchParams.get("servicio");
  const severidadRaw = url.searchParams.get("severidad");
  const estado = url.searchParams.get("estado") ?? "abierto";
  const desde = url.searchParams.get("desde");
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const limit = parsePublicLimit(url.searchParams.get("limit"));

  if (servicioRaw && !SERVICE_KINDS.includes(servicioRaw as ServiceKind)) {
    return publicApiError(
      "invalid_servicio",
      `servicio inválido. Valores válidos: ${SERVICE_KINDS.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (severidadRaw && !SERVICE_SEVERITIES.includes(severidadRaw as ServiceOutageSeverity)) {
    return publicApiError(
      "invalid_severidad",
      `severidad inválida. Valores válidos: ${SERVICE_SEVERITIES.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!["abierto", "resuelto", "todos", ...STATUSES].includes(estado)) {
    return publicApiError(
      "invalid_estado",
      "estado inválido. Valores válidos: abierto, resuelto, todos, reportado, en_atencion, resuelto.",
      400,
      rateLimitHeaders(rl)
    );
  }

  let query = client
    .from("service_outages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (municipio) query = query.eq("municipality", municipio);
  if (departamento) query = query.eq("department", departamento);
  if (servicioRaw) query = query.eq("service", servicioRaw);
  if (severidadRaw) query = query.eq("severity", severidadRaw);
  if (desde) query = query.gte("created_at", desde);

  const { data, error } = await query;
  if (error) {
    return publicApiError("upstream_error", error.message, 502, rateLimitHeaders(rl));
  }

  let rows = ((data ?? []) as ServiceOutage[]).map(normalizeOutage);
  if (estado === "abierto") {
    rows = rows.filter((row) => row.status !== "resuelto");
  } else if (estado === "resuelto") {
    rows = rows.filter((row) => row.status === "resuelto");
  } else if (STATUSES.includes(estado as ServiceOutageStatus)) {
    rows = rows.filter((row) => row.status === estado);
  }

  // Peligro de muerte primero (cable vivo, poste cayéndose), luego cortes de
  // sector, luego fallas puntuales; más reciente primero dentro de cada nivel.
  rows.sort((a, b) => {
    const rank = SERVICE_SEVERITY_RANK[a.severity] - SERVICE_SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const headers = { "Cache-Control": "private, no-store", ...rateLimitHeaders(rl) };

  if (format === "csv") {
    const csv = buildServiceOutagesCsv(rows, { includeContact: false });
    return new Response(csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="servicios-pereira-unida.csv"`,
      },
    });
  }

  return Response.json(
    {
      data: rows.map(toPublicOutage),
      count: rows.length,
      generated_at: new Date().toISOString(),
    },
    { headers }
  );
}

interface CreateServicioBody {
  service?: string;
  severity?: string;
  description?: string;
  address?: string;
  municipality?: string;
  department?: string;
  lat?: number;
  lng?: number;
  contact?: string;
}

/**
 * POST /api/public/v1/servicios — crea un daño de servicio desde un sistema
 * externo (Energía de Pereira u otra integración con API key). Mismo nivel
 * de confianza que el formulario público: anónimo + rate limit + validación,
 * sin cola de moderación. Requiere lat/lng exactos para poder ubicarlo bien
 * en el mapa — sin eso no hay forma de que una cuadrilla lo encuentre.
 */
export async function POST(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "servicios:post", 20, 60_000);
  if (!rl.allowed) {
    return publicApiError(
      "rate_limited",
      "Demasiados envíos. Probá de nuevo en un minuto.",
      429,
      rateLimitHeaders(rl)
    );
  }

  let body: CreateServicioBody;
  try {
    body = (await request.json()) as CreateServicioBody;
  } catch {
    return publicApiError("invalid_json", "El body debe ser JSON válido.", 400, rateLimitHeaders(rl));
  }

  const service = String(body.service ?? "") as ServiceKind;
  const severity = String(body.severity ?? "") as ServiceOutageSeverity;
  const description = String(body.description ?? "").trim();
  const address = String(body.address ?? "").trim();
  const municipality = String(body.municipality ?? "").trim();
  const department = String(body.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
  const contact = String(body.contact ?? "").trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!SERVICE_KINDS.includes(service)) {
    return publicApiError(
      "invalid_service",
      `service inválido. Valores válidos: ${SERVICE_KINDS.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!SERVICE_SEVERITIES.includes(severity)) {
    return publicApiError(
      "invalid_severity",
      `severity inválida. Valores válidos: ${SERVICE_SEVERITIES.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  if (!description) {
    return publicApiError("invalid_description", "description es obligatorio.", 400, rateLimitHeaders(rl));
  }
  if (!address) {
    return publicApiError("invalid_address", "address es obligatorio.", 400, rateLimitHeaders(rl));
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

  const sb = getPrivilegedSupabaseOrError();
  if (!sb.client) {
    return publicApiError("not_configured", sb.error, 503, rateLimitHeaders(rl));
  }

  const { data, error } = await sb.client
    .from("service_outages")
    .insert({
      service,
      severity,
      description: description.slice(0, 400),
      address: address.slice(0, 200),
      municipality,
      department,
      contact: contact.slice(0, 80),
      photo_urls: [],
      lat,
      lng,
      status: "reportado",
    })
    .select("*")
    .single();

  if (error) {
    return publicApiError("insert_failed", error.message, 502, rateLimitHeaders(rl));
  }

  revalidatePath("/");
  return Response.json(
    { data: toPublicOutage(normalizeOutage(data as ServiceOutage)) },
    { status: 201, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(rl) } }
  );
}

/**
 * PATCH /api/public/v1/servicios?id=<uuid> — actualiza el estado de un daño
 * (body: {"status": "en_atencion" | "resuelto" | "reportado"}). Pensado
 * para que el sistema de despacho de una cuadrilla (Energía de Pereira,
 * etc.) cierre el reporte cuando atiende el punto, sin depender de que
 * alguien lo marque desde la web pública.
 */
export async function PATCH(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "servicios:patch", 30, 60_000);
  if (!rl.allowed) {
    return publicApiError(
      "rate_limited",
      "Demasiadas solicitudes. Probá de nuevo en un minuto.",
      429,
      rateLimitHeaders(rl)
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return publicApiError(
      "invalid_id",
      "Pasá el id del daño como query param: ?id=<uuid>.",
      400,
      rateLimitHeaders(rl)
    );
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return publicApiError("invalid_json", "El body debe ser JSON válido.", 400, rateLimitHeaders(rl));
  }

  const status = String(body.status ?? "");
  if (!STATUSES.includes(status as ServiceOutageStatus)) {
    return publicApiError(
      "invalid_status",
      `status inválido. Valores válidos: ${STATUSES.join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }

  const sb = getPrivilegedSupabaseOrError();
  if (!sb.client) {
    return publicApiError("not_configured", sb.error, 503, rateLimitHeaders(rl));
  }

  const { data, error } = await sb.client
    .from("service_outages")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return publicApiError(
      error.code === "PGRST116" ? "not_found" : "update_failed",
      error.code === "PGRST116" ? "No existe un daño con ese id." : error.message,
      error.code === "PGRST116" ? 404 : 502,
      rateLimitHeaders(rl)
    );
  }

  revalidatePath("/");
  return Response.json(
    { data: toPublicOutage(normalizeOutage(data as ServiceOutage)) },
    { headers: { "Cache-Control": "no-store", ...rateLimitHeaders(rl) } }
  );
}
