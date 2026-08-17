"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { createRental, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { explainPhotoFailure, MAX_RENTAL_PHOTOS } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { RENTAL_PROPERTY_TYPES, type Municipality, type Rental } from "@/lib/types";
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

interface RentalFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (rental: Rental) => void;
  city?: AppCity;
  onChangeCity?: () => void;
}

const initialState: ActionResult<Rental> = { success: false };
const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-[#1a6b78]/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

export default function RentalFormModal({
  open,
  onClose,
  onCreated,
  city = cityById(DEFAULT_CITY_ID),
  onChangeCity,
}: RentalFormModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>(() => municipalityForPin(city));
  const [propertyType, setPropertyType] = useState<string>("Apartamento");
  const [furnished, setFurnished] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mapOpen, setMapOpen] = useState(true);
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
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      onClose();
    }
    function handleBackdropClick(e: MouseEvent) {
      if (e.target === dialog) dialogRef.current?.close();
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
    setLat("");
    setLng("");
    setAddress("");
    setNeighborhood("");
    setMunicipality(municipalityForPin(city));
    setPropertyType("Apartamento");
    setFurnished(false);
    setGeoStatus("idle");
    setMapOpen(true);
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
    async (_prevState: ActionResult<Rental>, formData: FormData) => {
      const loc = locationRef.current;
      formData.set("lat", loc.lat);
      formData.set("lng", loc.lng);
      formData.set("address", loc.address);
      formData.set("municipality", loc.municipality);
      formData.set("department", city.department);
      formData.set("furnished", furnished ? "si" : "no");
      formData.set("property_type", propertyType);
      formData.set("turnstile_token", turnstileToken);
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      try {
        const result = await createRental(formData);
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
      aria-labelledby="rental-form-title"
      className="glass m-0 mt-auto w-full max-w-lg rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="rental-form-title" className="text-[17px] font-semibold text-ink">
          Publicar arriendo
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
        className="max-h-[min(82dvh,760px)] space-y-4 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <CityBanner city={city} action="arriendo" onChange={onChangeCity} />

        <div>
          <span className={LABEL_CLASS}>Tipo de inmueble</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {RENTAL_PROPERTY_TYPES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPropertyType(key)}
                aria-pressed={propertyType === key}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-2xl px-2 py-2 text-center text-[12px] font-medium transition",
                  propertyType === key
                    ? "bg-[#1a6b78]/90 text-white"
                    : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>¿Está amoblada?</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setFurnished(true)}
              aria-pressed={furnished}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-2xl text-[13px] font-medium",
                furnished ? "bg-[#1a6b78]/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
              )}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => setFurnished(false)}
              aria-pressed={!furnished}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-2xl text-[13px] font-medium",
                !furnished ? "bg-[#1a6b78]/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
              )}
            >
              No
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="rental-neighborhood" className={LABEL_CLASS}>
            Barrio o sector
          </label>
          <input
            id="rental-neighborhood"
            name="neighborhood"
            type="text"
            maxLength={120}
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="Ej: La Palmera"
            className={FIELD_CLASS}
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
                  ? "bg-[#1a6b78]/90 text-white"
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
                mapOpen ? "bg-[#1a6b78]/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
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
                cityId={city.id}
                cityName={city.name}
                centerLat={city.center[0]}
                centerLng={city.center[1]}
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                Toca o arrastra el pin hasta la vivienda.
              </p>
            </div>
          )}
          {geoStatus === "error" && (
            <p className="mt-1.5 text-[12px] font-medium text-carmine">
              No pude leer el GPS. Elige el punto en el mapa.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="rental-address" className={LABEL_CLASS}>
            Dirección o ubicación *
          </label>
          <input
            id="rental-address"
            name="address"
            type="text"
            required
            maxLength={200}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej: Carrera 7 #42-10"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="rental-contact" className={LABEL_CLASS}>
            Teléfono o WhatsApp del propietario *
          </label>
          <input
            id="rental-contact"
            name="contact"
            type="tel"
            required
            maxLength={80}
            placeholder="300 000 0000"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="rental-price" className={LABEL_CLASS}>
            Valor mensual (opcional)
          </label>
          <input
            id="rental-price"
            name="monthly_rent"
            type="text"
            inputMode="numeric"
            maxLength={20}
            placeholder="$600.000 — déjalo vacío si no hay precio"
            className={FIELD_CLASS}
          />
        </div>

        <PhotoPicker
          key={photoEpoch}
          id="rental-photos"
          label="Fotos de la vivienda"
          max={MAX_RENTAL_PHOTOS}
          onFilesChange={(files) => {
            photosRef.current = files;
          }}
          onBusyChange={setPhotosBusy}
        />

        <TurnstileWidget
          action="create_rental"
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
          disabled={isPending || photosBusy || (TURNSTILE_ENABLED && !turnstileToken)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a6b78]/90 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {isPending || photosBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar vivienda
        </button>
      </form>
    </dialog>
  );
}
