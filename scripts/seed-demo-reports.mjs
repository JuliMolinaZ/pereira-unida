/**
 * Siembra reportes [DEMO] + notas para ver la UI con mucha densidad.
 * Uso: node scripts/seed-demo-reports.mjs
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const looksReal = (value) =>
  !!value &&
  value.length > 20 &&
  !value.includes("tu-") &&
  !value.includes("cambia") &&
  !value.includes("placeholder");
const key = looksReal(service) ? service : anon;

if (!url || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const CATEGORIES = [
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
const URGENCY = ["critico", "moderado", "atendido"];
const STATUSES = ["buscando", "en_camino", "resuelto", "informacion_falsa", "duplicado"];
const FALLBACK_STATUSES = ["buscando", "en_camino", "resuelto"];

const BARRIOS_PEREIRA = [
  "Cuba",
  "Villa Santana",
  "El Poblado",
  "Centro",
  "Consota",
  "Boston",
  "San Joaquín",
  "Álamos",
  "El Jardín",
  "La Villa",
  "Universidad",
  "El Plumón",
  "El Rocío",
  "San Nicolás",
  "Perla del Otún",
];
const BARRIOS_DOSQUEBRADAS = [
  "La Popa",
  "Santa Mónica",
  "La Pradera",
  "Centro",
  "El Japón",
  "Bosques de la Acuarela",
  "La Esperanza",
  "Santa Isabel",
  "Frailes",
  "La Capilla",
];

const TITLES = [
  "Agua y mercado para 8 personas",
  "Falta gasolina para motosierra",
  "Medicinas para adulto mayor",
  "Voluntarios para sacar escombros",
  "Perro perdido, collar rojo",
  "Sin luz desde anoche",
  "Revisar grieta en muro",
  "Camioneta 4x4 para llevar víveres",
  "Cobijas y ropa seca",
  "Kit de primeros auxilios",
  "Cargador / punto de carga",
  "Cascos y linternas",
  "Pañales y leche para bebé",
  "Casa inhabitada, familia en andén",
  "Árbol caído tapa la vía",
];

const NOTES = [
  "Acabo de pasar: la familia sigue ahí.",
  "Ya les llevaron agua, falta comida.",
  "La dirección está un poco más arriba de la tienda.",
  "No contestan el teléfono, mejor ir.",
  "Parece duplicado del de Cuba.",
  "Marcamos como atendido a las 3pm.",
  "Hay perros sueltos en la cuadra.",
  "El acceso es por la diagonal, no por la 15.",
  "Esto no coincide: la casa está vacía.",
  "Confirmo, sí necesitan ayuda urgente.",
  "Llevé 4 bolsas de mercado. Quedan 2 adultos.",
  "El pin está bien, es el portón verde.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function pointFor(municipality) {
  if (municipality === "Dosquebradas") {
    return { lat: jitter(4.822, 4.858), lng: jitter(-75.692, -75.648) };
  }
  return { lat: jitter(4.788, 4.836), lng: jitter(-75.728, -75.668) };
}

function isStatusConstraint(err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const message =
    err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
  return code === "23514" || message.includes("reports_status_check");
}

const COUNT = 1000;

function buildRows(allowedStatuses) {
  return Array.from({ length: COUNT }, (_, i) => {
    const municipality = i % 3 === 0 ? "Dosquebradas" : "Pereira";
    const barrio =
      municipality === "Dosquebradas" ? pick(BARRIOS_DOSQUEBRADAS) : pick(BARRIOS_PEREIRA);
    const { lat, lng } = pointFor(municipality);
    return {
      title: `[DEMO] ${pick(TITLES)}`,
      description: `Punto de prueba #${i + 1} en ${barrio}. Útil para ver densidad en mapa y lista.`,
      category: pick(CATEGORIES),
      urgent_level: pick(URGENCY),
      status: pick(allowedStatuses),
      municipality,
      location_name: barrio,
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      contact_phone: "3001234567",
    };
  });
}

async function insertBatch(batch) {
  const { data, error } = await supabase.from("reports").insert(batch).select("id, status");
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const { error: deleteError } = await supabase.from("reports").delete().like("title", "[DEMO]%");
  if (deleteError) {
    console.warn("No pude borrar [DEMO] previos:", deleteError.message);
  } else {
    console.log("Limpieza: reportes [DEMO] anteriores eliminados.");
  }

  let statuses = STATUSES;
  let usedFallback = false;
  console.log(`Insertando ${COUNT} reportes [DEMO]...`);
  const created = [];

  for (let attempt = 0; attempt < 2 && created.length === 0; attempt += 1) {
    const rows = buildRows(statuses);
    try {
      for (let i = 0; i < rows.length; i += 50) {
        const data = await insertBatch(rows.slice(i, i + 50));
        created.push(...data);
        process.stdout.write(`  ${created.length}/${COUNT}\n`);
      }
    } catch (err) {
      if (isStatusConstraint(err) && statuses !== FALLBACK_STATUSES) {
        console.warn("Constraint vieja: siembro solo buscando/en_camino/resuelto.");
        console.warn("Aplica supabase/migrations/20260813140000_report_status_flags.sql en el SQL Editor.");
        statuses = FALLBACK_STATUSES;
        usedFallback = true;
        created.length = 0;
        continue;
      }
      throw err;
    }
  }

  const noteRows = created
    .filter((_, i) => i % 2 === 0)
    .slice(0, 480)
    .flatMap((r, i) => {
      const extras = i % 5 === 0 ? 2 : 1;
      return Array.from({ length: extras }, () => ({
        report_id: r.id,
        author_name: pick(["Ana", "Carlos", "Lucía", "Vecino", "Voluntario", "María"]),
        content: pick(NOTES),
      }));
    });

  let notes = 0;
  for (let i = 0; i < noteRows.length; i += 50) {
    const { data, error } = await supabase.from("comments").insert(noteRows.slice(i, i + 50)).select("id");
    if (error) {
      console.warn("Notas parciales:", error.message);
      break;
    }
    notes += data?.length ?? 0;
  }

  const byStatus = created.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Listo: ${created.length} reportes y ${notes} notas de prueba.`);
  console.log("Estados:", byStatus);
  if (usedFallback) {
    console.log("Para poder marcar INFORMACIÓN FALSA / DUPLICADO, corre este SQL en Supabase:");
    console.log("  alter table public.reports drop constraint if exists reports_status_check;");
    console.log("  alter table public.reports add constraint reports_status_check");
    console.log("    check (status in ('buscando','en_camino','resuelto','informacion_falsa','duplicado'));");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
