/**
 * Vacía datos de prueba / comunidad para dejar la base lista para producción.
 * Conserva puntos de acopio (datos operativos).
 * Uso: node scripts/wipe-for-production.mjs
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
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
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

async function deleteAll(table) {
  const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function emptyFolder(folder) {
  const { data, error } = await supabase.storage.from("community-photos").list(folder, { limit: 1000 });
  if (error) {
    console.warn(`storage ${folder}: ${error.message}`);
    return 0;
  }
  const names = (data ?? []).map((f) => `${folder}/${f.name}`).filter((p) => !p.endsWith("/"));
  if (names.length === 0) return 0;
  const { error: removeError } = await supabase.storage.from("community-photos").remove(names);
  if (removeError) {
    console.warn(`storage remove ${folder}: ${removeError.message}`);
    return 0;
  }
  return names.length;
}

const before = {
  reports: await count("reports"),
  comments: await count("comments"),
  people_status: await count("people_status"),
  collection_points: await count("collection_points"),
};
console.log("Antes:", before);

await deleteAll("reports");
await deleteAll("people_status");
const { error: commentsError } = await supabase
  .from("comments")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (commentsError && !/does not exist|0 rows/i.test(commentsError.message)) {
  console.warn("comments:", commentsError.message);
}

async function emptySpacesPhotos() {
  const key = process.env.SPACES_KEY;
  const secret = process.env.SPACES_SECRET;
  const bucket = process.env.SPACES_BUCKET;
  const region = process.env.SPACES_REGION;
  if (!key || !secret || !bucket || !region) return 0;
  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region,
    endpoint: process.env.SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
  let removed = 0;
  let token;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "photos/",
        ContinuationToken: token,
      })
    );
    const objects = listed.Contents?.map((item) => item.Key).filter(Boolean) ?? [];
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.map((Key) => ({ Key })), Quiet: true },
        })
      );
      removed += objects.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

const removedPhotos =
  (await emptyFolder("reports")) + (await emptyFolder("people")) + (await emptySpacesPhotos());

const after = {
  reports: await count("reports"),
  comments: await count("comments"),
  people_status: await count("people_status"),
  collection_points: await count("collection_points"),
  fotos_borradas: removedPhotos,
};
console.log("Después:", after);
console.log("Puntos de acopio conservados (datos operativos).");
