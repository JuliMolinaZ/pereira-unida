"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { createServiceOutage, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { explainPhotoFailure, MAX_OUTAGE_PHOTOS } from "@/lib/photos";
import { cn } from "@/lib/utils";
import {
  SERVICE_KIND_EMOJI,
  SERVICE_KIND_LABELS,
  SERVICE_KINDS,
  SERVICE_SEVERITIES,
  SERVICE_SEVERITY_COLORS,
  SERVICE_SEVERITY_EMOJI,
  SERVICE_SEVERITY_LABELS,
  type Municipality,
  type ServiceKind,
  type ServiceOutage,
  type ServiceOutageSeverity,
} from "@/lib/types";
import {
  cityById,
  DEFAULT_CITY_ID,
  municipalityForPin,
  type AppCity,
} from "@/lib/regions";
import PhotoPicker from "./PhotoPicker";
import CityBanner from "./CityBanner";
import TurnstileWidget from "./TurnstileWidget";

const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-2xl bg-[#0e0e10] text-xs text-white/70">
      Cargando mapa
    </div>
  ),
});

interface ServiceOutageModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (outage: ServiceOutage) => void;
  city?: AppCity;
  onChangeCity?: () => void;
}

const initialState: ActionResult<ServiceOutage> = { success: false };
const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-[#ca8a04]/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

export default function ServiceOutageModal({
  open,
  onClose,
  onCreated,
  city = cityById(DEFAULT_CITY_ID),
  onChangeCity,
}: ServiceOutageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [service, setService] = useState<ServiceKind>("energia");
  const [severity, setSeverity] = useState<ServiceOutageSeverity | "">("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>(() => municipalityForPin(city));
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mapOpen, setMapOpen] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const photosRef = useRef<File[]>([]);
  const locationRef = useRef({ lat, lng, address, municipality });
  locationRef.current = { lat, lng, address, municipality };

  useEffect(() => {
    setMunicipality(municipalityForPin(city));
  }, [city]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      onClose();
    }
    function handleBackdropClick(e: MouseEvent) {
      if (e.target !== dialog) return;
      const rect = dialog!.getBoundingClientRect();
      const insidePanel =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!insidePanel) dialogRef.current?.close();
    }
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [open, onClose]);

  const hasExactLocation = Boolean(lat && lng);

  function resetForm() {
    formRef.current?.reset();
    setService("energia");
    setSeverity("");
    setLat("");
    setLng("");
    setAddress("");
    setMunicipality(municipalityForPin(city));
    setGeoStatus("idle");
    setMapOpen(false);
    setPhotoEpoch((n) => n + 1);
    photosRef.current = [];
    setPhotosBusy(false);
    setTurnstileToken("");
  }

  async function applyCoords(latitude: number, longitude: number) {
    const exactLat = latitude.toFixed(7);
    const exactLng = longitude.toFixed(7);
    setLat(exactLat);
    setLng(exactLng);
    setGeoStatus("loading");
    try {
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        setAddress((prev) => prev || geo.displayName);
        setMunicipality(municipalityForPin(city, geo.municipality));
      }
      setGeoStatus("success");
    } catch {
      setGeoStatus("success");
    }
  }

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

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<ServiceOutage>, formData: FormData) => {
      const loc = locationRef.current;
      formData.set("service", service);
      formData.set("severity", severity);
      formData.set("lat", loc.lat);
      formData.set("lng", loc.lng);
      formData.set("address", loc.address);
      formData.set("municipality", loc.municipality);
      formData.set("department", city.department);
      formData.set("turnstile_token", turnstileToken);
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      try {
        const result = await createServiceOutage(formData);
        if (result.success && result.data) {
          onCreated(result.data);
          resetForm();
          dialogRef.current?.close();
        }
        return result;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return { success: false, error: explainPhotoFailure(raw) };
      }
    },
    initialState
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="outage-form-title"
      className="glass m-0 mt-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="outage-form-title" className="text-[17px] font-semibold text-ink">
          Reportar daño de servicio
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
        className="sheet-scroll min-h-0 flex-1 space-y-4 overscroll-contain px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <CityBanner city={city} action="servicio" onChange={onChangeCity} />
        <p className="text-[13px] leading-snug text-ink-soft">
          Lo ven las cuadrillas de {city.name}: postes, luz, agua, gas e internet. Marca el punto exacto.
        </p>

        <div>
          <span className={LABEL_CLASS}>¿Qué tan grave es? *</span>
          <div className="space-y-1.5">
            {SERVICE_SEVERITIES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSeverity(key)}
                aria-pressed={severity === key}
                className={cn(
                  "flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-[13px] font-medium transition",
                  severity === key
                    ? "text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
                style={
                  severity === key
                    ? { backgroundColor: SERVICE_SEVERITY_COLORS[key] }
                    : undefined
                }
              >
                <span className="text-[18px] leading-none" aria-hidden="true">
                  {SERVICE_SEVERITY_EMOJI[key]}
                </span>
                {SERVICE_SEVERITY_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>¿Qué servicio?</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SERVICE_KINDS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setService(key)}
                aria-pressed={service === key}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[12px] font-medium transition",
                  service === key
                    ? "bg-[#ca8a04]/90 text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                <span aria-hidden="true">{SERVICE_KIND_EMOJI[key]}</span>
                {SERVICE_KIND_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="outage-description" className={LABEL_CLASS}>
            Qué pasó
          </label>
          <textarea
            id="outage-description"
            name="description"
            required
            maxLength={400}
            rows={3}
            placeholder="Ej: Poste caído frente al salón comunal, cables en el piso."
            className={cn(FIELD_CLASS, "resize-none")}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>Ubicación exacta *</span>
          <input type="hidden" name="lat" value={lat} />
          <input type="hidden" name="lng" value={lng} />
          <input type="hidden" name="municipality" value={municipality} />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoStatus === "loading"}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[13px] font-medium transition disabled:opacity-60",
                hasExactLocation && !mapOpen
                  ? "bg-[#ca8a04]/90 text-white"
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
                mapOpen ? "bg-[#ca8a04]/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
              )}
            >
              <MapPin className="h-4 w-4" />
              Elegir en el mapa
            </button>
          </div>
          {mapOpen ? (
            <div className="mt-2">
              <LocationPickerMap
                lat={lat ? Number(lat) : null}
                lng={lng ? Number(lng) : null}
                onPick={applyCoords}
                cityId={city.id}
                cityName={city.name}
                centerLat={city.center[0]}
                centerLng={city.center[1]}
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                Toca o arrastra el pin hasta el poste, la fuga o el transformador.
              </p>
            </div>
          ) : null}
          {hasExactLocation && address ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-forest/10 px-3 py-2 text-[13px] font-medium text-forest">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{address}</span>
            </p>
          ) : null}
          {geoStatus === "error" ? (
            <p className="mt-1.5 text-[12px] font-medium text-carmine">
              No pude leer el GPS. Elige el punto en el mapa.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="outage-address" className={LABEL_CLASS}>
            Dirección o referencia *
          </label>
          <input
            id="outage-address"
            name="address"
            type="text"
            required
            maxLength={200}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Se completa al marcar el mapa"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="outage-contact" className={LABEL_CLASS}>
            WhatsApp (opcional)
          </label>
          <input
            id="outage-contact"
            name="contact"
            type="tel"
            inputMode="tel"
            maxLength={40}
            placeholder="Por si la cuadrilla necesita confirmar"
            className={FIELD_CLASS}
          />
        </div>

        <PhotoPicker
          key={photoEpoch}
          id="outage-photos"
          label="Foto del daño"
          hint="Poste, cables, fuga o medidor. Hasta 3."
          max={MAX_OUTAGE_PHOTOS}
          onFilesChange={(files) => {
            photosRef.current = files;
          }}
          onBusyChange={setPhotosBusy}
        />

        <TurnstileWidget
          action="create_outage"
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
        />

        {state.error ? (
          <p className="text-[13px] font-medium text-carmine" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            isPending ||
            photosBusy ||
            !severity ||
            !hasExactLocation ||
            (TURNSTILE_ENABLED && !turnstileToken)
          }
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ca8a04] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {isPending || photosBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar daño
        </button>
      </form>
    </dialog>
  );
}
