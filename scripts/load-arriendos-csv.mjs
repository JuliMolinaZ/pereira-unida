/**
 * Carga masiva de arriendos desde el CSV de Google Forms.
 * Geocodifica la dirección; si no hay calle clara, pin en el centro del barrio.
 *
 * Uso: node scripts/load-arriendos-csv.mjs
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

const USER_AGENT = "PereiraUnida/1.0 (https://pereira-unida.vercel.app)";
const CSV_PATH = resolve(process.cwd(), "Arriendos-csv - Hoja 1.csv");

const CITY_META = {
  Pereira: { department: "Risaralda", lat: 4.8133, lng: -75.6961, maxKm: 18 },
  Dosquebradas: { department: "Risaralda", lat: 4.8389, lng: -75.6708, maxKm: 12 },
  Cartago: { department: "Valle del Cauca", lat: 4.7464, lng: -75.9117, maxKm: 10 },
  "Santa Rosa de Cabal": { department: "Risaralda", lat: 4.8681, lng: -75.6213, maxKm: 10 },
};

/** Centro aproximado de barrios (fallback si Nominatim no encuentra la calle). */
const BARRIO_PINS = {
  "pereira|parque industrial sector b": [4.8242, -75.7318],
  "pereira|parque industrial": [4.8248, -75.7285],
  "pereira|la palmera": [4.8178, -75.6864],
  "pereira|canarte": [4.8112, -75.6978],
  "pereira|campina primera etapa": [4.8086, -75.6815],
  "pereira|urbanizacion hamburgo": [4.7918, -75.7124],
  "pereira|sector condina": [4.7785, -75.7012],
  "pereira|galicia": [4.7768, -75.6815],
  "pereira|poblado i": [4.8024, -75.7178],
  "pereira|poblado": [4.8024, -75.7178],
  "pereira|poblado 1": [4.8024, -75.7178],
  "pereira|cerritos": [4.7588, -75.7486],
  "pereira|el triunfo": [4.8215, -75.7048],
  "pereira|san luis": [4.8052, -75.7064],
  "pereira|villanova": [4.7914, -75.7348],
  "pereira|conjunto villanova cuba": [4.7914, -75.7348],
  "pereira|circunvalar": [4.8062, -75.6888],
  "pereira|samaria 2": [4.7988, -75.6685],
  "pereira|corales": [4.7926, -75.7282],
  "pereira|corales cuba": [4.7926, -75.7282],
  "pereira|cuba": [4.7968, -75.7324],
  "pereira|jardines del nogal": [4.7884, -75.7218],
  "pereira|boston el poblado": [4.8088, -75.7146],
  "pereira|boston": [4.8092, -75.7152],
  "pereira|centro de pereira": [4.8143, -75.6946],
  "pereira|centro": [4.8143, -75.6946],
  "pereira|centro pereira": [4.8143, -75.6946],
  "pereira|condina": [4.7792, -75.7038],
  "pereira|av longitudinal pereira": [4.8195, -75.6892],
  "pereira|cana viva": [4.7624, -75.7528],
  "pereira|barrio hernando velez marulanda detras del colegio hernando velez": [4.8128, -75.6816],
  "pereira|condina palo verde": [4.7765, -75.7088],
  "pereira|berlin": [4.8104, -75.6876],
  "pereira|proyecto la gran reserva conjunto guadua": [4.8012, -75.7194],
  "pereira|barrio popular modelo": [4.8076, -75.6768],
  "dosquebradas|sector playa rica": [4.8512, -75.6648],
  "dosquebradas|montebonito": [4.8448, -75.6556],
  "dosquebradas|la pradera": [4.8334, -75.6682],
  "dosquebradas|pradera": [4.8334, -75.6682],
  "dosquebradas|sector del lago de la pradera": [4.8368, -75.6624],
  "dosquebradas|mirador del lago": [4.8546, -75.6592],
  "dosquebradas|dosquebradas conjunto torres del bosque": [4.8416, -75.6752],
  "dosquebradas|via al japon frailes": [4.8588, -75.6496],
  "dosquebradas|la badea": [4.8476, -75.6774],
  "dosquebradas|buenos aires": [4.8278, -75.6648],
  "dosquebradas|barrio guadalupe": [4.8352, -75.6724],
  "dosquebradas|guadalupe": [4.8352, -75.6724],
  "dosquebradas|conjunto residencial galatea": [4.8394, -75.6612],
  "dosquebradas|parque residencia los molinos": [4.8492, -75.6694],
  "dosquebradas|conjunto residencial acqua hills": [4.8574, -75.6478],
  "dosquebradas|quintas del bosque enseguida de bombay": [4.8442, -75.6816],
  "cartago|villa carolina": [4.7518, -75.9184],
  "santa rosa de cabal|la hermosa": [4.8662, -75.6168],
};

function fold(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((x) => x)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((x) => x)) rows.push(row);
  }
  return rows;
}

function normalizeCity(raw) {
  const h = fold(raw);
  if (/dosquebradas|dosquebeadas/.test(h)) return "Dosquebradas";
  if (/cartago/.test(h)) return "Cartago";
  if (/santa rosa/.test(h)) return "Santa Rosa de Cabal";
  return "Pereira";
}

function parseRent(raw) {
  const s = String(raw ?? "");
  if (!s.trim()) return null;
  if (/no se especifica|no quisieron|no especifica|a convenir/i.test(s) && !/\d{3}/.test(s)) {
    return null;
  }
  const matches = [...s.matchAll(/\$?\s*(\d{1,3}(?:[.\s']\d{3})+|\d{5,8})/g)];
  for (const m of matches) {
    const n = Number(m[1].replace(/[.\s']/g, ""));
    if (Number.isFinite(n) && n >= 80_000 && n <= 15_000_000) return Math.round(n);
  }
  return null;
}

function parseFurnished(raw) {
  const h = fold(raw);
  return /^(si|yes|true|1|amoblada)$/.test(h);
}

function parseSubmittedAt(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const hour = Number(m[4] ?? 0);
  const minute = Number(m[5] ?? 0);
  const second = Number(m[6] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePropertyType(raw) {
  const h = fold(raw);
  if (/apartaestudio|studio/.test(h)) return "Apartaestudio";
  if (/habitacion|cuarto|pieza/.test(h)) return "Habitación";
  if (/apartamento|apto/.test(h)) return "Apartamento";
  if (/finca|campestre/.test(h)) return "Casa";
  if (/casa/.test(h)) return "Casa";
  if (/local/.test(h)) return "Local";
  if (/amoblado/.test(h)) return "Apartamento";
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || /^no especifica$/i.test(trimmed)) return "Otro";
  return trimmed.slice(0, 80);
}

function isVagueAddress(address, neighborhood) {
  const h = fold(address);
  if (!h) return true;
  if (
    /^(n a|na|nd|no esta|no esta especifica|no especifica|no se especifica|ubicado en el primer piso|dosquebradas|centro)$/.test(
      h
    )
  ) {
    return true;
  }
  if (h === fold(neighborhood)) return true;
  if (/^barrio /.test(h) && !/\d/.test(h)) return true;
  return false;
}

function hasStreetHint(address) {
  const h = fold(expandStreet(address));
  return /calle|carrera|transversal|avenida|diagonal|manzana|# \d|\d+\s*-\s*\d+/.test(` ${h} `);
}

function expandStreet(address) {
  return String(address)
    .replace(/\bCra\.?(?=\s*\d)/gi, "Carrera ")
    .replace(/\bCr\.?(?=\s*\d)/gi, "Carrera ")
    .replace(/\bTv\.?(?=\s*\d)/gi, "Transversal ")
    .replace(/\bAv\.?(?=\s*\d)/gi, "Avenida ")
    .replace(/\bCl\.?(?=\s*\d)/gi, "Calle ")
    .replace(/\b(Carrera|Calle|Transversal|Avenida|Diagonal)(?=\d)/gi, "$1 ")
    .replace(/#/g, " # ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStreet(address) {
  const expanded = expandStreet(address);
  const m = expanded.match(
    /\b(Carrera|Calle|Transversal|Avenida|Diagonal)\s+\d+[A-Za-zªº]?\s*(Bis)?\s*(#|No\.?)?\s*\d+[A-Za-z]?\s*-?\s*\d*/i
  );
  return m ? m[0].replace(/\s+/g, " ").trim() : expanded;
}

function streetForGeocode(address) {
  return extractStreet(address)
    .replace(
      /\b(apto\.?|apartamento|torre\s*\d+|bloque\s*\d+|manzana\s*\w+|mz\.?\s*\d+|cs\.?\s*\d+|casa\s*\d+|piso\s*\d+)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

let nominatimAt = 0;
async function nominatimSearch(query, city) {
  const wait = 1100 - (Date.now() - nominatimAt);
  if (wait > 0) await sleep(wait);
  nominatimAt = Date.now();
  const meta = CITY_META[city];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("accept-language", "es");
  if (meta) {
    const pad = 0.18;
    url.searchParams.set(
      "viewbox",
      `${meta.lng - pad},${meta.lat + pad},${meta.lng + pad},${meta.lat - pad}`
    );
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const hits = await res.json();
  const metaCity = CITY_META[city];
  for (const hit of hits) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (metaCity && distKm({ lat, lng }, metaCity) > metaCity.maxKm) continue;
    return { lat, lng, name: hit.display_name, source: "nominatim" };
  }
  return null;
}

async function photonSearch(query, city) {
  const meta = CITY_META[city];
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", query);
  url.searchParams.set("lat", String(meta?.lat ?? 4.8133));
  url.searchParams.set("lon", String(meta?.lng ?? -75.6961));
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "es");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  for (const feature of data.features ?? []) {
    const coords = feature.geometry?.coordinates;
    if (!coords) continue;
    const [lng, lat] = coords;
    if (meta && distKm({ lat, lng }, meta) > meta.maxKm) continue;
    return { lat, lng, name: feature.properties?.name, source: "photon" };
  }
  return null;
}

async function geocodeQuery(query, city) {
  const fromNominatim = await nominatimSearch(query, city).catch(() => null);
  if (fromNominatim) return fromNominatim;
  return photonSearch(query, city).catch(() => null);
}

function barrioPin(city, neighborhood) {
  const key = `${fold(city)}|${fold(neighborhood)}`;
  const hit = BARRIO_PINS[key];
  if (!hit) return null;
  return { lat: hit[0], lng: hit[1], name: neighborhood, source: "barrio" };
}

function offsetPin(lat, lng, index) {
  if (index <= 0) return { lat, lng };
  const angle = (index % 8) * (Math.PI / 4);
  const radius = 0.0002 * (1 + Math.floor(index / 8));
  return {
    lat: lat + Math.cos(angle) * radius,
    lng: lng + Math.sin(angle) * radius,
  };
}

function parseRows(text) {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("CSV vacío");
  const header = table[0].map(fold);
  let idx = {
    time: header.findIndex((h) => /marca temporal|timestamp/.test(h)),
    city: header.findIndex((h) => /ciudad/.test(h)),
    barrio: header.findIndex((h) => /barrio|sector/.test(h)),
    address: header.findIndex((h) => /direccion|ubicacion/.test(h)),
    type: header.findIndex((h) => /tipo|inmueble/.test(h)),
    furnished: header.findIndex((h) => /amoblad/.test(h)),
    contact: header.findIndex((h) => /propietario|contacto/.test(h)),
    rent: header.findIndex((h) => /valor|arriendo|mensual/.test(h)),
  };

  const rows = [];
  for (const cells of table.slice(1)) {
    let offset = 0;
    if (/^\d+$/.test(cells[0] ?? "") && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cells[1] ?? "")) {
      offset = 1;
    }
    const get = (i) => (i < 0 ? "" : (cells[i + offset] ?? "").replace(/\s+/g, " ").trim());
    const cityRaw = get(idx.city);
    const neighborhood = get(idx.barrio);
    const addressRaw = get(idx.address);
    const contact = get(idx.contact);
    if (!cityRaw && !neighborhood && !addressRaw && !contact) continue;
    if (!/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(get(idx.time)) && !cityRaw) continue;

    const city = normalizeCity(cityRaw || "Pereira");
    const address = addressRaw || neighborhood;
    if (!address || !contact) continue;
    const meta = CITY_META[city];
    rows.push({
      municipality: city,
      department: meta.department,
      neighborhood: neighborhood.slice(0, 120),
      address: address.slice(0, 200),
      property_type: normalizePropertyType(get(idx.type)),
      furnished: parseFurnished(get(idx.furnished)),
      contact: (contact || "Sin contacto").slice(0, 80),
      monthly_rent: parseRent(get(idx.rent)),
      submitted_at: parseSubmittedAt(get(idx.time)),
    });
  }
  return rows;
}

async function refineStreetPins(supabase) {
  const { data, error } = await supabase
    .from("rentals")
    .select("id,address,neighborhood,municipality,department,lat,lng");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  let updated = 0;
  let kept = 0;
  for (const row of data ?? []) {
    if (isVagueAddress(row.address, row.neighborhood) || !hasStreetHint(row.address)) {
      kept += 1;
      continue;
    }
    const street = streetForGeocode(row.address);
    if (street.length < 5) {
      kept += 1;
      continue;
    }
    let geo = await geocodeQuery(
      `${street}, ${row.municipality}, ${row.department}, Colombia`,
      row.municipality
    );
    if (!geo && row.neighborhood) {
      geo = await geocodeQuery(
        `${street}, ${row.neighborhood}, ${row.municipality}, Colombia`,
        row.municipality
      );
    }
    if (!geo) {
      console.log(`  sin calle OSM: ${row.address}`);
      kept += 1;
      continue;
    }
    const moved = distKm(geo, { lat: Number(row.lat), lng: Number(row.lng) });
    if (moved < 0.12) {
      kept += 1;
      continue;
    }
    const { error: upErr } = await supabase
      .from("rentals")
      .update({ lat: geo.lat, lng: geo.lng })
      .eq("id", row.id);
    if (upErr) {
      console.error(upErr.message);
      continue;
    }
    updated += 1;
    console.log(`  calle +${moved.toFixed(2)}km · ${street} · ${row.municipality}`);
  }
  console.log(`\nPines de calle actualizados: ${updated}. Sin cambio: ${kept}.`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o clave de Supabase en .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  if (process.argv.includes("--refine")) {
    await refineStreetPins(supabase);
    return;
  }

  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = parseRows(raw);
  console.log(`Filas leídas: ${parsed.length}`);

  if (process.argv.includes("--replace")) {
    const wipe = await supabase.from("rentals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (wipe.error) {
      console.error("No pude limpiar rentals previas:", wipe.error.message);
      process.exit(1);
    }
    console.log("Tabla rentals vaciada para recargar el CSV con pines correctos.");
  }

  const seen = new Set();

  const barrioCache = new Map();
  const usedCoords = new Map();
  const payload = [];
  let streetPins = 0;
  let barrioPins = 0;
  let cityPins = 0;

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    const dupKey = `${fold(row.address)}|${row.contact.replace(/\D/g, "")}`;
    if (seen.has(dupKey)) {
      console.log(`  skip duplicado: ${row.address}`);
      continue;
    }
    seen.add(dupKey);

    const vague = isVagueAddress(row.address, row.neighborhood);
    const street = streetForGeocode(row.address);
    let geo = null;
    let how = "";

    if (!vague && street.length >= 5 && hasStreetHint(row.address)) {
      const q1 = `${street}, ${row.municipality}, ${row.department}, Colombia`;
      geo = await geocodeQuery(q1, row.municipality);
      if (geo) {
        how = "calle";
        streetPins += 1;
      }
    }

    if (!geo && !vague && street.length >= 8) {
      const q2 = `${street}, ${row.neighborhood}, ${row.municipality}, Colombia`;
      geo = await geocodeQuery(q2, row.municipality);
      if (geo) {
        how = "conjunto";
        streetPins += 1;
      }
    }

    if (!geo) {
      const bkey = `${fold(row.municipality)}|${fold(row.neighborhood)}`;
      if (row.neighborhood && barrioCache.has(bkey)) {
        geo = barrioCache.get(bkey);
      } else if (row.neighborhood) {
        const local = barrioPin(row.municipality, row.neighborhood);
        const q3 = `${row.neighborhood}, ${row.municipality}, ${row.department}, Colombia`;
        const remote = await geocodeQuery(q3, row.municipality);
        geo = remote
          ? { ...remote, source: "barrio-geo" }
          : local
            ? local
            : null;
        if (geo) barrioCache.set(bkey, geo);
      }
      if (geo) {
        how = geo.source === "barrio" || geo.source === "barrio-geo" ? "barrio" : "barrio";
        barrioPins += 1;
      }
    }

    if (!geo) {
      const meta = CITY_META[row.municipality];
      geo = { lat: meta.lat, lng: meta.lng, source: "ciudad" };
      how = "ciudad";
      cityPins += 1;
    }

    const coordKey = `${geo.lat.toFixed(5)},${geo.lng.toFixed(5)}`;
    const n = usedCoords.get(coordKey) ?? 0;
    usedCoords.set(coordKey, n + 1);
    const pin = offsetPin(geo.lat, geo.lng, n);

    payload.push({
      ...row,
      photo_urls: [],
      lat: pin.lat,
      lng: pin.lng,
      status: "disponible",
    });
    console.log(`${i + 1}/${parsed.length} [${how}] ${row.municipality} · ${row.address}`);
  }

  if (payload.length === 0) {
    console.log("Nada nuevo para insertar.");
    return;
  }

  const { error } = await supabase.from("rentals").insert(payload);
  if (error) {
    console.error("Insert falló:", error.message);
    process.exit(1);
  }

  console.log(
    `\nPublicadas ${payload.length} viviendas · pin de calle ${streetPins} · pin de barrio ${barrioPins} · pin de ciudad ${cityPins}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
