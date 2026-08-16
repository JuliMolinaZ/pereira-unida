import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import {
  checkPublicApiAuth,
  checkPublicApiRateLimit,
  parsePublicLimit,
  toPublicAyuda,
} from "@/lib/publicApi";
import { CATEGORY_LABELS, isClosedStatus, type Report, type ReportCategory } from "@/lib/types";
import { normalizePhotoUrls } from "@/lib/photos";

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
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  if (!checkPublicApiRateLimit(request, "ayudas")) {
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
  const categoriaRaw = url.searchParams.get("categoria");
  const estado = url.searchParams.get("estado") ?? "activo";
  const limit = parsePublicLimit(url.searchParams.get("limit"));

  if (categoriaRaw && !(categoriaRaw in CATEGORY_LABELS)) {
    return Response.json(
      { error: `categoria inválida. Valores válidos: ${Object.keys(CATEGORY_LABELS).join(", ")}` },
      { status: 400 }
    );
  }
  if (!["activo", "cerrado", "todos"].includes(estado)) {
    return Response.json(
      { error: "estado inválido. Valores válidos: activo, cerrado, todos." },
      { status: 400 }
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
    return Response.json({ error: error.message }, { status: 502 });
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
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
