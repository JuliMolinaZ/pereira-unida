/**
 * Reemplaza acopios por los CAFE reales + Banco de Alimentos (Cáritas).
 * Coordenadas fijas (no geocodificar en vivo).
 * Uso: node scripts/seed-real-acopio.mjs
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
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const POINTS = [
  {
    name: "CAFE Consota",
    municipality: "Pereira",
    address: "Mz 7 y Mz 8, Villa Consota (Cuba)",
    lat: 4.8011,
    lng: -75.7385,
    supplies_needed: ["Alimentos", "Cobijas", "Ropa"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE Perla del Otún",
    municipality: "Pereira",
    address: "Frente a iglesia de 2.500 Lotes",
    lat: 4.7981,
    lng: -75.7392,
    supplies_needed: ["Alimentos", "Agua", "Aseo"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE El Remanso",
    municipality: "Pereira",
    address: "Av. Principal, junto a Centro de Salud",
    lat: 4.7872,
    lng: -75.6521,
    supplies_needed: ["Medicinas", "Primeros Auxilios", "Alimentos"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE Kennedy",
    municipality: "Pereira",
    address: "Parque Principal / Cancha de Kennedy",
    lat: 4.8042,
    lng: -75.6828,
    supplies_needed: ["Herramientas", "Cascos", "Alimentos"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE Ormaza",
    municipality: "Pereira",
    address: "Calle 3 Bis # 5-38 (Av. del Río)",
    lat: 4.809,
    lng: -75.683,
    supplies_needed: ["Herramientas de rescate", "Insumos"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE San Nicolás",
    municipality: "Pereira",
    address: "Carrera 14 Bis # 28-38",
    lat: 4.8115,
    lng: -75.702,
    supplies_needed: ["Equipos TIC", "Alimentos", "Logística"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "CAFE Comuna del Café",
    municipality: "Pereira",
    address: "Cra 3 con Cl 59A (Parque Industrial A)",
    lat: 4.8325,
    lng: -75.727,
    supplies_needed: ["Alimentos", "Herramientas", "Agua"],
    open_hours: "7:00 AM - 4:00 PM",
    contact: "Alcaldía de Pereira",
  },
  {
    name: "Banco de Alimentos (Cáritas)",
    municipality: "Dosquebradas",
    address: "Tv 5 # 6-30, La Badea (Dosquebradas)",
    lat: 4.8315,
    lng: -75.6865,
    supplies_needed: ["Granos", "Víveres no perecederos", "Agua"],
    open_hours: "7:30 AM - 5:00 PM",
    contact: "(606) 3302020",
  },
];

const { error: deleteError } = await supabase
  .from("collection_points")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (deleteError) {
  console.error("No pude borrar acopios viejos:", deleteError.message);
  process.exit(1);
}

const { data, error } = await supabase.from("collection_points").insert(POINTS).select("name, municipality, lat, lng");
if (error) {
  console.error(error);
  process.exit(1);
}
for (const row of data ?? []) {
  console.log(`${row.name}: ${row.lat}, ${row.lng} (${row.municipality})`);
}
console.log(`Listo: ${data?.length ?? 0} puntos.`);
