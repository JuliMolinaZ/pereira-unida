/**
 * Recalibra lat/lng invertidos (WGS84 Pereira/Dosquebradas).
 * Uso: node scripts/calibrate-coords.mjs
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
if (!url || !key || url.includes("placeholder")) {
  console.error("Falta Supabase en .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

function isSwapped(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -76.5 &&
    lat <= -75.0 &&
    lng >= 4.55 &&
    lng <= 5.15
  );
}

async function swapTable(table) {
  const { data, error } = await supabase.from(table).select("id, lat, lng");
  if (error) {
    console.error(`${table}:`, error.message);
    return 0;
  }
  let n = 0;
  for (const row of data ?? []) {
    if (!isSwapped(row.lat, row.lng)) continue;
    const { error: updError } = await supabase
      .from(table)
      .update({ lat: row.lng, lng: row.lat })
      .eq("id", row.id);
    if (updError) {
      console.error(`${table} ${row.id}:`, updError.message);
      continue;
    }
    n += 1;
  }
  return n;
}

const reports = await swapTable("reports");
const points = await swapTable("collection_points");
const people = await swapTable("people_status");
console.log(`Recalibrados: ${reports} reportes, ${points} acopios, ${people} familia.`);
