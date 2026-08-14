"use client";

import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { importRentals, type RentalImportRow } from "@/app/actions";
import {
  geocodeQueryFor,
  neighborhoodQueryFor,
  parseRentalsSpreadsheet,
} from "@/lib/rentals";
import { formatCop } from "@/lib/utils";
import { type Rental } from "@/lib/types";

type PreviewRow = RentalImportRow & {
  sourceLine: number;
  geo: "pending" | "ok" | "fail";
};

interface RentalAdminPanelProps {
  accessKey: string;
  initialRentals: Rental[];
}

export default function RentalAdminPanel({
  accessKey,
  initialRentals,
}: RentalAdminPanelProps) {
  const [rentals] = useState(initialRentals);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"geo" | "import" | null>(null);

  const available = useMemo(
    () => rentals.filter((item) => item.status === "disponible"),
    [rentals]
  );

  async function geocodeRow(row: PreviewRow): Promise<PreviewRow> {
    const queries = [geocodeQueryFor(row), neighborhoodQueryFor(row)].filter(
      (query, index, all) => query.length >= 3 && all.indexOf(query) === index
    );
    for (const q of queries) {
      const url = `/api/geocode?q=${encodeURIComponent(q)}&city=${encodeURIComponent(row.municipality)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { lat: number | null; lng: number | null };
      if (data.lat != null && data.lng != null) {
        return { ...row, lat: data.lat, lng: data.lng, geo: "ok" };
      }
    }
    return { ...row, lat: null, lng: null, geo: "fail" };
  }

  async function handlePrepare() {
    setParseError(null);
    setStatus(null);
    const parsed = parseRentalsSpreadsheet(raw);
    if (parsed.error) {
      setPreview([]);
      setParseError(parsed.error);
      return;
    }
    const rows: PreviewRow[] = parsed.rows.map((row) => ({
      ...row,
      lat: null,
      lng: null,
      geo: "pending",
    }));
    setPreview(rows);
    setBusy("geo");
    const next: PreviewRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const located = await geocodeRow(rows[i]);
      next.push(located);
      setPreview([...next, ...rows.slice(i + 1)]);
      setStatus(`Ubicando ${i + 1} de ${rows.length}…`);
    }
    const ok = next.filter((row) => row.geo === "ok").length;
    const fail = next.length - ok;
    setStatus(
      fail === 0
        ? `${ok} viviendas listas, todas con pin.`
        : `${ok} con pin · ${fail} sin pin (se verán en la lista, no en el mapa).`
    );
    setBusy(null);
  }

  async function handleImport() {
    if (preview.length === 0) return;
    setBusy("import");
    setParseError(null);
    const result = await importRentals(accessKey, preview);
    setBusy(null);
    if (!result.success || !result.data) {
      setParseError(result.error ?? "No se pudieron guardar.");
      return;
    }
    setStatus(
      `Se publicaron ${result.data.created} viviendas` +
        (result.data.withoutPin ? ` (${result.data.withoutPin} sin pin)` : "") +
        (result.data.skipped ? `. Se omitieron ${result.data.skipped}.` : ".")
    );
    setPreview([]);
    setRaw("");
    window.location.reload();
  }

  return (
    <div>
      <p className="mb-3 text-[13px] leading-snug text-ink-soft">
        Pega aquí las filas del Excel o Google Forms, incluida la fila de encabezados.
        Ubicamos cada dirección en el mapa y luego las publicamos.
      </p>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={
          "Marca temporal\t¿En qué ciudad…?\t¿En qué barrio…?\tDirección…\n12/08/2026 12:28:38\tPereira\tLa palmera\tCarrera 7#42-10\tHabitación\tSI\t3158300978\t$800.000"
        }
        className="w-full rounded-2xl bg-black/5 px-3 py-2.5 font-mono text-[12px] text-ink outline-none placeholder:text-ink-soft/50 focus:ring-2 focus:ring-[#1a6b78]/30 dark:bg-white/10"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void handlePrepare()}
          disabled={busy !== null || raw.trim().length === 0}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1a6b78]/90 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {busy === "geo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Leer y ubicar
        </button>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy !== null || preview.length === 0}
          className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-forest/90 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar {preview.length > 0 ? preview.length : ""}
        </button>
      </div>

      {parseError ? (
        <p className="mt-2 text-[13px] font-medium text-carmine" role="alert">
          {parseError}
        </p>
      ) : null}
      {status ? <p className="mt-2 text-[13px] font-medium text-ink">{status}</p> : null}

      {preview.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {preview.map((row, index) => (
            <article key={`${row.sourceLine}-${index}`} className="rounded-2xl bg-black/5 px-3 py-2 dark:bg-white/10">
              <p className="text-[13px] font-semibold text-ink">
                {row.property_type} · {formatCop(row.monthly_rent)}
              </p>
              <p className="text-[12px] text-ink-soft">
                {row.neighborhood ? `${row.neighborhood} · ` : ""}
                {row.address} · {row.municipality}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-ink-soft">
                {row.geo === "pending"
                  ? "Buscando en el mapa…"
                  : row.geo === "ok"
                    ? "Pin listo"
                    : "Sin pin — se verá en la lista"}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <p className="mt-5 mb-2 px-1 text-[12px] font-medium text-ink-soft">
        {available.length === 0
          ? "Todavía no hay arriendos publicados."
          : `${available.length} vivienda${available.length === 1 ? "" : "s"} en el mapa`}
      </p>
      <div className="space-y-2">
        {available.slice(0, 40).map((item) => (
          <article key={item.id} className="rounded-[22px] bg-black/5 px-3 py-2.5 dark:bg-white/10">
            <p className="text-[15px] font-semibold text-ink">
              {item.property_type} · {formatCop(item.monthly_rent)}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              {[item.neighborhood, item.address, item.municipality].filter(Boolean).join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
