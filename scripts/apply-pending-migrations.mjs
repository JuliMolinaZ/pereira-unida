/**
 * Aplica las migraciones pendientes contra el proyecto de .env.local.
 * Uso: node scripts/apply-pending-migrations.mjs
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
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secret) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const SQL = `
alter table public.reports
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists photo_urls text[] not null default '{}';

alter table public.people_status
  add column if not exists lat float8;

alter table public.people_status
  add column if not exists lng float8;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status in (
    'buscando',
    'en_camino',
    'resuelto',
    'informacion_falsa',
    'duplicado'
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-photos',
  'community-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community_photos_select" on storage.objects;
create policy "community_photos_select"
  on storage.objects for select
  using (bucket_id = 'community-photos');

drop policy if exists "community_photos_insert" on storage.objects;
create policy "community_photos_insert"
  on storage.objects for insert
  with check (bucket_id = 'community-photos');
`;

const endpoints = [
  {
    name: "management-query",
    url: `https://api.supabase.com/v1/projects/${ref}/database/query`,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: SQL }),
  },
  {
    name: "management-query-apikey",
    url: `https://api.supabase.com/v1/projects/${ref}/database/query`,
    headers: {
      Authorization: `Bearer ${secret}`,
      apikey: secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: SQL }),
  },
  {
    name: "pg-meta",
    url: `${url}/pg/query`,
    headers: {
      Authorization: `Bearer ${secret}`,
      apikey: secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: SQL }),
  },
  {
    name: "database-v1",
    url: `${url}/database/v1/query`,
    headers: {
      Authorization: `Bearer ${secret}`,
      apikey: secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: SQL }),
  },
];

async function tryEndpoints() {
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: endpoint.body,
      });
      const text = await res.text();
      console.log(`${endpoint.name}: ${res.status} ${text.slice(0, 240)}`);
      if (res.ok) return true;
    } catch (err) {
      console.log(`${endpoint.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return false;
}

async function ensureBucket() {
  const supabase = createClient(url, secret);
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.log("storage.listBuckets:", listError.message);
    return;
  }
  const exists = (buckets ?? []).some((b) => b.id === "community-photos" || b.name === "community-photos");
  if (exists) {
    console.log("bucket community-photos: ya existe");
    return;
  }
  const { error } = await supabase.storage.createBucket("community-photos", {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });
  console.log(error ? `bucket create: ${error.message}` : "bucket community-photos: creado");
}

const applied = await tryEndpoints();
await ensureBucket();
console.log(applied ? "SQL aplicado." : "SQL no aplicado por API. Hace falta el SQL Editor o un access token.");
process.exit(applied ? 0 : 2);
