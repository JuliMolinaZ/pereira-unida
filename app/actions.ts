"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { scheduleExternalSync } from "@/lib/externalSync";
import {
  createServerSupabaseClient,
  tryCreateServerSupabaseClient,
} from "@/lib/supabase/server";
import {
  getSupabaseConfigError,
  SUPABASE_CONFIG_ERROR_MESSAGE,
} from "@/lib/supabase/config";
import {
  HELP_SKILLS,
  isClosedStatus,
  type ClosedRoad,
  type ClosedRoadReason,
  type ClosedRoadStatus,
  type CollectionPoint,
  type Comment,
  type ExternalAfectacion,
  type ExternalAyuda,
  type ExternalCentro,
  type HomeData,
  type HelpOffer,
  type HelpOfferStatus,
  type HelpSkill,
  type Municipality,
  type PeopleStatus,
  type PersonStatus,
  type Rental,
  type RentalStatus,
  type Report,
  type ReportCategory,
  type ReportStatus,
  type RoadPoint,
  type UrgentLevel,
} from "@/lib/types";
import {
  explainPhotoFailure,
  isAllowedPhotoType,
  isPhotoBlob,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ENTRY,
  MAX_RENTAL_PHOTOS,
  normalizePhotoUrls,
  PHOTO_BUCKET,
} from "@/lib/photos";
import { deleteSpaceObjects, isSpacesConfigured, uploadSpaceObject } from "@/lib/spaces";
import { DEFAULT_DEPARTMENT, inColombia, isKnownCityName } from "@/lib/regions";
import { parseMonthlyRent } from "@/lib/rentals";

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
const VALID_PERSON_STATUS: PersonStatus[] = [
  "a_salvo",
  "necesito_traslado",
  "sin_conexion",
];
const VALID_ROAD_REASONS: ClosedRoadReason[] = [
  "derrumbe",
  "inundacion",
  "arbol",
  "hundimiento",
  "bloqueo",
  "otro",
];

function parseRoadPath(raw: string): RoadPoint[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 40) return null;
    const path: RoadPoint[] = [];
    for (const point of parsed) {
      if (!point || typeof point !== "object") return null;
      const lat = Number((point as { lat?: unknown }).lat);
      const lng = Number((point as { lng?: unknown }).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (!inColombia(lat, lng)) return null;
      path.push({ lat, lng });
    }
    return path;
  } catch {
    return null;
  }
}

function isMissingClosedRoadsTable(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("closed_roads") ||
    (lower.includes("schema cache") && lower.includes("closed"))
  );
}

function isMissingHelpOffersTable(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("help_offers") ||
    (lower.includes("schema cache") && lower.includes("help_offers"))
  );
}

function isMissingRentalsTable(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  if (lower.includes("rental_comments")) return false;
  return (
    (lower.includes("schema cache") && lower.includes("public.rentals")) ||
    (lower.includes("could not find the table") && /\brentals\b/.test(lower)) ||
    (lower.includes("relation") && lower.includes("rentals") && lower.includes("does not exist"))
  );
}

function isMissingRentalCommentsTable(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("rental_comments");
}

function isMissingDepartmentColumn(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("department") && (lower.includes("column") || lower.includes("schema cache"));
}

function parseCityFields(formData: FormData): { municipality: string; department: string } | { error: string } {
  const municipality = String(formData.get("municipality") ?? "Pereira").trim();
  const department =
    String(formData.get("department") ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
  if (!isKnownCityName(municipality)) return { error: "Ciudad inválida." };
  return { municipality, department };
}

async function insertRow(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>
) {
  let { data, error } = await client.from(table).insert(row).select().single();
  if (error && isMissingDepartmentColumn(error.message) && "department" in row) {
    const { department: _department, ...rest } = row;
    ({ data, error } = await client.from(table).insert(rest).select().single());
  }
  return { data, error };
}

export type ZoneFilter = {
  department?: string;
  municipality?: string | "todos";
};

const EMPTY_HOME = {
  reports: [] as Report[],
  points: [] as CollectionPoint[],
  roads: [] as ClosedRoad[],
  offers: [] as HelpOffer[],
  rentals: [] as Rental[],
  externalCentros: [] as ExternalCentro[],
  externalAyudas: [] as ExternalAyuda[],
  externalAfectaciones: [] as ExternalAfectacion[],
};

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
  folder: "reports" | "people" | "rentals",
  formData: FormData,
  maxPhotos = MAX_PHOTOS_PER_ENTRY
): Promise<{ urls: string[]; error?: string }> {
  const files = formData.getAll("photos").filter(isPhotoBlob);

  if (files.length === 0) return { urls: [] };
  if (files.length > maxPhotos) {
    return {
      urls: [],
      error: `Puedes adjuntar máximo ${maxPhotos} fotos.`,
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
  department?: string;
  search?: string;
  limit?: number;
};

async function loadReports(
  client: SupabaseClient,
  filters?: ReportListFilters
): Promise<{ rows: Report[]; error: string | null }> {
  const run = (select: string, withDepartment: boolean) => {
    let query = client
      .from("reports")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 400);
    if (filters?.category && filters.category !== "todos") {
      query = query.eq("category", filters.category);
    }
    if (filters?.urgency && filters.urgency !== "todos") {
      query = query.eq("urgent_level", filters.urgency);
    }
    if (withDepartment && filters?.department) {
      query = query.eq("department", filters.department);
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

  let { data, error } = await run(SELECT_WITH_COMMENTS, true);
  if (error && isMissingDepartmentColumn(error.message)) {
    ({ data, error } = await run(SELECT_WITH_COMMENTS, false));
  }
  if (error && /comments/i.test(error.message)) {
    ({ data, error } = await run("*", true));
    if (error && isMissingDepartmentColumn(error.message)) {
      ({ data, error } = await run("*", false));
    }
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
  const municipality = String(formData.get("municipality") ?? "Pereira").trim();
  const department =
    String(formData.get("department") ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
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
  if (!isKnownCityName(municipality))
    return { success: false, error: "Ciudad inválida." };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      success: false,
      error: "Selecciona tu ubicación exacta con el GPS o en el mapa.",
    };
  }
  if (!inColombia(lat, lng)) {
    return { success: false, error: "La ubicación debe estar en Colombia." };
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

  const { data, error } = await insertRow(sb.client, "reports", {
    title,
    description,
    category,
    urgent_level: urgentLevel,
    status: "buscando",
    municipality,
    department,
    location_name: locationName,
    lat,
    lng,
    contact_phone: contactPhone,
    photo_urls: photos.urls,
  });

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
 * Confirma que la necesidad sigue activa (gente en terreno). Reabre el
 * reporte si estaba cerrado y marca last_confirmed_at.
 */
export async function confirmReportActive(reportId: string): Promise<ActionResult> {
  if (!reportId) return { success: false, error: "reportId es requerido." };

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const now = new Date().toISOString();
  const { error } = await sb.client
    .from("reports")
    .update({ status: "buscando", last_confirmed_at: now })
    .eq("id", reportId);

  if (error) {
    if (/last_confirmed_at/i.test(error.message)) {
      const retry = await sb.client
        .from("reports")
        .update({ status: "buscando" })
        .eq("id", reportId);
      if (retry.error) return { success: false, error: retry.error.message };
      revalidatePath("/");
      return { success: true };
    }
    if (error.message.includes("reports_status_check")) {
      return {
        success: false,
        error:
          "Este estado aún no está habilitado. Aplica schema.sql en el SQL Editor de Supabase.",
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
  municipalityFilter?: Municipality | "todos",
  departmentFilter?: string
): Promise<Report[] | null> {
  const sb = getSupabaseOrError();
  if (!sb.client) return null;

  try {
    const pack = await loadReports(sb.client, {
      category: categoryFilter,
      urgency: urgencyFilter,
      municipality: municipalityFilter,
      department: departmentFilter,
      search: searchQuery,
      limit: 500,
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
export async function getHomeData(
  zone: ZoneFilter = { department: DEFAULT_DEPARTMENT }
): Promise<HomeData> {
  const cfg = getSupabaseConfigError();
  if (cfg) return { ...EMPTY_HOME, error: cfg };

  const sb = getSupabaseOrError();
  if (!sb.client) {
    return { ...EMPTY_HOME, error: sb.error };
  }

  // Dispara la sincronización de fuentes externas en segundo plano, sin
  // demorar esta respuesta. El candado en external_sync_state hace que de
  // los cientos de visitas que llaman getHomeData(), solo una cada pocos
  // minutos haga trabajo real (ver lib/externalSync.ts).
  after(() => {
    void scheduleExternalSync();
  });

  const applyZone = <T extends { eq: (col: string, val: string) => T }>(
    query: T,
    withDepartment: boolean
  ): T => {
    let next = query;
    if (withDepartment && zone.department) next = next.eq("department", zone.department);
    if (zone.municipality && zone.municipality !== "todos") {
      next = next.eq("municipality", zone.municipality);
    }
    return next;
  };

  try {
    const loadSide = async (
      table: "collection_points" | "closed_roads" | "help_offers" | "rentals",
      orderCol: string,
      ascending: boolean
    ) => {
      const first = await applyZone(
        sb.client!.from(table).select("*").order(orderCol, { ascending }),
        true
      );
      if (first.error && isMissingDepartmentColumn(first.error.message)) {
        return applyZone(
          sb.client!.from(table).select("*").order(orderCol, { ascending }),
          false
        );
      }
      return first;
    };

    const loadRentals = async () => {
      const withComments = await applyZone(
        sb.client!.from("rentals").select("*, rental_comments(count)").order("created_at", {
          ascending: false,
        }),
        true
      );
      if (withComments.error && isMissingDepartmentColumn(withComments.error.message)) {
        return applyZone(
          sb.client!.from("rentals").select("*, rental_comments(count)").order("created_at", {
            ascending: false,
          }),
          false
        );
      }
      if (withComments.error && isMissingRentalCommentsTable(withComments.error.message)) {
        return loadSide("rentals", "created_at", false);
      }
      return withComments;
    };

    const loadExternal = async (table: "external_centros" | "external_ayudas" | "external_afectaciones") =>
      sb.client!.from(table).select("*").order("synced_at", { ascending: false });

    const [reportsPack, pointsRes, roadsRes, offersRes, rentalsRes, externalCentrosRes, externalAyudasRes, externalAfectacionesRes] =
      await Promise.all([
        loadReports(sb.client, {
          department: zone.department,
          municipality: zone.municipality,
          limit: zone.department ? 180 : 400,
        }),
        loadSide("collection_points", "name", true),
        loadSide("closed_roads", "created_at", false),
        loadSide("help_offers", "created_at", false),
        loadRentals(),
        loadExternal("external_centros"),
        loadExternal("external_ayudas"),
        loadExternal("external_afectaciones"),
      ]);

    const reports = reportsPack.rows;
    const points = (pointsRes.data ?? []) as CollectionPoint[];
    const roadsMissing = isMissingClosedRoadsTable(roadsRes.error?.message);
    const roads = roadsMissing ? [] : ((roadsRes.data ?? []) as ClosedRoad[]);
    const offersMissing = isMissingHelpOffersTable(offersRes.error?.message);
    const offers = offersMissing ? [] : ((offersRes.data ?? []) as HelpOffer[]);
    const rentalsMissing = isMissingRentalsTable(rentalsRes.error?.message);
    const rentals = rentalsMissing
      ? []
      : ((rentalsRes.data ?? []) as Record<string, unknown>[]).map((row) =>
          normalizeRental(row as unknown as Rental & { rental_comments?: unknown })
        );
    // Fuentes externas: opcionales y aditivas. Si la migración todavía no se
    // aplicó (tabla inexistente) o hay un hiccup puntual, no tumban la home
    // ni el mensaje de error — simplemente no aparecen hasta que se resuelva.
    const externalCentros = externalCentrosRes.error ? [] : ((externalCentrosRes.data ?? []) as ExternalCentro[]);
    const externalAyudas = externalAyudasRes.error ? [] : ((externalAyudasRes.data ?? []) as ExternalAyuda[]);
    const externalAfectaciones = externalAfectacionesRes.error
      ? []
      : ((externalAfectacionesRes.data ?? []) as ExternalAfectacion[]);
    if (externalCentrosRes.error) console.error("getHomeData external_centros:", externalCentrosRes.error.message);
    if (externalAyudasRes.error) console.error("getHomeData external_ayudas:", externalAyudasRes.error.message);
    if (externalAfectacionesRes.error)
      console.error("getHomeData external_afectaciones:", externalAfectacionesRes.error.message);

    const rawError =
      reportsPack.error ??
      pointsRes.error?.message ??
      (roadsMissing ? null : roadsRes.error?.message) ??
      (offersMissing ? null : offersRes.error?.message) ??
      (rentalsMissing ? null : rentalsRes.error?.message) ??
      null;

    if (rawError) {
      console.error("getHomeData error:", rawError);
      return {
        reports,
        points,
        roads,
        offers,
        rentals,
        externalCentros,
        externalAyudas,
        externalAfectaciones,
        error: classifyHomeDataError(rawError),
      };
    }

    return {
      reports,
      points,
      roads,
      offers,
      rentals,
      externalCentros,
      externalAyudas,
      externalAfectaciones,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("getHomeData error:", message);
    return { ...EMPTY_HOME, error: classifyHomeDataError(message) };
  }
}


export type NationalPlaceCount = {
  department: string;
  municipality: string;
  active: number;
  critical: number;
};

export type NationalOverview = {
  active: number;
  critical: number;
  places: NationalPlaceCount[];
};

/** Conteos de solicitudes activas en todo el país, sin filtrar por ciudad. */
export async function getNationalOverview(): Promise<NationalOverview> {
  const empty: NationalOverview = { active: 0, critical: 0, places: [] };
  const sb = getSupabaseOrError();
  if (!sb.client) return empty;

  const run = (cols: string) => sb.client!.from("reports").select(cols).limit(1000);
  let { data, error } = await run("status, urgent_level, municipality, department");
  if (error && isMissingDepartmentColumn(error.message)) {
    ({ data, error } = await run("status, urgent_level, municipality"));
  }
  if (error || !data) return empty;

  const placeMap = new Map<string, NationalPlaceCount>();
  let active = 0;
  let critical = 0;
  for (const row of data as {
    status?: string;
    urgent_level?: string;
    municipality?: string;
    department?: string;
  }[]) {
    const status = String(row.status ?? "") as ReportStatus;
    if (isClosedStatus(status)) continue;
    active += 1;
    const isCritical = row.urgent_level === "critico";
    if (isCritical) critical += 1;
    const municipality = String(row.municipality ?? "").trim() || "Sin ciudad";
    const department = String(row.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT;
    const key = `${department}|${municipality}`;
    const prev = placeMap.get(key) ?? { department, municipality, active: 0, critical: 0 };
    prev.active += 1;
    if (isCritical) prev.critical += 1;
    placeMap.set(key, prev);
  }

  return {
    active,
    critical,
    places: [...placeMap.values()].sort(
      (a, b) => b.active - a.active || a.municipality.localeCompare(b.municipality, "es")
    ),
  };
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
  const place = parseCityFields(formData);
  if ("error" in place) return { success: false, error: place.error };
  const { municipality, department } = place;
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
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      success: false,
      error: "Selecciona tu ubicación exacta con el GPS o en el mapa.",
    };
  }
  if (!inColombia(lat, lng)) {
    return { success: false, error: "La ubicación debe estar en Colombia." };
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
    department,
    neighborhood,
    lat,
    lng,
    status,
    contact_number: contactNumber,
    photo_urls: photos.urls,
  };

  let { data, error } = await insertRow(sb.client, "people_status", payload);

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
  query: string,
  zone?: ZoneFilter
): Promise<PeopleStatus[]> {
  const q = sanitizeIlikeInput(query);
  if (!q) return [];

  const sb = getSupabaseOrError();
  if (!sb.client) return [];

  const run = async (withDepartment: boolean) => {
    let next = sb.client!
      .from("people_status")
      .select("*")
      .or(`full_name.ilike.%${q}%,document_id.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(25);
    if (withDepartment && zone?.department) next = next.eq("department", zone.department);
    if (zone?.municipality && zone.municipality !== "todos") {
      next = next.eq("municipality", zone.municipality);
    }
    return next;
  };

  try {
    let { data, error } = await run(true);
    if (error && isMissingDepartmentColumn(error.message)) {
      ({ data, error } = await run(false));
    }

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

export async function createClosedRoad(
  formData: FormData
): Promise<ActionResult<ClosedRoad>> {
  const name = String(formData.get("name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "") as ClosedRoadReason;
  const note = String(formData.get("note") ?? "").trim();
  const place = parseCityFields(formData);
  if ("error" in place) return { success: false, error: place.error };
  const { municipality, department } = place;
  const path = parseRoadPath(String(formData.get("path") ?? ""));

  if (!name) return { success: false, error: "Indica el nombre de la calle o tramo." };
  if (!VALID_ROAD_REASONS.includes(reason)) {
    return { success: false, error: "Elige por qué no se puede transitar." };
  }
  if (!path) {
    return {
      success: false,
      error: "Marca el tramo en el mapa tocando al menos dos puntos sobre la calle.",
    };
  }

  const allowed = await checkRateLimit("createClosedRoad", 8, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await insertRow(sb.client, "closed_roads", {
    name,
    reason,
    note,
    municipality,
    department,
    path,
    status: "cerrada",
  });

  if (error) {
    return {
      success: false,
      error: isMissingClosedRoadsTable(error.message)
        ? "Falta crear la tabla de vías cerradas en Supabase (migración closed_roads)."
        : classifyHomeDataError(error.message),
    };
  }

  revalidatePath("/");
  return { success: true, data: data as ClosedRoad };
}

export async function reopenClosedRoad(
  id: string
): Promise<ActionResult<ClosedRoad>> {
  if (!UUID_RE.test(id)) return { success: false, error: "Vía inválida." };

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("closed_roads")
    .update({ status: "reabierta" satisfies ClosedRoadStatus })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: classifyHomeDataError(error.message) };
  }

  revalidatePath("/");
  return { success: true, data: data as ClosedRoad };
}

export async function createHelpOffer(
  formData: FormData
): Promise<ActionResult<HelpOffer>> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const skill = String(formData.get("skill") ?? "") as HelpSkill;
  const description = String(formData.get("description") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const place = parseCityFields(formData);
  if ("error" in place) return { success: false, error: place.error };
  const { municipality, department } = place;

  if (!fullName) return { success: false, error: "Escribe tu nombre." };
  if (!HELP_SKILLS.includes(skill)) {
    return { success: false, error: "Elige en qué puedes ayudar." };
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) {
    return { success: false, error: "Escribe un teléfono o WhatsApp válido." };
  }

  const allowed = await checkRateLimit("createHelpOffer", 5, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await insertRow(sb.client, "help_offers", {
    full_name: fullName.slice(0, 80),
    skill,
    description: description.slice(0, 800),
    phone,
    municipality,
    department,
    status: "activa",
  });

  if (error) {
    return {
      success: false,
      error: isMissingHelpOffersTable(error.message)
        ? "Falta crear la tabla de ofertas de ayuda en Supabase (migración help_offers)."
        : classifyHomeDataError(error.message),
    };
  }

  revalidatePath("/");
  return { success: true, data: data as HelpOffer };
}

export async function hideHelpOffer(id: string): Promise<ActionResult<HelpOffer>> {
  if (!UUID_RE.test(id)) return { success: false, error: "Oferta inválida." };

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("help_offers")
    .update({ status: "ocultada" satisfies HelpOfferStatus })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: classifyHomeDataError(error.message) };
  }

  revalidatePath("/");
  return { success: true, data: data as HelpOffer };
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
  const place = parseCityFields(formData);
  if ("error" in place) return { success: false, error: place.error };
  const { municipality, department } = place;
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

  // La URL de Supabase es la misma para el cliente anon y el de service
  // role: si es un placeholder, ambos van a fallar en fetch igual.
  const cfg = getSupabaseConfigError();
  if (cfg) return { success: false, error: cfg };

  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: "Marca el punto exacto en el mapa." };
  }
  if (!inColombia(lat, lng)) {
    return { success: false, error: "La ubicación debe estar en Colombia." };
  }

  const supabase = getAcopioSupabaseClient();

  const { data, error } = await insertRow(supabase, "collection_points", {
    name,
    address,
    municipality,
    department,
    supplies_needed: suppliesNeeded,
    open_hours: openHours,
    contact,
    lat,
    lng,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/");
  return { success: true, data: data as CollectionPoint };
}

function toCoord(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRental(
  row: Rental & { rental_comments?: unknown }
): Rental {
  const comments_count = embedCount(row.rental_comments) || row.comments_count || 0;
  const { rental_comments: _comments, ...rest } = row;
  return {
    ...(rest as Rental),
    lat: toCoord(row.lat),
    lng: toCoord(row.lng),
    photo_urls: normalizePhotoUrls(row.photo_urls, MAX_RENTAL_PHOTOS),
    monthly_rent:
      typeof row.monthly_rent === "number" && Number.isFinite(row.monthly_rent)
        ? row.monthly_rent
        : null,
    comments_count,
  };
}

export async function getRentals(): Promise<Rental[]> {
  const sb = getSupabaseOrError();
  if (!sb.client) return [];
  try {
    const { data, error } = await sb.client
      .from("rentals")
      .select("*, rental_comments(count)")
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingRentalsTable(error.message)) return [];
      console.error("getRentals error:", error.message);
      return [];
    }
    return ((data ?? []) as Rental[]).map(normalizeRental);
  } catch (err) {
    console.error("getRentals error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function createRental(formData: FormData): Promise<ActionResult<Rental>> {
  const neighborhood = String(formData.get("neighborhood") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const propertyType = String(formData.get("property_type") ?? "").trim();
  const furnishedRaw = String(formData.get("furnished") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const rentRaw = String(formData.get("monthly_rent") ?? "").trim();
  const place = parseCityFields(formData);
  if ("error" in place) return { success: false, error: place.error };
  const { municipality, department } = place;
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;

  if (!address) return { success: false, error: "Escribe la dirección o ubicación." };
  if (!propertyType) return { success: false, error: "Indica el tipo de inmueble." };
  if (contact.replace(/\D/g, "").length < 7) {
    return { success: false, error: "Escribe un teléfono o WhatsApp válido." };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: "Marca la vivienda en el mapa." };
  }
  if (!inColombia(lat, lng)) {
    return { success: false, error: "La ubicación debe estar en Colombia." };
  }

  const monthlyRent = rentRaw ? parseMonthlyRent(rentRaw) : null;
  if (rentRaw && monthlyRent === null) {
    return { success: false, error: "El valor del arriendo no se entiende. Déjalo vacío si no hay precio." };
  }

  const allowed = await checkRateLimit("createRental", 8, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const photos = await uploadFormPhotos(sb.client, "rentals", formData, MAX_RENTAL_PHOTOS);
  if (photos.error) return { success: false, error: photos.error };

  const furnished = /^(si|sí|true|1|amoblada)$/i.test(furnishedRaw);

  const { data, error } = await insertRow(sb.client, "rentals", {
    municipality,
    department,
    neighborhood: neighborhood.slice(0, 120),
    address: address.slice(0, 200),
    property_type: propertyType.slice(0, 80),
    furnished,
    contact: contact.slice(0, 80),
    monthly_rent: monthlyRent,
    photo_urls: photos.urls,
    lat,
    lng,
    status: "disponible",
  });

  if (error) {
    return {
      success: false,
      error: isMissingRentalsTable(error.message)
        ? "Falta crear la tabla de arriendos en Supabase (migración rentals)."
        : classifyHomeDataError(error.message),
    };
  }

  revalidatePath("/");
  return { success: true, data: normalizeRental(data as Rental) };
}

export type RentalImportRow = {
  municipality: string;
  department?: string;
  neighborhood: string;
  address: string;
  property_type: string;
  furnished: boolean;
  contact: string;
  monthly_rent: number | null;
  submitted_at?: string | null;
  lat: number | null;
  lng: number | null;
};

export async function importRentals(
  pin: string,
  rows: RentalImportRow[]
): Promise<ActionResult<{ created: number; skipped: number; withoutPin: number }>> {
  if (!matchesAcopioSecret(pin)) {
    return { success: false, error: "PIN incorrecto." };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: "No hay filas para cargar." };
  }
  if (rows.length > 80) {
    return { success: false, error: "Carga máximo 80 viviendas por vez." };
  }

  const allowed = await checkRateLimit("importRentals", 3, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const payload = [];
  let skipped = 0;
  let withoutPin = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    const address = String(row.address ?? "").trim();
    const contact = String(row.contact ?? "").trim();
    const municipality = String(row.municipality ?? "").trim();
    if (!address || !contact || !isKnownCityName(municipality)) {
      skipped += 1;
      continue;
    }
    const key = `${foldDup(municipality)}|${foldDup(address)}|${contact.replace(/\D/g, "")}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const lat = row.lat == null ? null : Number(row.lat);
    const lng = row.lng == null ? null : Number(row.lng);
    const hasPin =
      lat !== null &&
      lng !== null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      inColombia(lat, lng);
    if (!hasPin) withoutPin += 1;

    payload.push({
      municipality,
      department: String(row.department ?? DEFAULT_DEPARTMENT).trim() || DEFAULT_DEPARTMENT,
      neighborhood: String(row.neighborhood ?? "").trim().slice(0, 120),
      address: address.slice(0, 200),
      property_type: String(row.property_type ?? "Otro").trim().slice(0, 80) || "Otro",
      furnished: Boolean(row.furnished),
      contact: contact.slice(0, 80),
      monthly_rent:
        typeof row.monthly_rent === "number" && row.monthly_rent > 0 ? Math.round(row.monthly_rent) : null,
      photo_urls: [] as string[],
      lat: hasPin ? lat : null,
      lng: hasPin ? lng : null,
      submitted_at: row.submitted_at || null,
      status: "disponible",
    });
  }

  if (payload.length === 0) {
    return { success: false, error: "Ninguna fila era válida para guardar." };
  }

  const { error } = await sb.client.from("rentals").insert(payload);
  if (error) {
    return {
      success: false,
      error: isMissingRentalsTable(error.message)
        ? "Falta crear la tabla de arriendos en Supabase (migración rentals)."
        : classifyHomeDataError(error.message),
    };
  }

  revalidatePath("/");
  return {
    success: true,
    data: { created: payload.length, skipped, withoutPin },
  };
}

function foldDup(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function hideRental(id: string): Promise<ActionResult<Rental>> {
  return updateRentalStatus(id, "ocupada");
}

export async function updateRentalStatus(
  id: string,
  status: RentalStatus
): Promise<ActionResult<Rental>> {
  if (!UUID_RE.test(id)) return { success: false, error: "Vivienda inválida." };
  if (status !== "disponible" && status !== "ocupada" && status !== "ocultada") {
    return { success: false, error: "Estado inválido." };
  }

  const allowed = await checkRateLimit("updateRentalStatus", 20, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("rentals")
    .update({ status })
    .eq("id", id)
    .select("*, rental_comments(count)")
    .single();

  if (error) {
    if (isMissingRentalCommentsTable(error.message)) {
      const retry = await sb.client.from("rentals").update({ status }).eq("id", id).select().single();
      if (retry.error) {
        return { success: false, error: classifyHomeDataError(retry.error.message) };
      }
      revalidatePath("/");
      return { success: true, data: normalizeRental(retry.data as Rental) };
    }
    return { success: false, error: classifyHomeDataError(error.message) };
  }

  revalidatePath("/");
  return { success: true, data: normalizeRental(data as Rental) };
}

export async function getRentalComments(rentalId: string): Promise<Comment[]> {
  if (!UUID_RE.test(rentalId)) return [];
  const sb = getSupabaseOrError();
  if (!sb.client) return [];
  try {
    const { data, error } = await sb.client
      .from("rental_comments")
      .select("*")
      .eq("rental_id", rentalId)
      .order("created_at", { ascending: true });
    if (error) {
      if (isMissingRentalCommentsTable(error.message)) return [];
      console.error("getRentalComments error:", error.message);
      return [];
    }
    return (data ?? []) as Comment[];
  } catch (err) {
    console.error("getRentalComments error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function addRentalComment(
  rentalId: string,
  author: string,
  content: string
): Promise<ActionResult<Comment>> {
  const trimmedContent = content.trim().slice(0, 280);
  const trimmedAuthor = author.trim() || "Anónimo";
  if (!UUID_RE.test(rentalId)) return { success: false, error: "Vivienda inválida." };
  if (!trimmedContent) return { success: false, error: "El comentario no puede estar vacío." };

  const allowed = await checkRateLimit("addRentalComment", 10, 60_000);
  if (!allowed) {
    return {
      success: false,
      error: "Estás comentando muy rápido. Espera un momento e intenta de nuevo.",
    };
  }

  const sb = getSupabaseOrError();
  if (!sb.client) return { success: false, error: sb.error };

  const { data, error } = await sb.client
    .from("rental_comments")
    .insert({
      rental_id: rentalId,
      author_name: trimmedAuthor,
      content: trimmedContent,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: isMissingRentalCommentsTable(error.message)
        ? "Falta crear la tabla de notas de arriendos en Supabase (migración rental_comments)."
        : error.message,
    };
  }

  revalidatePath("/");
  return { success: true, data: data as Comment };
}
