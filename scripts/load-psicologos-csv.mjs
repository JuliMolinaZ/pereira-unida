/**
 * Carga masiva de psicólogos desde el CSV de apoyo psicológico.
 * No borra ofertas existentes. Salta teléfonos que ya estén en psicología.
 *
 * Uso: node scripts/load-psicologos-csv.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
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

function findCsvPath() {
  const named = process.argv.find((arg) => arg.endsWith(".csv"));
  if (named) return resolve(process.cwd(), named);
  const match = readdirSync(process.cwd()).find((name) => {
    const h = fold(name);
    return h.includes("apoyo psicologico") && name.endsWith(".csv");
  });
  if (!match) {
    console.error("No encontré el CSV de apoyo psicológico en la raíz del repo.");
    process.exit(1);
  }
  return resolve(process.cwd(), match);
}

function digits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function formatPhone(raw) {
  const d = digits(raw);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function formatHandle(raw) {
  const s = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^@+/, "");
  if (!s) return "";
  const user = s.replace(/\s+/g, "");
  return user ? `@${user}` : "";
}

function buildDescription({ modality, handle }) {
  const parts = ["Acompañamiento psicológico gratuito por el terremoto."];
  if (/virtual/i.test(modality)) parts.push("Atención virtual.");
  else if (modality) parts.push(modality);
  if (handle) parts.push(`IG ${handle}`);
  return parts.join(" ").slice(0, 280);
}

function parseRows(text) {
  const table = parseCsv(text);
  const headerIdx = table.findIndex((row) =>
    row.some((cell) => fold(cell) === "nombre") &&
    row.some((cell) => fold(cell) === "contacto")
  );
  if (headerIdx < 0) throw new Error("No encontré la fila de NOMBRE / CONTACTO.");
  const header = table[headerIdx].map(fold);
  const idx = {
    name: header.findIndex((h) => h === "nombre"),
    phone: header.findIndex((h) => h === "contacto"),
    modality: header.findIndex((h) => h.includes("modalidad")),
    social: header.findIndex((h) => h.includes("redes")),
  };
  if (idx.name < 0 || idx.phone < 0) {
    throw new Error("El CSV no tiene columnas NOMBRE y CONTACTO.");
  }

  const rows = [];
  const seen = new Set();
  for (const cells of table.slice(headerIdx + 1)) {
    const name = String(cells[idx.name] ?? "").replace(/\s+/g, " ").trim();
    const phoneRaw = String(cells[idx.phone] ?? "").trim();
    const phone = digits(phoneRaw);
    if (!name || phone.length < 7) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    const modality = String(cells[idx.modality] ?? "").replace(/\s+/g, " ").trim();
    const handle = formatHandle(cells[idx.social]);
    rows.push({
      full_name: name.slice(0, 80),
      skill: "psicologia",
      description: buildDescription({ modality, handle }),
      phone: formatPhone(phoneRaw),
      municipality: "Pereira",
      department: "Risaralda",
      status: "activa",
    });
  }
  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o clave de Supabase en .env.local");
    process.exit(1);
  }

  const csvPath = findCsvPath();
  const parsed = parseRows(readFileSync(csvPath, "utf8"));
  console.log(`CSV: ${csvPath}`);
  console.log(`Filas leídas: ${parsed.length}`);
  for (const row of parsed) {
    console.log(`  · ${row.full_name} · ${row.phone}`);
  }

  if (process.argv.includes("--dry-run")) return;

  const supabase = createClient(url, key);
  const { data: existing, error: existingErr } = await supabase
    .from("help_offers")
    .select("phone, full_name")
    .eq("skill", "psicologia");
  if (existingErr) {
    console.error("No pude leer ofertas actuales:", existingErr.message);
    process.exit(1);
  }

  const taken = new Set((existing ?? []).map((row) => digits(row.phone)));
  const payload = parsed.filter((row) => {
    const phone = digits(row.phone);
    if (taken.has(phone)) {
      console.log(`  skip duplicado: ${row.full_name}`);
      return false;
    }
    taken.add(phone);
    return true;
  });

  if (payload.length === 0) {
    console.log("Nada nuevo para insertar.");
    return;
  }

  const { error } = await supabase.from("help_offers").insert(payload);
  if (error) {
    console.error("Insert falló:", error.message);
    process.exit(1);
  }

  console.log(`\nPublicadas ${payload.length} ofertas de psicología (virtual, Pereira).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
