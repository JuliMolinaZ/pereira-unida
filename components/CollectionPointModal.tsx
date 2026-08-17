"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { createCollectionPoint, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { explainPhotoFailure, MAX_ACOPIO_PHOTOS } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { ACOPIO_SUPPLY_OPTIONS, type CollectionPoint, type Municipality } from "@/lib/types";
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

interface CollectionPointModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (point: CollectionPoint) => void;
  city?: AppCity;
  onChangeCity?: () => void;
}

const initialState: ActionResult<CollectionPoint> = { success: false };
const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

function toggleChip(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function CollectionPointModal({
  open,
  onClose,
  onCreated,
  city = cityById(DEFAULT_CITY_ID),
  onChangeCity,
}: CollectionPointModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>(() => municipalityForPin(city));
  const [needed, setNeeded] = useState<string[]>([]);
  const [surplus, setSurplus] = useState<string[]>([]);
  const [extraNeeded, setExtraNeeded] = useState("");
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
    setLat("");
    setLng("");
    setAddress("");
    setMunicipality(municipalityForPin(city));
    setNeeded([]);
    setSurplus([]);
    setExtraNeeded("");
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
    async (_prevState: ActionResult<CollectionPoint>, formData: FormData) => {
      const loc = locationRef.current;
      formData.set("lat", loc.lat);
      formData.set("lng", loc.lng);
      formData.set("address", loc.address);
      formData.set("municipality", loc.municipality);
      formData.set("department", city.department);
      formData.set("supplies_needed", [needed.join(", "), extraNeeded].filter(Boolean).join(", "));
      formData.set("supplies_surplus", surplus.join(", "));
      formData.set("turnstile_token", turnstileToken);
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      try {
        const result = await createCollectionPoint(formData);
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
      aria-labelledby="acopio-form-title"
      className="glass m-0 mt-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="acopio-form-title" className="text-[17px] font-semibold text-ink">
          Publicar centro de acopio
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
        <CityBanner city={city} action="acopio" onChange={onChangeCity} />
        <p className="text-[13px] leading-snug text-ink-soft">
          Lo ven las personas de {city.name} que quieren donar. Marca el punto, di qué hace falta y deja un WhatsApp.
        </p>

        <div>
          <label htmlFor="acopio-public-name" className={LABEL_CLASS}>
            Nombre del centro
          </label>
          <input
            id="acopio-public-name"
            name="name"
            type="text"
            required
            maxLength={160}
            placeholder="Ej: Salón comunal Los Alcázares"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="acopio-public-description" className={LABEL_CLASS}>
            Qué reciben y cómo llegar (opcional)
          </label>
          <textarea
            id="acopio-public-description"
            name="description"
            maxLength={500}
            rows={3}
            placeholder="Ej: Recibimos mercados y aseo. Entrada por la cancha, de 8 a 6."
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
                  ? "bg-forest/90 text-white"
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
                mapOpen ? "bg-forest/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
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
                Toca o arrastra el pin hasta la entrada del centro.
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
          <label htmlFor="acopio-public-address" className={LABEL_CLASS}>
            Dirección *
          </label>
          <input
            id="acopio-public-address"
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
          <span className={LABEL_CLASS}>Qué les falta</span>
          <div className="flex flex-wrap gap-1.5">
            {ACOPIO_SUPPLY_OPTIONS.map((item) => {
              const on = needed.includes(item);
              return (
                <button
                  key={`need-${item}`}
                  type="button"
                  onClick={() => setNeeded(toggleChip(needed, item))}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
                    on
                      ? "bg-carmine/90 text-white"
                      : "bg-black/5 text-ink dark:bg-white/10"
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>Qué les sobra (para no mandar de más)</span>
          <div className="flex flex-wrap gap-1.5">
            {ACOPIO_SUPPLY_OPTIONS.map((item) => {
              const on = surplus.includes(item);
              return (
                <button
                  key={`surplus-${item}`}
                  type="button"
                  onClick={() => setSurplus(toggleChip(surplus, item))}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
                    on
                      ? "bg-forest/90 text-white"
                      : "bg-black/5 text-ink dark:bg-white/10"
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="acopio-public-extra" className={LABEL_CLASS}>
            Otro que falte (opcional)
          </label>
          <input
            id="acopio-public-extra"
            type="text"
            maxLength={120}
            value={extraNeeded}
            onChange={(e) => setExtraNeeded(e.target.value)}
            placeholder="Ej: Juguetes, kits escolares"
            className={FIELD_CLASS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acopio-public-hours" className={LABEL_CLASS}>
              Horario
            </label>
            <input
              id="acopio-public-hours"
              name="open_hours"
              type="text"
              maxLength={80}
              placeholder="8:00 am - 6:00 pm"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="acopio-public-contact" className={LABEL_CLASS}>
              WhatsApp *
            </label>
            <input
              id="acopio-public-contact"
              name="contact"
              type="tel"
              required
              inputMode="tel"
              maxLength={40}
              placeholder="3001234567"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <PhotoPicker
          key={photoEpoch}
          id="acopio-photos"
          label="Fotos del centro"
          hint="Fachada, donaciones o el aviso. Hasta 5."
          max={MAX_ACOPIO_PHOTOS}
          onFilesChange={(files) => {
            photosRef.current = files;
          }}
          onBusyChange={setPhotosBusy}
        />

        <TurnstileWidget
          action="create_acopio"
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
            !hasExactLocation ||
            (TURNSTILE_ENABLED && !turnstileToken)
          }
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-forest text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {isPending || photosBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publicar centro de acopio
        </button>
      </form>
    </dialog>
  );
}
