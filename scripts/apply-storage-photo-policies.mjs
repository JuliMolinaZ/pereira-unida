/**
 * Aplica 20260813160000 (policies storage con roles anon/authenticated).
 * Uso: node scripts/apply-storage-photo-policies.mjs
 */
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
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260813160000_storage_photo_policies.sql"),
  "utf8"
);
const ref = new URL(url).hostname.split(".")[0];

const endpoints = [
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  `${url}/pg/query`,
];

let ok = false;
for (const endpoint of endpoints) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        apikey: secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SQL }),
    });
    const text = await res.text();
    console.log(`${endpoint.includes("api.supabase.com") ? "management" : "pg-meta"}: ${res.status} ${text.slice(0, 180)}`);
    if (res.ok) {
      ok = true;
      break;
    }
  } catch (err) {
    console.log(`endpoint error: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(ok ? "Policies 160000 aplicadas." : "Policies 160000 no aplicadas por API. Hace falta el SQL Editor.");
process.exit(ok ? 0 : 2);
