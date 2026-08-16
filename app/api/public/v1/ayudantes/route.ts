import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import {
  checkPublicApiAuth,
  checkPublicApiRateLimit,
  parsePublicLimit,
  toPublicAyudante,
} from "@/lib/publicApi";
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
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  if (!checkPublicApiRateLimit(request, "ayudantes")) {
    return Response.json(
      { error: "Demasiadas solicitudes. Probá de nuevo en un minuto." },
      { status: 429 }
    );
  }

  const client = tryCreateServerSupabaseClient();
  if (!client) {
    return Response.json({ error: "Supabase no está configurado en el servidor." }, { status: 503 });
  }

  const url = new URL(request.url);
  const municipio = url.searchParams.get("municipio");
  const habilidadRaw = url.searchParams.get("habilidad");
  const incluirInactivas = url.searchParams.get("estado") === "todas";
  const limit = parsePublicLimit(url.searchParams.get("limit"));

  if (habilidadRaw && !(habilidadRaw in HELP_SKILL_LABELS)) {
    return Response.json(
      { error: `habilidad inválida. Valores válidos: ${Object.keys(HELP_SKILL_LABELS).join(", ")}` },
      { status: 400 }
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
      return Response.json({ data: [], count: 0, generated_at: new Date().toISOString() });
    }
    return Response.json({ error: error.message }, { status: 502 });
  }

  const rows = (data ?? []) as HelpOffer[];

  return Response.json(
    {
      data: rows.map(toPublicAyudante),
      count: rows.length,
      generated_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
