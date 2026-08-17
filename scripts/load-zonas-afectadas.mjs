/**
 * Carga zonas afectadas (comida, agua, aseo, etc.) como solicitudes.
 * No borra reportes existentes. Salta zonas que ya estén publicadas.
 *
 * Uso: node scripts/load-zonas-afectadas.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const USER_AGENT = "PereiraUnida/1.0 (https://pereiraunida.com)";
const CITY = {
  Pereira: { department: "Risaralda", lat: 4.8133, lng: -75.6961, maxKm: 22 },
  Dosquebradas: { department: "Risaralda", lat: 4.8389, lng: -75.6708, maxKm: 12 },
};

const BARRIO_PINS = {
  "pereira|urbanizacion los lirios": [4.7934, -75.7248],
  "pereira|leningrado 2": [4.7992, -75.7356],
  "pereira|leningrado": [4.7992, -75.7356],
  "pereira|br perla del sur": [4.7886, -75.7184],
  "pereira|perla del sur": [4.7886, -75.7184],
  "pereira|la samaria": [4.7988, -75.6685],
  "pereira|samaria": [4.7988, -75.6685],
  "pereira|danubio alto mz 30": [4.8054, -75.6722],
  "pereira|danubio alto": [4.8054, -75.6722],
  "pereira|arabia": [4.7038, -75.6492],
  "pereira|san nicolas": [4.8088, -75.6824],
  "pereira|malaga parque industrial": [4.8248, -75.7285],
  "pereira|parque industrial": [4.8248, -75.7285],
  "pereira|cancha de futbol villa santana": [4.7862, -75.6618],
  "pereira|villa santana": [4.7862, -75.6618],
  "pereira|estadio mora mora": [4.8068, -75.7112],
};

function fold(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function digits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function formatPhone(raw) {
  const d = digits(raw);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function compact(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const ZONES = [
  {
    zone: "Urbanización Los Lirios",
    supplies:
      "Comida, bastante agua, útiles de aseo y apoyo para personas discapacitadas y adultos mayores.",
    phone: "",
    contactName: "",
    priority: "critico",
    notes: "Alta carencia de alimentos y agua. Poca ayuda ha llegado a la zona. Estamos ubicando gente de confianza para el contacto.",
    sent: "",
    category: "alimentos",
    queries: ["Urbanización Los Lirios, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Leningrado 2",
    supplies: "Comida, agua y útiles de aseo.",
    phone: "3216960694",
    contactName: "Lina",
    priority: "critico",
    notes: "",
    sent: "",
    category: "alimentos",
    queries: ["Leningrado, Cuba, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Barrio Perla del Sur",
    supplies: "Comida no perecedera, agua y ropa.",
    phone: "3236929368",
    contactName: "Angie Cano",
    priority: "critico",
    notes: "",
    sent: "",
    category: "alimentos",
    queries: ["Perla del Sur, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "La Samaria",
    supplies: "Comida, agua, insumos de aseo, medicamentos y ropa.",
    phone: "3224412395",
    contactName: "Sandra Roza",
    priority: "critico",
    notes: "",
    sent: "",
    category: "alimentos",
    queries: ["La Samaria, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Danubio Alto Mz. 30",
    supplies: "Comida y agua.",
    phone: "3122290227",
    contactName: "Antonieta",
    priority: "critico",
    notes: "",
    sent: "",
    category: "alimentos",
    queries: ["Danubio Alto, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Arabia",
    supplies: "Elementos de aseo, pañales de niños y adultos, pañitos, canasta no perecedera (enlatados). Se necesitaba un megáfono.",
    phone: "",
    contactName: "",
    priority: "moderado",
    notes: "Estamos ubicando gente de confianza para el contacto.",
    sent: "Ya se entregaron pañales, elementos de canasta y el megáfono.",
    category: "otros",
    queries: ["Arabia, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "San Nicolás",
    supplies: "Comida no perecedera y medicamentos.",
    phone: "3225540241",
    contactName: "Nelson Palacios",
    priority: "moderado",
    notes: "",
    sent: "",
    category: "alimentos",
    queries: ["San Nicolás, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Málaga, Parque Industrial",
    supplies: "Comida, agua, cobijas, colchonetas, carpas, abrigo, insumos de aseo e higiene, comida para animales.",
    phone: "3217172917",
    contactName: "Jorge Iván Avalo",
    priority: "moderado",
    notes: "",
    sent: "Ya se entregó comida, agua y colchonetas. Siguen aceptando donaciones del resto de elementos.",
    category: "alimentos",
    queries: ["Málaga, Parque Industrial, Pereira, Risaralda, Colombia"],
  },
  {
    zone: "Cancha de fútbol Villa Santana",
    supplies: "Comida no perecedera, cobijas, pañales, colchonetas, comida para animales, medicamentos (acetaminofén).",
    phone: "3171078800",
    contactName: "Gabriel",
    priority: "moderado",
    notes: "",
    sent: "Ya se entregó comida, pañales y comida para animales. Siguen recibiendo donaciones del resto y más comida.",
    category: "alimentos",
    queries: ["Cancha Villa Santana, Pereira, Risaralda, Colombia", "Villa Santana, Pereira, Colombia"],
  },
  {
    zone: "Estadio Mora Mora",
    supplies: "Ropa (principalmente ropa interior), ollas pequeñas y grandes, útiles de aseo.",
    phone: "3207858282",
    contactName: "Cesar Castaño",
    priority: "moderado",
    notes: "",
    sent: "Se han entregado donaciones de ropa y ollas. Siguen aceptando aseo y ropa interior.",
    category: "otros",
    queries: ["Estadio Alberto Mora Mora, Pereira, Risaralda, Colombia", "Estadio Mora Mora, Pereira, Colombia"],
  },
];

function buildDescription(row) {
  const parts = [];
  if (row.contactName) parts.push(`Contacto: ${row.contactName}.`);
  parts.push(`Necesitan: ${compact(row.supplies)}`);
  if (row.notes) parts.push(compact(row.notes));
  if (row.sent) parts.push(compact(row.sent));
  return parts.join(" ").slice(0, 800);
}

function buildTitle(row) {
  const need = compact(row.supplies).replace(/\.$/, "");
  const title = `${row.zone}: ${need}`;
  return title.slice(0, 120);
}

function sleep(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

function distKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

let nominatimAt = 0;
async function nominatimSearch(query, city) {
  const wait = 1100 - (Date.now() - nominatimAt);
  if (wait > 0) await sleep(wait);
  nominatimAt = Date.now();
  const meta = CITY[city];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("accept-language", "es");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const hits = await res.json();
  for (const hit of hits) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (meta && distKm({ lat, lng }, meta) > meta.maxKm) continue;
    return { lat, lng, source: "nominatim" };
  }
  return null;
}

function barrioPin(zone) {
  const key = `pereira|${fold(zone)}`;
  const hit = BARRIO_PINS[key];
  if (!hit) return null;
  return { lat: hit[0], lng: hit[1], source: "barrio" };
}

async function locate(row) {
  for (const q of row.queries) {
    const geo = await nominatimSearch(q, "Pereira").catch(() => null);
    if (geo) return geo;
  }
  return (
    barrioPin(row.zone) ?? {
      lat: CITY.Pereira.lat,
      lng: CITY.Pereira.lng,
      source: "ciudad",
    }
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o clave de Supabase en .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: existing, error: existingErr } = await supabase
    .from("reports")
    .select("id, title, location_name, status")
    .neq("status", "informacion_falsa");
  if (existingErr) {
    console.error("No pude leer solicitudes actuales:", existingErr.message);
    process.exit(1);
  }

  const taken = new Set((existing ?? []).map((row) => fold(row.location_name)));
  const payload = [];

  for (const row of ZONES) {
    if (taken.has(fold(row.zone))) {
      console.log(`  skip duplicado: ${row.zone}`);
      continue;
    }
    const geo = await locate(row);
    const phone = digits(row.phone).length >= 7 ? formatPhone(row.phone) : "Pendiente";
    payload.push({
      title: buildTitle(row),
      description: buildDescription(row),
      category: row.category,
      urgent_level: row.priority,
      status: "buscando",
      municipality: "Pereira",
      department: "Risaralda",
      location_name: row.zone,
      lat: geo.lat,
      lng: geo.lng,
      contact_phone: phone,
      photo_urls: [],
    });
    console.log(`[${geo.source}] ${row.priority} · ${row.zone}`);
  }

  if (payload.length === 0) {
    console.log("Nada nuevo para insertar.");
    return;
  }

  const { error } = await supabase.from("reports").insert(payload);
  if (error) {
    console.error("Insert falló:", error.message);
    process.exit(1);
  }
  console.log(`\nPublicadas ${payload.length} solicitudes de zonas afectadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
