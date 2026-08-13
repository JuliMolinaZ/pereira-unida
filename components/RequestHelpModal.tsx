"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { createReport, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { cn } from "@/lib/utils";
import { explainPhotoFailure } from "@/lib/photos";
import PhotoPicker from "./PhotoPicker";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  MUNICIPALITIES,
  type Municipality,
  type Report,
  type ReportCategory,
  type UrgentLevel,
} from "@/lib/types";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-2xl bg-[#0e0e10] text-xs text-white/70">
      Cargando mapa
    </div>
  ),
});

interface RequestHelpModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (report: Report) => void;
}

const initialState: ActionResult<Report> = { success: false };

type GeoStatus = "idle" | "loading" | "success" | "error";

const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-carmine/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

export default function RequestHelpModal({ open, onClose, onCreated }: RequestHelpModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locationName, setLocationName] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>("Pereira");
  const [category, setCategory] = useState<ReportCategory>("alimentos");
  const [urgency, setUrgency] = useState<UrgentLevel>("moderado");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [mapOpen, setMapOpen] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const [photosBusy, setPhotosBusy] = useState(false);
  const photosRef = useRef<File[]>([]);
  const locationRef = useRef({ lat, lng, locationName, category, municipality, urgency });
  locationRef.current = { lat, lng, locationName, category, municipality, urgency };

  const hasExactLocation = Boolean(lat && lng);

  function resetForm() {
    formRef.current?.reset();
    setLat("");
    setLng("");
    setLocationName("");
    setMunicipality("Pereira");
    setCategory("alimentos");
    setUrgency("moderado");
    setGeoStatus("idle");
    setMapOpen(false);
    setPhotoEpoch((n) => n + 1);
    photosRef.current = [];
    setPhotosBusy(false);
  }

  async function applyCoords(latitude: number, longitude: number) {
    const exactLat = latitude.toFixed(7);
    const exactLng = longitude.toFixed(7);
    setLat(exactLat);
    setLng(exactLng);
    setLocationName((prev) => prev || "Ubicación exacta");
    setGeoStatus("loading");
    locationRef.current = {
      ...locationRef.current,
      lat: exactLat,
      lng: exactLng,
      locationName: locationRef.current.locationName || "Ubicación exacta",
    };
    try {
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        setLocationName(geo.displayName);
        setMunicipality(geo.municipality);
        locationRef.current = {
          ...locationRef.current,
          locationName: geo.displayName,
          municipality: geo.municipality,
        };
      }
      setGeoStatus("success");
    } catch {
      setGeoStatus("success");
    }
  }

  const [state, formAction, isPending] = useActionState(
    async (_prevState: ActionResult<Report>, formData: FormData) => {
      const loc = locationRef.current;
      formData.set("category", loc.category);
      formData.set("municipality", loc.municipality);
      formData.set("urgent_level", loc.urgency);
      formData.set("lat", loc.lat);
      formData.set("lng", loc.lng);
      formData.set("location_name", loc.locationName || "Ubicación exacta");
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      try {
        const result = await createReport(formData);
        if (result.success && result.data) {
          onCreated(result.data);
          resetForm();
          dialogRef.current?.close();
        }
        return result;
      } catch (err) {
        const raw =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? "unexpected response"
              : String(err);
        return { success: false, error: explainPhotoFailure(raw) };
      }
    },
    initialState
  );

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setMapOpen(true);
        await applyCoords(position.coords.latitude, position.coords.longitude);
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    if (!dialog.open) dialog.showModal();

    function handleClose() {
      onClose();
    }

    function handleBackdropClick(e: MouseEvent) {
      if (e.target === dialog) {
        dialogRef.current?.close();
      }
    }

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="request-help-title"
      className="glass m-0 mt-auto w-full max-w-lg rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />

      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="request-help-title" className="text-[17px] font-semibold text-ink">
          Pedir ayuda
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-ink-soft dark:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="max-h-[min(82dvh,720px)] space-y-4 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <input type="hidden" name="lat" value={lat} />
        <input type="hidden" name="lng" value={lng} />

        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            ¿Qué necesitas?
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={120}
            placeholder="Ej: Agua y cobijas"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL_CLASS}>
            Detalles (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={400}
            rows={3}
            placeholder="Ej: 12 personas, sin agua desde anoche, acceso por la 15"
            className={cn(FIELD_CLASS, "resize-none")}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>Tipo de necesidad</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[12px] leading-tight font-medium transition",
                  category === key
                    ? "bg-carmine/90 text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                <span aria-hidden="true" className="shrink-0">
                  {CATEGORY_EMOJI[key]}
                </span>
                <span className="line-clamp-2 min-w-0">{CATEGORY_LABELS[key]}</span>
              </button>
            ))}
          </div>
          {CATEGORY_DESCRIPTIONS[category] && (
            <p className="mt-1.5 text-xs text-ink-soft">{CATEGORY_DESCRIPTIONS[category]}</p>
          )}
        </div>

        <div>
          <span className={LABEL_CLASS}>¿Dónde estás?</span>
          <input type="hidden" name="location_name" value={locationName} />

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoStatus === "loading"}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[13px] font-medium transition disabled:opacity-60",
                hasExactLocation && !mapOpen
                  ? "bg-carmine/90 text-white"
                  : "bg-black/5 text-ink dark:bg-white/10"
              )}
            >
              {geoStatus === "loading" && !mapOpen ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasExactLocation ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              Usar mi ubicación
            </button>
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[13px] font-medium transition",
                mapOpen ? "bg-carmine/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
              )}
            >
              <MapPin className="h-4 w-4" />
              Elegir en el mapa
            </button>
          </div>

          {mapOpen && (
            <div className="mt-2">
              <LocationPickerMap
                lat={lat ? Number(lat) : null}
                lng={lng ? Number(lng) : null}
                onPick={applyCoords}
              />
              {hasExactLocation && (
                <p className="mt-1.5 text-xs text-ink-soft">
                  Arrastra el pin para dejar el punto exacto.
                </p>
              )}
            </div>
          )}

          {hasExactLocation && locationName && (
            <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-forest/10 px-3 py-2 text-[13px] font-medium text-forest">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{locationName}</span>
            </p>
          )}

          {geoStatus === "error" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-carmine">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No pudimos usar el GPS. Marca el punto en el mapa.
            </p>
          )}

          {!hasExactLocation && geoStatus === "idle" && (
            <p className="mt-1.5 text-xs text-ink-soft">
              Debes marcar un punto exacto. Sin ubicación no se puede enviar.
            </p>
          )}

          <div className="mt-2 flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
            {MUNICIPALITIES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMunicipality(m)}
                aria-pressed={municipality === m}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-[13px] font-medium transition",
                  municipality === m ? "bg-ink text-paper shadow-sm" : "text-ink-soft"
                )}
              >
                📍 {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>¿Qué tan urgente es?</span>
          <div className="flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
            <button
              type="button"
              onClick={() => setUrgency("critico")}
              aria-pressed={urgency === "critico"}
              className={cn(
                "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
                urgency === "critico" ? "bg-carmine text-white" : "text-ink-soft"
              )}
            >
              🔴 Crítico
            </button>
            <button
              type="button"
              onClick={() => setUrgency("moderado")}
              aria-pressed={urgency === "moderado"}
              className={cn(
                "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
                urgency === "moderado" ? "bg-[var(--moderado)] text-white" : "text-ink-soft"
              )}
            >
              🟡 Moderado
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="contact_phone" className={LABEL_CLASS}>
            Tu WhatsApp / Teléfono
          </label>
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            required
            placeholder="3001234567"
            className={FIELD_CLASS}
          />
        </div>

        <PhotoPicker
          key={photoEpoch}
          id="report-photos"
          label="Fotos (opcional)"
          hint="Una foto del lugar o de lo que necesitas ayuda a quien va a llegar."
          onFilesChange={(next) => {
            photosRef.current = next;
          }}
          onBusyChange={setPhotosBusy}
        />

        {!state.success && state.error && (
          <p className="text-[13px] font-medium text-carmine" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || photosBusy || !hasExactLocation}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-carmine text-base font-semibold text-white transition disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar
        </button>
      </form>
    </dialog>
  );
}
