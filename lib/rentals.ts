import { cityByName, cityFromText, DEFAULT_CITY_ID, cityById } from "@/lib/regions";
import { MAX_RENTAL_PHOTOS } from "@/lib/photos";

export type ParsedRentalRow = {
  municipality: string;
  department: string;
  neighborhood: string;
  address: string;
  property_type: string;
  furnished: boolean;
  contact: string;
  monthly_rent: number | null;
  submitted_at: string | null;
  photo_urls: string[];
  sourceLine: number;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((cell) => cell.trim());
  }
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

type ColKey =
  | "submitted_at"
  | "municipality"
  | "neighborhood"
  | "address"
  | "property_type"
  | "furnished"
  | "contact"
  | "monthly_rent"
  | "photo_urls"
  | "skip";

function classifyHeader(header: string): ColKey {
  const h = fold(header);
  if (!h) return "skip";
  if (/marca temporal|timestamp|fecha/.test(h)) return "submitted_at";
  if (/ciudad/.test(h)) return "municipality";
  if (/barrio|sector/.test(h)) return "neighborhood";
  if (/direccion|ubicacion/.test(h)) return "address";
  if (/tipo|inmueble/.test(h)) return "property_type";
  if (/amoblad/.test(h)) return "furnished";
  if (/propietario|contacto|telefono|whatsapp|celular/.test(h)) return "contact";
  if (/valor|arriendo|mensual|precio|canon/.test(h)) return "monthly_rent";
  if (/foto|imagen|imagenes|photo|fotos/.test(h)) return "photo_urls";
  return "skip";
}

/** Una celda puede traer varias URLs de foto separadas por coma/espacio/salto
 * de línea/punto y coma — típico al pegar un export de inmobiliaria. Solo se
 * quedan las que parecen URLs http(s) reales, sin duplicados. */
export function parsePhotoUrlsCell(raw: string): string[] {
  if (!raw.trim()) return [];
  const candidates = raw.split(/[\s,;|]+/).map((s) => s.trim()).filter(Boolean);
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!/^https?:\/\/\S+$/i.test(candidate)) continue;
    if (urls.includes(candidate)) continue;
    urls.push(candidate);
    if (urls.length >= MAX_RENTAL_PHOTOS) break;
  }
  return urls;
}

export function parseMonthlyRent(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^(n\/?a|nd|-|ninguno|sin|a convenir|variable|consultar)$/i.test(fold(s))) {
    return null;
  }
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function parseFurnished(raw: string): boolean {
  const h = fold(raw);
  return /^(si|yes|true|1|amoblada)$/.test(h) || h.startsWith("si ");
}

export function parseSubmittedAt(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const hour = Number(m[4] ?? 0);
    const minute = Number(m[5] ?? 0);
    const second = Number(m[6] ?? 0);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  const iso = Date.parse(s);
  if (Number.isFinite(iso)) return new Date(iso).toISOString();
  return null;
}

export function normalizePropertyType(raw: string): string {
  const h = fold(raw);
  if (/apartaestudio|studio|estudio/.test(h)) return "Apartaestudio";
  if (/habitacion|cuarto|pieza/.test(h)) return "Habitación";
  if (/apartamento|apto/.test(h)) return "Apartamento";
  if (/casa/.test(h)) return "Casa";
  if (/local|negocio/.test(h)) return "Local";
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 80) : "Otro";
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs >= 2) return "\t";
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  if (semis > commas) return ";";
  return ",";
}

export function parseRentalsSpreadsheet(text: string): {
  rows: ParsedRentalRow[];
  error?: string;
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], error: "Pega las filas del Excel, incluida la fila de encabezados." };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map(classifyHeader);
  const needed: ColKey[] = ["municipality", "address", "contact"];
  const missing = needed.filter((key) => !headers.includes(key));
  if (missing.length > 0) {
    return {
      rows: [],
      error:
        "No reconocí las columnas. Debe ir la ciudad, la dirección y el contacto (como en el formulario de Google).",
    };
  }

  const rows: ParsedRentalRow[] = [];
  const fallback = cityById(DEFAULT_CITY_ID);

  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], delimiter);
    const get = (key: ColKey) => {
      const idx = headers.indexOf(key);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const address = get("address");
    const contact = get("contact");
    const cityRaw = get("municipality") || fallback.name;
    if (!address && !contact) continue;
    if (!address || !contact) continue;

    const city = cityByName(cityRaw) ?? cityFromText(cityRaw, fallback);
    rows.push({
      municipality: city.name,
      department: city.department,
      neighborhood: get("neighborhood").slice(0, 120),
      address: address.slice(0, 200),
      property_type: normalizePropertyType(get("property_type") || "Otro"),
      furnished: parseFurnished(get("furnished")),
      contact: contact.slice(0, 80),
      monthly_rent: parseMonthlyRent(get("monthly_rent")),
      submitted_at: parseSubmittedAt(get("submitted_at")),
      photo_urls: parsePhotoUrlsCell(get("photo_urls")),
      sourceLine: i + 1,
    });
  }

  if (rows.length === 0) {
    return { rows: [], error: "No encontré viviendas válidas (hace falta dirección y contacto)." };
  }

  return { rows };
}

export function geocodeQueryFor(row: {
  address: string;
  neighborhood: string;
  municipality: string;
}): string {
  return [row.address, row.neighborhood, row.municipality, "Colombia"]
    .filter((part) => part.trim().length > 0)
    .join(", ");
}

export function neighborhoodQueryFor(row: {
  neighborhood: string;
  municipality: string;
}): string {
  return [row.neighborhood, row.municipality, "Colombia"]
    .filter((part) => part.trim().length > 0)
    .join(", ");
}
