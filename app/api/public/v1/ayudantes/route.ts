import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { getPrivilegedSupabaseOrError } from "@/lib/supabase/privileged";
import {
  checkPublicApiAuth,
  checkPublicApiRateLimit,
  parsePublicLimit,
  publicApiError,
  rateLimitHeaders,
  toPublicAyudante,
  type CreateAyudanteBody,
} from "@/lib/publicApi";
import { DEFAULT_DEPARTMENT, isKnownCityName } from "@/lib/regions";
import { HELP_SKILL_LABELS, type HelpOffer, type HelpSkill } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/ayudantes — personas/oficios que ofrecieron ayuda
 * (status activa por defecto). Requiere API key. No incluye `phone`: ver
 * la nota en `toPublicAyudante`.
 */
export async function GET(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "ayudantes");
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
  const habilidadRaw = url.searchParams.get("habilidad");
  const incluirInactivas = url.searchParams.get("estado") === "todas";
  const limit = parsePublicLimit(url.searchParams.get("limit"));

  if (habilidadRaw && !(habilidadRaw in HELP_SKILL_LABELS)) {
    return publicApiError(
      "invalid_habilidad",
      `habilidad inválida. Valores válidos: ${Object.keys(HELP_SKILL_LABELS).join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }

  let query = client
    .from("help_offers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!incluirInactivas) query = query.eq("status", "activa");
  if (municipio) query = query.eq("municipality", municipio);
  if (habilidadRaw) query = query.eq("skill", habilidadRaw as HelpSkill);

  const { data, error } = await query;
  if (error) {
    if (/help_offers/i.test(error.message) && /schema cache|does not exist/i.test(error.message)) {
      return Response.json(
        { data: [], count: 0, generated_at: new Date().toISOString() },
        { headers: rateLimitHeaders(rl) }
      );
    }
    return publicApiError("upstream_error", error.message, 502, rateLimitHeaders(rl));
  }

  const rows = (data ?? []) as HelpOffer[];

  return Response.json(
    {
      data: rows.map(toPublicAyudante),
      count: rows.length,
      generated_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(rl) } }
  );
}

/**
 * POST /api/public/v1/ayudantes — registra una oferta de ayuda desde una
 * app aliada. Mismo modelo de confianza que POST /ayudas (ver esa ruta):
 * anónimo + rate limit + validación, visible de inmediato, sin `phone` en
 * la respuesta ni en ningún GET posterior.
 */
export async function POST(request: Request) {
  const auth = checkPublicApiAuth(request);
  if (!auth.ok) {
    return publicApiError(auth.code, auth.error, auth.status);
  }
  const rl = checkPublicApiRateLimit(request, "ayudantes:post", 20, 60_000);
  if (!rl.allowed) {
    return publicApiError(
      "rate_limited",
      "Demasiados envíos. Probá de nuevo en un minuto.",
      429,
      rateLimitHeaders(rl)
    );
  }

  let body: Partial<CreateAyudanteBody>;
  try {
    body = (await request.json()) as Partial<CreateAyudanteBody>;
  } catch {
    return publicApiError("invalid_json", "El body debe ser JSON válido.", 400, rateLimitHeaders(rl));
  }

  const fullName = String(body.full_name ?? "").trim();
  const skill = body.skill as HelpSkill;
  const description = String(body.description ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const municipality = String(body.municipality ?? "").trim();
  const department = String(body.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;

  if (!fullName) {
    return publicApiError("invalid_full_name", "full_name es obligatorio.", 400, rateLimitHeaders(rl));
  }
  if (!(skill in HELP_SKILL_LABELS)) {
    return publicApiError(
      "invalid_skill",
      `skill inválido. Valores válidos: ${Object.keys(HELP_SKILL_LABELS).join(", ")}`,
      400,
      rateLimitHeaders(rl)
    );
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) {
    return publicApiError("invalid_phone", "phone debe ser un teléfono válido.", 400, rateLimitHeaders(rl));
  }
  if (!isKnownCityName(municipality)) {
    return publicApiError("invalid_municipality", "municipality inválido.", 400, rateLimitHeaders(rl));
  }

  const sb = getPrivilegedSupabaseOrError();
  if (!sb.client) {
    return publicApiError("not_configured", sb.error, 503, rateLimitHeaders(rl));
  }

  const { data, error } = await sb.client
    .from("help_offers")
    .insert({
      full_name: fullName.slice(0, 80),
      skill,
      description: description.slice(0, 800),
      phone,
      municipality,
      department,
      status: "activa",
    })
    .select("*")
    .single();

  if (error) {
    return publicApiError("insert_failed", error.message, 502, rateLimitHeaders(rl));
  }

  return Response.json(
    { data: toPublicAyudante(data as HelpOffer) },
    { status: 201, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(rl) } }
  );
}
