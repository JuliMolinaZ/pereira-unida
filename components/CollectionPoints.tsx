"use client";

import dynamic from "next/dynamic";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Package,
  Phone,
} from "lucide-react";
import { createCollectionPoint, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { cn, googleMapsUrl } from "@/lib/utils";
import { MUNICIPALITIES, type CollectionPoint, type Municipality } from "@/lib/types";
import { isRisaraldaMetro, type AppCity } from "@/lib/regions";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-52 w-full animate-pulse rounded-2xl bg-black/5" />,
});

interface CollectionPointsProps {
  points: CollectionPoint[];
  city?: AppCity;
}

type MunicipalityFilter = "todos" | Municipality;

/** Detecta si un contacto tiene forma de teléfono (para usar href="tel:").
 * Seeds/altas manuales pueden traer texto libre como "Confirmar con la
 * alcaldía" — eso se muestra como texto plano, no como enlace de llamada. */
const PHONE_LIKE_RE = /^[+\d][\d\s()-]{5,}$/;

function isPhoneLike(contact: string): boolean {
  return PHONE_LIKE_RE.test(contact.trim());
}

const MUNICIPALITY_FILTERS: { key: MunicipalityFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "Pereira", label: "Pereira" },
  { key: "Dosquebradas", label: "Dosquebradas" },
];

const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1 block text-[12px] font-medium text-ink-soft";

export default function CollectionPoints({ points, city }: CollectionPointsProps) {
  const [allPoints, setAllPoints] = useState<CollectionPoint[]>(points);
  const [prevPoints, setPrevPoints] = useState(points);
  const [municipality, setMunicipality] = useState<MunicipalityFilter>("todos");

  if (points !== prevPoints) {
    setPrevPoints(points);
    setAllPoints(points);
  }

  const filteredPoints = useMemo(
    () =>
      municipality === "todos"
        ? allPoints
        : allPoints.filter((p) => p.municipality === municipality),
    [allPoints, municipality]
  );

  return (
    <div>
      {!city || isRisaraldaMetro(city) ? (
        <div className="mb-2 flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10"
            role="group"
            aria-label="Filtrar por municipio"
          >
            {MUNICIPALITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setMunicipality(f.key)}
                aria-pressed={municipality === f.key}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-[13px] font-medium transition",
                  municipality === f.key
                    ? "bg-ink text-paper shadow-sm"
                    : "text-ink-soft"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-2 text-[13px] font-medium text-ink-soft">Acopio en {city.name}</p>
      )}

      {filteredPoints.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {allPoints.length === 0
              ? "Aún no hay centros de acopio oficiales registrados."
              : "No hay centros de acopio para este municipio todavía."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPoints.map((point) => (
            <article key={point.id} className="glass overflow-hidden rounded-[22px] p-3">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
                <p className="text-[12px] font-medium text-ink-soft">Punto de acopio</p>
                <span className="ml-auto rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft dark:bg-white/10">
                  {point.municipality}
                </span>
              </div>
              <h3 className="mt-0.5 line-clamp-2 text-[17px] leading-snug font-semibold text-ink">
                {point.name}
              </h3>

              <p className="mt-1 flex items-center gap-1 text-[13px] text-ink-soft">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{point.address}</span>
              </p>

              {point.open_hours ? (
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-soft">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">{point.open_hours}</span>
                </p>
              ) : null}

              {point.supplies_needed.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {point.supplies_needed.map((supply) => (
                    <span
                      key={supply}
                      className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-ink-soft dark:bg-white/10"
                    >
                      {supply}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-2">
                {googleMapsUrl(point.lat, point.lng) ? (
                  <a
                    href={googleMapsUrl(point.lat, point.lng) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    Cómo llegar
                  </a>
                ) : null}
                {point.contact && isPhoneLike(point.contact) ? (
                  <a
                    href={`tel:${point.contact.replace(/\s+/g, "")}`}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {point.contact}
                  </a>
                ) : null}
                {point.contact && !isPhoneLike(point.contact) ? (
                  <span className="flex items-center gap-1.5 px-1 text-[13px] text-ink-soft">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {point.contact}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

interface CreatePointFormProps {
  onCreated: (point: CollectionPoint) => void;
  onCancel?: () => void;
  accessKey: string;
}

const initialState: ActionResult<CollectionPoint> = { success: false };

export function CreatePointForm({ onCreated, onCancel, accessKey }: CreatePointFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>("Pereira");
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mapOpen, setMapOpen] = useState(true);
  const hasExactLocation = Boolean(lat && lng);

  async function applyCoords(latitude: number, longitude: number) {
    const exactLat = latitude.toFixed(7);
    const exactLng = longitude.toFixed(7);
    setLat(exactLat);
    setLng(exactLng);
    setAddress((prev) => prev || "Ubicación exacta");
    setGeoStatus("loading");
    try {
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        setAddress(geo.displayName);
        setMunicipality(geo.municipality);
      } else {
        setAddress((prev) => prev || "Ubicación exacta");
      }
      setGeoStatus("success");
    } catch {
      setAddress((prev) => prev || "Ubicación exacta");
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
      formData.set("lat", lat);
      formData.set("lng", lng);
      formData.set("address", address);
      formData.set("municipality", municipality);
      formData.set("pin", accessKey);
      const result = await createCollectionPoint(formData);
      if (result.success && result.data) {
        onCreated(result.data);
        formRef.current?.reset();
        setLat("");
        setLng("");
        setAddress("");
        setGeoStatus("idle");
      }
      return result;
    },
    initialState
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="acopio-name" className={LABEL_CLASS}>
          Nombre *
        </label>
        <input
          id="acopio-name"
          name="name"
          type="text"
          required
          maxLength={160}
          placeholder="Ej: CAFE Consota"
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
            <p className="mt-1.5 text-xs text-ink-soft">
              Toca o arrastra el pin hasta el punto exacto.
            </p>
          </div>
        )}
        {hasExactLocation && address && (
          <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-forest/10 px-3 py-2 text-[13px] font-medium text-forest">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{address}</span>
          </p>
        )}
        {geoStatus === "error" && (
          <p className="mt-1.5 text-[12px] font-medium text-carmine">
            No pude leer el GPS. Elige el punto en el mapa.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="acopio-address" className={LABEL_CLASS}>
          Dirección *
        </label>
        <input
          id="acopio-address"
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
        <label htmlFor="acopio-supplies" className={LABEL_CLASS}>
          Insumos que necesita (separados por coma)
        </label>
        <input
          id="acopio-supplies"
          name="supplies_needed"
          type="text"
          maxLength={300}
          placeholder="Agua embotellada, Kits de aseo, Cobijas"
          className={FIELD_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="acopio-hours" className={LABEL_CLASS}>
            Horario
          </label>
          <input
            id="acopio-hours"
            name="open_hours"
            type="text"
            maxLength={80}
            placeholder="7:00 am - 7:00 pm"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="acopio-contact" className={LABEL_CLASS}>
            Contacto
          </label>
          <input
            id="acopio-contact"
            name="contact"
            type="text"
            maxLength={40}
            placeholder="3001234567"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <input type="hidden" name="pin" value={accessKey} />

      {!state.success && state.error && (
        <p className="text-[12px] font-medium text-carmine">{state.error}</p>
      )}

      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full bg-black/5 py-2.5 text-[14px] font-medium text-ink dark:bg-white/10"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isPending || !hasExactLocation}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-forest py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Publicar punto
        </button>
      </div>
    </form>
  );
}
