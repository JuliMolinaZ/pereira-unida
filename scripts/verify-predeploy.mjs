/**
 * Verifica schema + REST anon (insert de prueba y borrado).
 * No imprime keys. Uso: node scripts/verify-predeploy.mjs
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
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon) {
  console.error("Falta URL o anon key");
  process.exit(1);
}

const admin = createClient(url, secret || anon);
const publicClient = createClient(url, anon);
const stamp = `predeploy-check-${Date.now()}`;

const checks = [];

const { data: reportCols, error: reportColError } = await admin
  .from("reports")
  .select("id, photo_urls, status")
  .limit(1);
checks.push({
  name: "reports.photo_urls seleccionable",
  ok: !reportColError,
  detail: reportColError?.message ?? `ok (${reportCols?.length ?? 0} filas de muestra)`,
});

const { data: peopleCols, error: peopleColError } = await admin
  .from("people_status")
  .select("id, photo_urls, lat, lng")
  .limit(1);
checks.push({
  name: "people_status.photo_urls/lat/lng seleccionables",
  ok: !peopleColError,
  detail: peopleColError?.message ?? `ok (${peopleCols?.length ?? 0} filas de muestra)`,
});

const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
const bucketOk = (buckets ?? []).some((b) => b.id === "community-photos" || b.name === "community-photos");
checks.push({
  name: "bucket community-photos",
  ok: !bucketError && bucketOk,
  detail: bucketError?.message ?? (bucketOk ? "existe" : "NO existe"),
});

const { data: insertedReport, error: insertReportError } = await publicClient
  .from("reports")
  .insert({
    title: stamp,
    description: "predeploy check — borrar",
    category: "otros",
    urgent_level: "moderado",
    status: "informacion_falsa",
    municipality: "Pereira",
    location_name: "QA check",
    lat: 4.8143,
    lng: -75.6946,
    contact_phone: "3000000000",
    photo_urls: [],
  })
  .select("id, status")
  .single();
checks.push({
  name: "anon insert reports.status=informacion_falsa",
  ok: !insertReportError && insertedReport?.status === "informacion_falsa",
  detail: insertReportError?.message ?? `id ${insertedReport?.id?.slice(0, 8)} status=${insertedReport?.status}`,
});
if (insertedReport?.id) {
  const { error: delRep } = await admin.from("reports").delete().eq("id", insertedReport.id);
  checks.push({
    name: "borrar reporte de verificación",
    ok: !delRep,
    detail: delRep?.message ?? "borrado",
  });
}

const { data: insertedPerson, error: insertPersonError } = await publicClient
  .from("people_status")
  .insert({
    full_name: stamp,
    municipality: "Pereira",
    neighborhood: "QA check",
    lat: 4.8143,
    lng: -75.6946,
    status: "a_salvo",
    contact_number: "3000000000",
    photo_urls: [],
  })
  .select("id, lat, lng")
  .single();
checks.push({
  name: "anon insert people_status con lat/lng",
  ok: !insertPersonError && insertedPerson?.lat != null && insertedPerson?.lng != null,
  detail: insertPersonError?.message ?? `id ${insertedPerson?.id?.slice(0, 8)} lat=${insertedPerson?.lat}`,
});
if (insertedPerson?.id) {
  const { error: delPeo } = await admin.from("people_status").delete().eq("id", insertedPerson.id);
  checks.push({
    name: "borrar people_status de verificación",
    ok: !delPeo,
    detail: delPeo?.message ?? "borrado",
  });
}

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=",
  "base64"
);
const uploadPath = `reports/predeploy-check-${Date.now()}.jpg`;
const { error: uploadError } = await publicClient.storage
  .from("community-photos")
  .upload(uploadPath, tinyJpeg, { contentType: "image/jpeg", upsert: false });
checks.push({
  name: "anon upload community-photos (policy insert)",
  ok: !uploadError,
  detail: uploadError?.message ?? `ok ${uploadPath}`,
});
if (!uploadError) {
  const { error: rmUp } = await admin.storage.from("community-photos").remove([uploadPath]);
  checks.push({
    name: "borrar foto de verificación",
    ok: !rmUp,
    detail: rmUp?.message ?? "borrada",
  });
}

let failed = 0;
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"}  ${check.name}: ${check.detail}`);
  if (!check.ok) failed += 1;
}
process.exit(failed === 0 ? 0 : 1);
