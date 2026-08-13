"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  tryCreateServerSupabaseClient,
} from "@/lib/supabase/server";
import {
  getSupabaseConfigError,
  SUPABASE_CONFIG_ERROR_MESSAGE,
} from "@/lib/supabase/config";
import type {
  CollectionPoint,
  Comment,
  HomeData,
  Municipality,
  PeopleStatus,
  PersonStatus,
  Report,
  ReportCategory,
  ReportStatus,
  UrgentLevel,
} from "@/lib/types";
import {
  explainPhotoFailure,
  isAllowedPhotoType,
  isPhotoBlob,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ENTRY,
  normalizePhotoUrls,
  PHOTO_BUCKET,
} from "@/lib/photos";
import { deleteSpaceObjects, isSpacesConfigured, uploadSpaceObject } from "@/lib/spaces";

const VALID_CATEGORIES: ReportCategory[] = [
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

const VALID_URGENCY: UrgentLevel[] = ["critico", "moderado", "atendido"];
const VALID_STATUS: ReportStatus[] = [
  "buscando",
  "en_camino",
  "resuelto",
  "informacion_falsa",
  "duplicado",
];
const VALID_MUNICIPALITIES: Municipality[] = ["Pereira", "Dosquebradas"];
const VALID_PERSON_STATUS: PersonStatus[] = [
  "a_salvo",
  "necesito_traslado",
  "sin_conexion",
];

export interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rate limit muy simple en memoria por IP + acción. No es distribuido (se
 * resetea en cada redeploy / instancia), pero basta para frenar abuso
 * trivial en un MVP de emergencia sin autenticación. Ver README.
 */
const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(
  action: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";

  // Sin IP no podemos distinguir clientes: limitar aquí penalizaría a todo
  // el mundo por igual (o dejaría a un solo abusador bloquear a otros
  // detrás del mismo bucket "unknown"). Fail open.
  if (ip === "unknown") return true;

  const key = `${action}:${ip}`;
  const now = Date.now();
  const bucket = RATE_LIMIT_BUCKETS.get(key);

  if (!bucket || now > bucket.resetAt) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Cliente de Supabase o el mensaje de error de configuración, en un único
 * objeto para poder narrowear con `if (!sb.client)` sin perder el tipo de
 * `sb.error`. Úsalo en TODA acción/lectura antes de tocar la red: si la
 * config es un placeholder, `client` es null y jamás se llama a fetch.
 */
type SupabaseOrError =
  | { client: SupabaseClient; error: null }
  | { client: null; error: string };

function getSupabaseOrError(): SupabaseOrError {
  const client = tryCreateServerSupabaseClient();
  if (client) return { client, error: null };
  return { client: null, error: getSupabaseConfigError() ?? SUPABASE_CONFIG_ERROR_MESSAGE };
}

/** Quita caracteres especiales de ilike/or (%, _, comas, paréntesis) y
 * acota longitud, tanto para .ilike() sueltos como para filtros .or(). */
function sanitizeIlikeInput(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/[%_,()]/g, " ").trim().slice(0, 80);
}

/** Clasifica un mensaje crudo de Postgrest/fetch en uno de los 3 mensajes
 * que la UI de la home puede mostrar de forma útil. */
function classifyHomeDataError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("network")
  ) {
    return "No pudimos conectar con Supabase (fetch failed). Revisa que la URL del proyecto exista y que tu red permita supabase.co.";
  }

  if (
    lower.includes("relation") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    lower.includes("photo_urls")
  ) {
    return "Falta aplicar schema.sql en el SQL Editor de Supabase.";
  }

  return rawMessage;
}

async function detectImageKind(file: Blob): Promise<"jpeg" | "png" | "webp" | "heic" | null> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brands = String.fromCharCode(...buf.slice(8, 16)).toLowerCase();
    if (
      brands.includes("hei") ||
      brands.includes("mif1") ||
      brands.includes("msf1") ||
      brands.includes("heif")
    ) {
      return "heic";
    }
  }
  return null;
}

function photoExtension(kind: "jpeg" | "png" | "webp" | "heic"): string {
  if (kind === "png") return "png";
  if (kind === "webp") return "webp";
  if (kind === "heic") return "heic";
  return "jpg";
}

function photoContentType(kind: "jpeg" | "png" | "webp" | "heic"): string {
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  if (kind === "heic") return "image/heic";
  return "image/jpeg";
}

/**
 * Sube hasta 3 fotos a DigitalOcean Spaces (CDN). Si Spaces no está
 * configurado, cae a Supabase Storage. Vacío = ok. Si una es inválida,
 * no deja ninguna.
 */
async function uploadFormPhotos(
  client: SupabaseClient,
  folder: "reports" | "people",
  formData: FormData
): Promise<{ urls: string[]; error?: string }> {
  const files = formData.getAll("photos").filter(isPhotoBlob);

  if (files.length === 0) return { urls: [] };
  if (files.length > MAX_PHOTOS_PER_ENTRY) {
    return {
      urls: [],
      error: `Puedes adjuntar máximo ${MAX_PHOTOS_PER_ENTRY} fotos.`,
    };
  }

  const prepared: { bytes: Uint8Array; kind: "jpeg" | "png" | "webp" | "heic" }[] = [];

  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      return {
        urls: [],
        error: `Cada foto debe pesar menos de ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`,
      };
    }
    const type = ("type" in file ? String(file.type) : "").toLowerCase();
    if (type && !isAllowedPhotoType(type)) {
      return {
        urls: [],
        error: "Solo se permiten fotos JPEG, PNG, WebP o HEIC.",
      };
    }
    const kind = await detectImageKind(file);
    if (!kind) {
      return {
        urls: [],
        error:
          "Uno de los archivos no parece una imagen válida. Prueba con una JPEG o PNG.",
      };
    }
    try {
      prepared.push({ bytes: new Uint8Array(await file.arrayBuffer()), kind });
    } catch {
      return {
        urls: [],
        error: "No se pudo leer una de las fotos. Prueba con otra JPEG o PNG.",
      };
    }
  }

  if (isSpacesConfigured()) {
    const urls: string[] = [];
    const uploadedKeys: string[] = [];
    try {
      for (const { bytes, kind } of prepared) {
        const key = `photos/${folder}/${crypto.randomUUID()}.${photoExtension(kind)}`;
        const url = await uploadSpaceObject({
          key,
          body: bytes,
          contentType: photoContentType(kind),
        });
        uploadedKeys.push(key);
        urls.push(url);
      }
      return { urls };
    } catch (err) {
      if (uploadedKeys.length > 0) {
        await deleteSpaceObjects(uploadedKeys).catch(() => undefined);
      }
      const message = err instanceof Error ? err.message : "No se pudo subir la foto.";
      return { urls: [], error: explainPhotoFailure(message) };
    }
  }

  const urls: string[] = [];
  const uploadedPaths: string[] = [];
  const storage = getStorageSupabaseClient() ?? client;

  for (const { bytes, kind } of prepared) {
    const path = `${folder}/${crypto.randomUUID()}.${photoExtension(kind)}`;
    const { error } = await storage.storage.from(PHOTO_BUCKET).upload(path, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: photoContentType(kind),
    });
    if (error) {
      if (uploadedPaths.length > 0) {
        await storage.storage.from(PHOTO_BUCKET).remove(uploadedPaths);
      }
      return { urls: [], error: explainPhotoFailure(error.message) };
    }
    uploadedPaths.push(path);
    const { data } = storage.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return { urls };
}

function withPhotoUrls<T extends { photo_urls?: unknown }>(row: T): T & { photo_urls: string[] } {
  return { ...row, photo_urls: normalizePhotoUrls(row.photo_urls) };
}

function embedCount(rel: unknown): number {
  if (!Array.isArray(rel) || rel.length === 0) return 0;
  const n = (rel[0] as { count?: unknown })?.count;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeReport(row: Record<string, unknown>): Report {
  const comments_count = embedCount(row.comments);
  const rest = { ...row };
  delete rest.comments;
  return withPhotoUrls({
    ...(rest as unknown as Report),
    comments_count,
  });
}

const SELECT_WITH_COMMENTS = "*, comments(count)";

type ReportListFilters = {
  category?: ReportCategory | "todos";
  urgency?: UrgentLevel | "todos";
  municipality?: Municipality | "todos";
  search?: string;
};

async function loadReports(
  client: SupabaseClient,
  filters?: ReportListFilters
): Promise<{ rows: Report[]; error: string | null }> {
  const run = (select: string) => {
    let query = client
      .from("reports")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filters?.category && filters.category !== "todos") {
      query = query.eq("category", filters.category);
    }
    if (filters?.urgency && filters.urgency !== "todos") {
      query = query.eq("urgent_level", filters.urgency);
    }
    if (filters?.municipality && filters.municipality !== "todos") {
      query = query.eq("municipality", filters.municipality);
    }
    const q = sanitizeIlikeInput(filters?.search);
    if (q) {
      query = query.or(
        `title.ilike.%${q}%,description.ilike.%${q}%,location_name.ilike.%${q}%`
      );
    }
    return query;
  };

  let { data, error } = await run(SELECT_WITH_COMMENTS);
  if (error && /comments/i.test(error.message)) {
    ({ data, error } = await run("*"));
  }
  if (error) return { rows: [], error: error.message };
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeReport),
    error: null,
  };
}

/**
 * Cliente de Supabase para altas administradas por PIN (centros de acopio).
 * Usa la service role si está configurada (bypassa RLS de forma controlada
 * en el server); si no, cae al cliente anon normal y la única barrera es el
 * PIN validado en el server action. Solo se llama después de confirmar que
 * NEXT_PUBLIC_SUPABASE_URL/ANON_KEY son válidas (ver createCollectionPoint).
 */
/** Storage: la service role bypasea RLS del bucket (las policies
 * públicas a veces no quedan aplicadas en el dashboard). */
function getStorageSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function getAcopioSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }
  return createServerSupabaseClient();
}

/** Compara dos strings en tiempo constante (evita timing attacks sobre el PIN). */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Crea un nuevo reporte de necesidad a partir de un FormData (usado por el
 * modal "Reportar Necesidad" del FAB).
 */
export async function createReport(
  formData: FormData
): Promise<ActionResult<Report>> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "") as ReportCategory;
  const urgentLevel = String(
    formData.get("urgent_level") ?? "moderado"
  ) as UrgentLevel;
  const municipality = String(
    formData.get("municipality") ?? "Pereira"
  ) as Municipality;
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const locationName =
    String(formData.get("location_name") ?? "").trim() ||
    (Number.isFinite(lat) && Number.isFinite(lng) ? "Ubicación exacta" : "");

  if (!title) return { success: false, error: "El título es obligatorio." };
  if (!contactPhone)
    return { success: false, error: "El teléfono de contacto es obligatorio." };
  if (!VALID_CATEGORIES.includes(category))
    return { success: false, error: "Categoría inválida." };
  if (!VALID_URGENCY.includes(urgentLevel))
    return { success: false, error: "Nivel de urgencia inválido." };
  if (!VALID_MUNICIPALITIES.includes(municipality))
    return { success: false, error: "Municipio inválido." };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      success: false,
      error: "Selecciona tu ubicación exacta con el GPS o en el mapa.",
    };
  }

  const allowed = await checkRateLimit("createReport", 5, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const photos = await uploadFormPhotos(sb.client, "reports", formData);
  if (photos.error) return { success: false, error: photos.error };

  const { data, error } = await sb.client
    .from("reports")
    .insert({
      title,
      description,
      category,
      urgent_level: urgentLevel,
      status: "buscando",
      municipality,
      location_name: locationName,
      lat,
      lng,
      contact_phone: contactPhone,
      photo_urls: photos.urls,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: explainPhotoFailure(classifyHomeDataError(error.message)),
    };
  }

  revalidatePath("/");
  return { success: true, data: normalizeReport(data as unknown as Record<string, unknown>) };
}

/**
 * Actualiza el estado comunitario de un reporte
 * (en camino, resuelto, información falsa, duplicado o reabrir).
 */
export async function updateReportStatus(
  reportId: string,
  newStatus: ReportStatus
): Promise<ActionResult> {
  if (!reportId) return { success: false, error: "reportId es requerido." };
  if (!VALID_STATUS.includes(newStatus))
    return { success: false, error: "Estado inválido." };

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { error } = await sb.client
    .from("reports")
    .update({ status: newStatus })
    .eq("id", reportId);

  if (error) {
    if (error.message.includes("reports_status_check")) {
      return {
        success: false,
        error:
          "Este estado aún no está habilitado. Aplica la migración 20260813140000_report_status_flags.sql en Supabase.",
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

/**
 * Agrega un comentario a un reporte.
 */
export async function addComment(
  reportId: string,
  author: string,
  content: string
): Promise<ActionResult<Comment>> {
  const trimmedContent = content.trim().slice(0, 280);
  const trimmedAuthor = author.trim() || "Anónimo";

  if (!reportId) return { success: false, error: "reportId es requerido." };
  if (!trimmedContent)
    return { success: false, error: "El comentario no puede estar vacío." };

  const allowed = await checkRateLimit("addComment", 10, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Estás comentando muy rápido. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("comments")
    .insert({
      report_id: reportId,
      author_name: trimmedAuthor,
      content: trimmedContent,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true, data: data as Comment };
}

/**
 * Obtiene reportes con filtros opcionales de municipio, categoría, urgencia
 * y búsqueda de texto libre (título, descripción o ubicación). Con config
 * de Supabase inválida o error de red retorna null (el cliente no pisa la lista).
 */
export async function getReports(
  categoryFilter?: ReportCategory | "todos",
  urgencyFilter?: UrgentLevel | "todos",
  searchQuery?: string,
  municipalityFilter?: Municipality | "todos"
): Promise<Report[] | null> {
  const sb = getSupabaseOrError();
  if (!sb.client) return null;

  try {
    const pack = await loadReports(sb.client, {
      category: categoryFilter,
      urgency: urgencyFilter,
      municipality: municipalityFilter,
      search: searchQuery,
    });
    if (pack.error) {
      console.error("getReports error:", pack.error);
      return null;
    }
    return pack.rows;
  } catch (err) {
    console.error("getReports error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Obtiene los comentarios de un reporte, ordenados cronológicamente.
 */
export async function getComments(reportId: string): Promise<Comment[]> {
  const sb = getSupabaseOrError();
  if (!sb.client) return [];

  try {
    const { data, error } = await sb.client
      .from("comments")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getComments error:", error.message);
      return [];
    }
    return (data ?? []) as Comment[];
  } catch (err) {
    console.error("getComments error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Obtiene los centros de acopio oficiales.
 */
export async function getCollectionPoints(): Promise<CollectionPoint[]> {
  const sb = getSupabaseOrError();
  if (!sb.client) return [];

  try {
    const { data, error } = await sb.client
      .from("collection_points")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("getCollectionPoints error:", error.message);
      return [];
    }
    return (data ?? []) as CollectionPoint[];
  } catch (err) {
    console.error("getCollectionPoints error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Carga los datos iniciales de la home (reportes + puntos de acopio) en un
 * solo viaje, distinguiendo tres causas de fallo para mostrar un mensaje
 * útil en español en vez de una lista vacía sin explicación:
 *   1. Config inválida (placeholder) — no se intenta ningún fetch.
 *   2. Red/DNS caído con config válida ("fetch failed").
 *   3. Config válida pero falta aplicar schema.sql (tabla/relation inexistente).
 */
export async function getHomeData(): Promise<HomeData> {
  const cfg = getSupabaseConfigError();
  if (cfg) return { reports: [], points: [], error: cfg };

  const sb = getSupabaseOrError();
  if (!sb.client) {
    return { reports: [], points: [], error: sb.error };
  }

  try {
    const [reportsPack, pointsRes] = await Promise.all([
      loadReports(sb.client),
      sb.client.from("collection_points").select("*").order("name", { ascending: true }),
    ]);

    const reports = reportsPack.rows;
    const points = (pointsRes.data ?? []) as CollectionPoint[];
    const rawError = reportsPack.error ?? pointsRes.error?.message ?? null;

    if (rawError) {
      console.error("getHomeData error:", rawError);
      return { reports, points, error: classifyHomeDataError(rawError) };
    }

    return { reports, points, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("getHomeData error:", message);
    return { reports: [], points: [], error: classifyHomeDataError(message) };
  }
}

/**
 * Registra el estado de una persona en la red de búsqueda familiar
 * (módulo "Estoy Bien").
 */
export async function registerPersonStatus(
  formData: FormData
): Promise<ActionResult<PeopleStatus>> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const documentId = String(formData.get("document_id") ?? "").trim();
  const municipality = String(
    formData.get("municipality") ?? ""
  ) as Municipality;
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const neighborhood =
    String(formData.get("neighborhood") ?? "").trim() ||
    (Number.isFinite(lat) && Number.isFinite(lng) ? "Ubicación exacta" : "");
  const status = String(formData.get("status") ?? "") as PersonStatus;
  const contactNumber = String(formData.get("contact_number") ?? "").trim();

  if (!fullName)
    return { success: false, error: "El nombre completo es obligatorio." };
  if (!VALID_MUNICIPALITIES.includes(municipality))
    return { success: false, error: "Municipio inválido." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      success: false,
      error: "Selecciona tu ubicación exacta con el GPS o en el mapa.",
    };
  }
  if (!VALID_PERSON_STATUS.includes(status))
    return { success: false, error: "Estado inválido." };
  if (!contactNumber)
    return {
      success: false,
      error: "El número de contacto es obligatorio.",
    };
  if (documentId.length > 20)
    return { success: false, error: "La cédula es demasiado larga." };

  const allowed = await checkRateLimit("registerPersonStatus", 5, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const photos = await uploadFormPhotos(sb.client, "people", formData);
  if (photos.error) return { success: false, error: photos.error };

  const payload = {
    full_name: fullName,
    document_id: documentId || null,
    municipality,
    neighborhood,
    lat,
    lng,
    status,
    contact_number: contactNumber,
    photo_urls: photos.urls,
  };

  let { data, error } = await sb.client
    .from("people_status")
    .insert(payload)
    .select()
    .single();

  if (error && /column .*lat|lng/i.test(error.message)) {
    const fallback = await sb.client
      .from("people_status")
      .insert({
        full_name: fullName,
        document_id: documentId || null,
        municipality,
        neighborhood,
        status,
        contact_number: contactNumber,
        photo_urls: photos.urls,
      })
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return {
      success: false,
      error: explainPhotoFailure(classifyHomeDataError(error.message)),
    };
  }

  revalidatePath("/");
  return { success: true, data: withPhotoUrls(data as PeopleStatus) };
}

/**
 * Busca personas registradas en la red de búsqueda familiar por nombre o
 * número de documento.
 */
export async function searchPersonStatus(
  query: string
): Promise<PeopleStatus[]> {
  const q = sanitizeIlikeInput(query);
  if (!q) return [];

  const sb = getSupabaseOrError();
  if (!sb.client) return [];

  try {
    const { data, error } = await sb.client
      .from("people_status")
      .select("*")
      .or(`full_name.ilike.%${q}%,document_id.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      console.error("searchPersonStatus error:", error.message);
      return [];
    }
    return ((data ?? []) as PeopleStatus[]).map(withPhotoUrls);
  } catch (err) {
    console.error("searchPersonStatus error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Actualiza únicamente el estado de una persona ya registrada (no el
 * nombre, teléfono ni cédula). Sin autenticación: el "dueño" del registro
 * es quien tiene el id guardado en su propio dispositivo (ver
 * localStorage "pereiraunida:my-status-ids" en FamilyStatusModal).
 */
export async function updatePersonStatus(
  id: string,
  newStatus: PersonStatus
): Promise<ActionResult<PeopleStatus>> {
  if (!id || !UUID_RE.test(id))
    return { success: false, error: "Identificador inválido." };
  if (!VALID_PERSON_STATUS.includes(newStatus))
    return { success: false, error: "Estado inválido." };

  const allowed = await checkRateLimit("updatePersonStatus", 20, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("people_status")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true, data: withPhotoUrls(data as PeopleStatus) };
}

/**
 * Recupera registros de "Estoy Bien" por id (usado para mostrar "Mi
 * registro en este teléfono" a partir de los ids guardados en
 * localStorage). Máximo 10 ids por consulta.
 */
export async function getPeopleStatusByIds(
  ids: string[]
): Promise<PeopleStatus[]> {
  const validIds = ids.filter((id) => UUID_RE.test(id)).slice(0, 10);
  if (validIds.length === 0) return [];

  const sb = getSupabaseOrError();
  if (!sb.client) return [];

  try {
    const { data, error } = await sb.client
      .from("people_status")
      .select("*")
      .in("id", validIds);

    if (error) {
      console.error("getPeopleStatusByIds error:", error.message);
      return [];
    }
    return ((data ?? []) as PeopleStatus[]).map(withPhotoUrls);
  } catch (err) {
    console.error("getPeopleStatusByIds error:", err instanceof Error ? err.message : err);
    return [];
  }
}

function getAcopioSecrets(): string[] {
  return [process.env.ACOPIO_SECRET, process.env.ACOPIO_PIN].filter(
    (value): value is string => Boolean(value)
  );
}

function matchesAcopioSecret(value: string): boolean {
  return getAcopioSecrets().some((expected) => timingSafeStringEqual(value, expected));
}

/** Slug de la ruta secreta `/a/<slug>`. Prioriza ACOPIO_SECRET; si no, ACOPIO_PIN. */
function getAcopioRouteSecret(): string | null {
  return process.env.ACOPIO_SECRET || process.env.ACOPIO_PIN || null;
}

export async function isAcopioSecretValid(secret: string): Promise<boolean> {
  const expected = getAcopioRouteSecret();
  if (!expected) return false;
  return timingSafeStringEqual(secret, expected);
}

/**
 * Indica si el alta de centros de acopio está habilitada en este
 * despliegue (ACOPIO_PIN o ACOPIO_SECRET), sin revelar el valor.
 */
export async function isAcopioEnabled(): Promise<boolean> {
  return getAcopioSecrets().length > 0;
}

/**
 * Crea un centro de acopio nuevo. Protegido por un PIN compartido
 * (ACOPIO_PIN, comparado en tiempo constante) en vez de autenticación de
 * usuario, para mantener el flujo sin cuentas. Si SUPABASE_SERVICE_ROLE_KEY
 * está configurada, inserta con esa clave (bypass de RLS controlado en el
 * server); si no, usa la clave anon y la única barrera real es el PIN.
 */
export async function createCollectionPoint(
  formData: FormData
): Promise<ActionResult<CollectionPoint>> {
  if (getAcopioSecrets().length === 0) {
    return { success: false, error: "Alta de acopio deshabilitada." };
  }

  const pin = String(formData.get("pin") ?? "");
  if (!matchesAcopioSecret(pin)) {
    return { success: false, error: "PIN incorrecto." };
  }

  const allowed = await checkRateLimit("createCollectionPoint", 5, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const municipality = String(
    formData.get("municipality") ?? ""
  ) as Municipality;
  const suppliesRaw = String(formData.get("supplies_needed") ?? "");
  const suppliesNeeded = suppliesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const openHours = String(formData.get("open_hours") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");

  if (!name) return { success: false, error: "El nombre es obligatorio." };
  if (!address)
    return { success: false, error: "La dirección es obligatoria." };
  if (!VALID_MUNICIPALITIES.includes(municipality))
    return { success: false, error: "Municipio inválido." };

  // La URL de Supabase es la misma para el cliente anon y el de service
  // role: si es un placeholder, ambos van a fallar en fetch igual.
  const cfg = getSupabaseConfigError();
  if (cfg) return { success: false, error: cfg };

  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: "Marca el punto exacto en el mapa." };
  }

  const supabase = getAcopioSupabaseClient();

  const { data, error } = await supabase
    .from("collection_points")
    .insert({
      name,
      address,
      municipality,
      supplies_needed: suppliesNeeded,
      open_hours: openHours,
      contact,
      lat,
      lng,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true, data: data as CollectionPoint };
}
