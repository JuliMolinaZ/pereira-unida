import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sincroniza tres fuentes externas (Ayudas Pereira, Corag, Pereira Responde)
 * hacia nuestras propias tablas `external_*`. Ver
 * supabase/migrations/20260817000000_external_sources.sql para el esquema y
 * README.md para el porqué de cada decisión.
 *
 * Sin Cron frecuente (plan Hobby de Vercel = 1x al día), esto se dispara
 * desde el propio tráfico de la app (ver `maybeTriggerExternalSync`), con un
 * candado en `external_sync_state` para que cientos de visitas simultáneas no
 * disparen la misma sincronización a la vez.
 */

const AYUDAS_PEREIRA_URL = "https://yjkyzfuixdpuhgthoeua.supabase.co";
/**
 * Publishable key de Ayudas Pereira. Es pública por diseño (viaja al
 * navegador de cualquier visitante de su app; la protección real son sus
 * políticas RLS, no este valor) — el propio repo la versiona en su
 * `.env.production`. No es un secreto nuestro.
 */
const AYUDAS_PEREIRA_ANON_KEY = "sb_publishable_hWboFTjrnhfsAn5gXDW_Gg_rqx2iGLR";

const CORAG_BASE = "https://ayuda.corag.app/api/public/v1/help";
const PEREIRA_RESPONDE_URL = "https://pereiraresponde.co/api/public/v1/reports?limit=500";

const MIN_SECONDS_BETWEEN_SYNCS = 180;
const STALE_CLAIM_SECONDS = 120;

type Fuente = "ayudas_pereira" | "corag" | "pereira_responde";

/** La tarjeta trunca visualmente a 2 líneas (line-clamp-2); no tiene sentido
 * transferir un párrafo entero por celular para mostrar solo el principio. */
function truncate(value: string | null, max: number): string | null {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function ourServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Intenta reclamar el turno de sincronizar una fuente. Atómico: solo un request gana. */
async function claim(client: SupabaseClient, fuente: Fuente): Promise<boolean> {
  const now = new Date();
  const staleClaim = new Date(now.getTime() - STALE_CLAIM_SECONDS * 1000).toISOString();
  const staleSync = new Date(now.getTime() - MIN_SECONDS_BETWEEN_SYNCS * 1000).toISOString();

  const { data, error } = await client
    .from("external_sync_state")
    .update({ syncing_since: now.toISOString() })
    .eq("fuente", fuente)
    .or(`syncing_since.is.null,syncing_since.lt.${staleClaim}`)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleSync}`)
    .select("fuente");

  if (error) {
    console.error(`external sync claim(${fuente}) error:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function release(client: SupabaseClient, fuente: Fuente, err: string | null) {
  await client
    .from("external_sync_state")
    .update({
      syncing_since: null,
      last_synced_at: err ? undefined : new Date().toISOString(),
      last_error: err,
    })
    .eq("fuente", fuente);
}

/** Borra de nuestra tabla lo que ya no vino en la última sincronización (centro cerrado, ayuda resuelta, etc.). */
async function pruneMissing(
  client: SupabaseClient,
  table: string,
  fuente: Fuente,
  keepIds: string[]
) {
  let query = client.from(table).delete().eq("fuente", fuente);
  query = keepIds.length > 0 ? query.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`) : query;
  const { error } = await query;
  if (error) console.error(`external sync prune(${table}) error:`, error.message);
}

/** Ayudas Pereira: centros de acopio + qué necesitan. Ver esquema real documentado en su repo. */
async function syncAyudasPereira(ourClient: SupabaseClient): Promise<void> {
  const theirClient = createClient(AYUDAS_PEREIRA_URL, AYUDAS_PEREIRA_ANON_KEY, {
    auth: { persistSession: false },
  });

  const [centrosRes, ciudadesRes, necesidadesRes] = await Promise.all([
    theirClient
      .from("centros")
      .select("id,ciudad_id,nombre,direccion,notas,activo,created_at,lat,lng,foto,abierto")
      .eq("activo", true),
    theirClient.from("ciudades").select("id,nombre,departamento,slug,activa,fusionada_en"),
    theirClient.from("necesidades").select("id,centro_id,categoria,prioridad,estado"),
  ]);

  if (centrosRes.error) throw new Error(`centros: ${centrosRes.error.message}`);

  const ciudadById = new Map(
    (ciudadesRes.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c])
  );
  // Deduplicado por categoría: la fuente repite el mismo párrafo de
  // descripción en cada fila de "necesidades" de un centro (a veces 5-6
  // veces), y esa descripción no se muestra en ningún lado — solo la
  // categoría. Guardar las 6 copias triplicaba el peso de la home sin
  // aportar nada.
  const necesidadesPorCentro = new Map<string, Map<string, { categoria: string; prioridad: string }>>();
  for (const n of (necesidadesRes.data ?? []) as Record<string, unknown>[]) {
    const centroId = n.centro_id as string;
    const categoria = String(n.categoria ?? "");
    if (!categoria) continue;
    const porCategoria = necesidadesPorCentro.get(centroId) ?? new Map();
    if (!porCategoria.has(categoria)) {
      porCategoria.set(categoria, { categoria, prioridad: String(n.prioridad ?? "normal") });
    }
    necesidadesPorCentro.set(centroId, porCategoria);
  }

  const rows = ((centrosRes.data ?? []) as Record<string, unknown>[]).map((c) => {
    const ciudad = ciudadById.get(c.ciudad_id as string) as { nombre?: string } | undefined;
    return {
      id: `ayudas_pereira:${c.id}`,
      fuente: "ayudas_pereira" as const,
      external_id: String(c.id),
      nombre: String(c.nombre ?? "Centro sin nombre"),
      direccion: (c.direccion as string | null) ?? null,
      municipality: ciudad?.nombre ?? null,
      lat: (c.lat as number | null) ?? null,
      lng: (c.lng as number | null) ?? null,
      abierto: Boolean(c.abierto),
      foto: (c.foto as string | null) ?? null,
      necesidades: [...(necesidadesPorCentro.get(String(c.id))?.values() ?? [])],
      synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await ourClient.from("external_centros").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`upsert external_centros: ${error.message}`);
  }
  await pruneMissing(ourClient, "external_centros", "ayudas_pereira", rows.map((r) => r.id));
}

/** Corag: ayuda directa entre personas (peticiones y ofrecimientos), sin autenticación para leer. */
async function syncCorag(ourClient: SupabaseClient): Promise<void> {
  async function fetchList(tipo: "request" | "offer") {
    const params = new URLSearchParams({ view: "list", status: "active", type: tipo, limit: "100" });
    const res = await fetch(`${CORAG_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Corag ${tipo} respondió ${res.status}`);
    const json = (await res.json()) as { items?: Record<string, unknown>[] };
    return json.items ?? [];
  }

  const [requests, offers] = await Promise.all([fetchList("request"), fetchList("offer")]);
  const items = [...requests, ...offers];

  const rows = items.map((item) => {
    const location = item.location as Record<string, unknown> | null;
    const contact = item.contact as Record<string, unknown> | null;
    return {
      id: `corag:${item.id}`,
      fuente: "corag" as const,
      external_id: String(item.id),
      tipo: String(item.type) as "request" | "offer",
      title: truncate(String(item.title ?? "Sin título"), 140) as string,
      description: truncate((item.description as string | null) ?? null, 280),
      category: (item.category as string | null) ?? null,
      urgency: (item.urgency as string | null) ?? null,
      status: (item.status as string | null) ?? null,
      address: (location?.address as string | null) ?? null,
      municipality: (location?.neighborhood as string | null) ?? null,
      lat: (location?.latitude as number | null) ?? null,
      lng: (location?.longitude as number | null) ?? null,
      contact_name: (contact?.name as string | null) ?? null,
      contact_whatsapp: (contact?.whatsapp as string | null) ?? null,
      public_url: (item.publicUrl as string | null) ?? null,
      created_at_source: (item.createdAt as string | null) ?? null,
      synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await ourClient.from("external_ayudas").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`upsert external_ayudas: ${error.message}`);
  }
  await pruneMissing(ourClient, "external_ayudas", "corag", rows.map((r) => r.id));
}

const RIESGO_A_GRAVEDAD: Record<string, string> = {
  high: "alta",
  medium: "media",
};

const NOTA_VACIA = "Ubicación registrada";

/** Pereira Responde: daños estructurales y vías cerradas. Solo lectura, sin autenticación. Nunca se cargan sus fotos (pesan 3-7MB cada una, ver su propia doc). */
async function syncPereiraResponde(ourClient: SupabaseClient): Promise<void> {
  const res = await fetch(PEREIRA_RESPONDE_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Pereira Responde respondió ${res.status}`);
  const json = (await res.json()) as { reports?: Record<string, unknown>[] };
  const reports = json.reports ?? [];

  const rows = reports.map((r) => {
    const coords = r.coords;
    let lat: number | null = null;
    let lng: number | null = null;
    if (Array.isArray(coords) && coords.length >= 2) {
      const [a, b] = coords;
      if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0)) {
        lat = a;
        lng = b;
      }
    }
    const title = String(r.title ?? "Afectación sin clasificar");
    const areaRaw = typeof r.area === "string" ? r.area.trim() : "";
    const nota =
      areaRaw && areaRaw !== NOTA_VACIA && areaRaw.toLowerCase() !== title.toLowerCase()
        ? truncate(areaRaw, 200)
        : null;
    const photos = Array.isArray(r.photos) ? r.photos : [];

    return {
      id: `pereira_responde:${r.id}`,
      fuente: "pereira_responde" as const,
      external_id: String(r.id),
      tipo: String(r.type) as "housing" | "road" | "support",
      gravedad: RIESGO_A_GRAVEDAD[String(r.risk)] ?? "sin-clasificar",
      title,
      subtipo: (r.category as string | null) ?? null,
      nota,
      lat,
      lng,
      photo_count: photos.length,
      votes: typeof r.votes === "number" ? r.votes : 0,
      score: typeof r.score === "number" ? r.score : 0,
      created_at_source: (r.createdAt as string | null) ?? null,
      synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await ourClient.from("external_afectaciones").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`upsert external_afectaciones: ${error.message}`);
  }
  await pruneMissing(ourClient, "external_afectaciones", "pereira_responde", rows.map((r) => r.id));
}

const SYNCERS: Record<Fuente, (client: SupabaseClient) => Promise<void>> = {
  ayudas_pereira: syncAyudasPereira,
  corag: syncCorag,
  pereira_responde: syncPereiraResponde,
};

export type SyncSummary = Record<Fuente, "ok" | "skipped" | string>;

/** Corre las tres sincronizaciones que logren reclamar su turno. Tolerante a fallos parciales. */
export async function runExternalSync(): Promise<SyncSummary> {
  const client = ourServiceClient();
  const summary = {} as SyncSummary;
  if (!client) {
    return { ayudas_pereira: "sin SUPABASE_SERVICE_ROLE_KEY", corag: "sin SUPABASE_SERVICE_ROLE_KEY", pereira_responde: "sin SUPABASE_SERVICE_ROLE_KEY" };
  }

  for (const fuente of Object.keys(SYNCERS) as Fuente[]) {
    const won = await claim(client, fuente);
    if (!won) {
      summary[fuente] = "skipped";
      continue;
    }
    try {
      await SYNCERS[fuente](client);
      await release(client, fuente, null);
      summary[fuente] = "ok";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`external sync (${fuente}) failed:`, message);
      await release(client, fuente, message);
      summary[fuente] = message;
    }
  }

  return summary;
}

/**
 * Dispara una sincronización en segundo plano sin bloquear la respuesta.
 * Pensado para llamarse desde `getHomeData()` con `after()` de Next.js: el
 * candado en `external_sync_state` hace que aunque esta función se llame en
 * cientos de requests simultáneos, solo una en ~3 minutos hace trabajo real.
 */
export function scheduleExternalSync(): Promise<SyncSummary> {
  return runExternalSync().catch((err) => {
    console.error("scheduleExternalSync error:", err instanceof Error ? err.message : err);
    return {} as SyncSummary;
  });
}
