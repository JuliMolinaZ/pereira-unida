"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LocateFixed, Search, X } from "lucide-react";
import {
  cityAt,
  searchCities,
  suggestedCities,
  type AppCity,
} from "@/lib/regions";
import { cn } from "@/lib/utils";

interface RegionPickerProps {
  open: boolean;
  currentId: string;
  required?: boolean;
  onClose: () => void;
  onSelect: (city: AppCity) => void;
}

type GeoStatus = "idle" | "loading" | "error";

export default function RegionPicker({
  open,
  currentId,
  required = false,
  onClose,
  onSelect,
}: RegionPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setGeoStatus("idle");
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();

    function handleClose() {
      onClose();
    }
    function handleCancel(e: Event) {
      if (required) e.preventDefault();
    }
    function handleBackdropClick(e: MouseEvent) {
      if (e.target !== dialog) return;
      if (required) return;
      dialogRef.current?.close();
    }
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [open, onClose, required]);

  const results = useMemo(() => searchCities(query, 30), [query]);
  const emptyQuery = query.trim().length === 0;
  const departmentHint =
    results.length > 0 &&
    !emptyQuery &&
    results.every((city) => city.department === results[0].department) &&
    results.length > 3
      ? results[0].department
      : null;

  function pick(city: AppCity) {
    onSelect(city);
    setQuery("");
    dialogRef.current?.close();
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const found = cityAt(position.coords.latitude, position.coords.longitude);
        if (!found) {
          setGeoStatus("error");
          return;
        }
        setGeoStatus("idle");
        pick(found);
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  if (!open) return null;

  const quick = suggestedCities();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="city-picker-title"
      className="glass m-0 mt-auto flex max-h-[min(90dvh,760px)] w-full max-w-lg flex-col rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0">
          <h2 id="city-picker-title" className="text-[20px] font-semibold text-ink">
            ¿En qué ciudad estás?
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
            Pedir y ofrecer ayuda es solo de esa ciudad. Así no se mezclan.
          </p>
        </div>
        {required ? null : (
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink-soft dark:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-4 pb-2 pt-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoStatus === "loading"}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-forest px-3 text-[16px] font-semibold text-white disabled:opacity-60"
        >
          {geoStatus === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LocateFixed className="h-5 w-5" />
          )}
          Detectar mi ciudad
        </button>

        <label className="mt-2 flex h-12 items-center gap-2 rounded-2xl bg-black/5 px-3.5 dark:bg-white/10">
          <Search className="h-5 w-5 shrink-0 text-ink/50" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe tu ciudad: Quibdó, Cali…"
            autoFocus={!required}
            className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-ink/45"
          />
        </label>
        {geoStatus === "error" ? (
          <p className="mt-2 text-[13px] font-medium text-carmine">
            No se pudo usar el GPS. Escribe tu ciudad y tócala.
          </p>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-ink-soft">
            También puedes escribir el departamento, por ejemplo Chocó o Valle.
          </p>
        )}
      </div>

      <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {emptyQuery ? (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => pick(city)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-[15px] font-semibold",
                  city.id === currentId
                    ? "bg-forest text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                {city.name}
              </button>
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="px-1 py-8 text-center text-[15px] font-medium text-ink-soft">
            No encontramos esa ciudad. Prueba con otra escritura.
          </p>
        ) : (
          <div className="space-y-1">
            {departmentHint ? (
              <p className="mb-1 px-1 text-[12px] font-semibold text-ink-soft">
                Ciudades de {departmentHint}
              </p>
            ) : null}
            {results.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => pick(city)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left",
                  city.id === currentId
                    ? "bg-forest/15 text-forest"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                <span className="text-[16px] font-semibold">{city.name}</span>
                <span className="pl-2 text-[12px] font-medium text-ink-soft">{city.department}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
