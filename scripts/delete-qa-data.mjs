/**
 * Borra SOLO datos QA de validación. Conserva acopios y el resto de reportes.
 * Uso: node scripts/delete-qa-data.mjs
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
if (!url || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o clave de Supabase");
  process.exit(1);
}

const supabase = createClient(url, key);

async function count(table) {
  const { count: n, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.warn(`${table}: ${error.message}`);
    return null;
  }
  return n ?? 0;
}

function storagePathsFromUrls(urls) {
  if (!Array.isArray(urls)) return [];
  const out = [];
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const marker = "/storage/v1/object/public/community-photos/";
    const idx = raw.indexOf(marker);
    if (idx >= 0) out.push(raw.slice(idx + marker.length));
  }
  return out;
}

function isQaReport(row) {
  const title = String(row.title ?? "");
  if (/VALIDACION QA/i.test(title)) return true;
  if (/Cobijas para 4 personas QA/i.test(title)) return true;
  if (/herramientas_rescate/.test(row.category) && /\bTest\b/i.test(title)) return true;
  if (/E2E/i.test(title) && /QA|Test|validaci/i.test(title)) return true;
  return false;
}

function isQaPerson(row) {
  const name = String(row.full_name ?? "");
  return /QA Validacion Familia/i.test(name) || /QA Familia UI E2E/i.test(name);
}

const before = {
  reports: await count("reports"),
  comments: await count("comments"),
  people_status: await count("people_status"),
  collection_points: await count("collection_points"),
};
console.log("Antes:", before);

const { data: reports, error: reportsError } = await supabase
  .from("reports")
  .select("id, title, category, photo_urls");
if (reportsError) throw new Error(reportsError.message);

const qaReports = (reports ?? []).filter(isQaReport);
console.log(
  "Reports QA a borrar:",
  qaReports.map((r) => `${r.id.slice(0, 8)} | ${r.title}`)
);

const { data: people, error: peopleError } = await supabase
  .from("people_status")
  .select("id, full_name, photo_urls");
if (peopleError) throw new Error(peopleError.message);

const qaPeople = (people ?? []).filter(isQaPerson);
console.log(
  "people_status QA a borrar:",
  qaPeople.map((p) => `${p.id.slice(0, 8)} | ${p.full_name}`)
);

const photoPaths = [
  ...qaReports.flatMap((r) => storagePathsFromUrls(r.photo_urls)),
  ...qaPeople.flatMap((p) => storagePathsFromUrls(p.photo_urls)),
];

const reportIds = qaReports.map((r) => r.id);
if (reportIds.length > 0) {
  const { error: commentsError } = await supabase.from("comments").delete().in("report_id", reportIds);
  if (commentsError) console.warn("comments:", commentsError.message);
  const { error: delReports } = await supabase.from("reports").delete().in("id", reportIds);
  if (delReports) throw new Error(delReports.message);
}

const peopleIds = qaPeople.map((p) => p.id);
if (peopleIds.length > 0) {
  const { error: delPeople } = await supabase.from("people_status").delete().in("id", peopleIds);
  if (delPeople) throw new Error(delPeople.message);
}

let removedPhotos = 0;
if (photoPaths.length > 0) {
  const { error: removeError } = await supabase.storage.from("community-photos").remove(photoPaths);
  if (removeError) console.warn("storage remove:", removeError.message);
  else removedPhotos = photoPaths.length;
}

const after = {
  reports: await count("reports"),
  comments: await count("comments"),
  people_status: await count("people_status"),
  collection_points: await count("collection_points"),
  reports_qa_borrados: qaReports.length,
  people_qa_borrados: qaPeople.length,
  fotos_borradas: removedPhotos,
};
console.log("Después:", after);
console.log("Acopios conservados.");
