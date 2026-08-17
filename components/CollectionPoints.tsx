"use client";

import dynamic from "next/dynamic";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Pencil,
  Phone,
  Share2,
} from "lucide-react";
import { createCollectionPoint, updateCollectionPointBalance, type ActionResult } from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { MAX_ACOPIO_PHOTOS } from "@/lib/photos";
import {
  cn,
  googleMapsUrl,
  listShareUrl,
  readMyAcopioIds,
  shareToWhatsAppAcopio,
} from "@/lib/utils";
import {
  ACOPIO_SUPPLY_OPTIONS,
  type CollectionPoint,
  type ExternalCentro,
  type Municipality,
} from "@/lib/types";
import { isRisaraldaMetro, type AppCity } from "@/lib/regions-core";
import FuenteBadge from "./FuenteBadge";
import PhotoStrip from "./PhotoStrip";
import PhotoPicker from "./PhotoPicker";
import ExpandableText from "./ExpandableText";
import ShareButton from "./ShareButton";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-52 w-full animate-pulse rounded-2xl bg-black/5" />,
});

interface CollectionPointsProps {
  points: CollectionPoint[];
  externalCentros?: ExternalCentro[];
  city?: AppCity;
  onPublish?: () => void;
  showCtas?: boolean;
}

function toggleChip(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function isCatalogSupply(item: string): boolean {
  return (ACOPIO_SUPPLY_OPTIONS as readonly string[]).includes(item);
}

function SupplyChipRow({
  selected,
  onToggle,
  activeClass,
}: {
  selected: string[];
  onToggle: (item: string) => void;
  activeClass: string;
}) {
  const extras = selected.filter((item) => !isCatalogSupply(item));
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...ACOPIO_SUPPLY_OPTIONS, ...extras].map((item) => {
        const on = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            aria-pressed={on}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
              on ? activeClass : "bg-black/5 text-ink dark:bg-white/10"
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
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

export default function CollectionPoints({
  points,
  externalCentros = [],
  city,
  onPublish,
  showCtas = true,
}: CollectionPointsProps) {
  const [allPoints, setAllPoints] = useState<CollectionPoint[]>(points);
  const [prevPoints, setPrevPoints] = useState(points);
  const [municipality, setMunicipality] = useState<MunicipalityFilter>("todos");
  const myIds = useMemo(() => new Set(readMyAcopioIds()), [allPoints]);

  if (points !== prevPoints) {
    setPrevPoints(points);
    setAllPoints(points);
  }

  function handlePointUpdated(updated: CollectionPoint) {
    setAllPoints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  const filteredPoints = useMemo(
    () =>
      municipality === "todos"
        ? allPoints
        : allPoints.filter((p) => p.municipality === municipality),
    [allPoints, municipality]
  );

  const filteredExternalCentros = useMemo(
    () =>
      municipality === "todos"
        ? externalCentros
        : externalCentros.filter((c) => c.municipality === municipality),
    [externalCentros, municipality]
  );

  return (
    <div>
      {showCtas && onPublish ? (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onPublish}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-forest/90 text-[13px] font-semibold text-white"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            {city?.name ? `Publicar acopio en ${city.name}` : "Publicar centro de acopio"}
          </button>
          <ShareButton
            title="Centros de acopio en Pereira Unida"
            text={
              city?.name
                ? `Mira los centros de acopio en ${city.name} en Pereira Unida.`
                : "Mira los centros de acopio en Pereira Unida."
            }
            url={listShareUrl("puntos_acopio", city?.id)}
            label="Compartir la lista de centros de acopio"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-forest dark:bg-white/10"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </ShareButton>
        </div>
      ) : null}

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

      {filteredPoints.length === 0 && filteredExternalCentros.length === 0 ? (
        <div className="mt-2 rounded-[22px] bg-black/5 px-4 py-8 text-center dark:bg-white/5">
          <p className="text-[15px] font-medium text-ink-soft">
            {allPoints.length === 0 && externalCentros.length === 0
              ? "Aún no hay centros de acopio en esta zona. Si estás organizando uno, publícalo."
              : "No hay centros de acopio para este municipio todavía."}
          </p>
          {showCtas && onPublish ? (
            <button
              type="button"
              onClick={onPublish}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-forest/90 px-4 text-[13px] font-semibold text-white"
            >
              Publicar el primero
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExternalCentros.map((centro) => (
            <article key={centro.id} className="glass overflow-hidden rounded-[22px] p-3">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
                <p className="text-[12px] font-medium text-ink-soft">Punto de acopio</p>
                <div className="ml-auto flex items-center gap-1.5">
                  {!centro.abierto ? (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                      Cerrado
                    </span>
                  ) : null}
                  <FuenteBadge fuente={centro.fuente} />
                </div>
              </div>
              <h3 className="mt-0.5 line-clamp-2 text-[17px] leading-snug font-semibold text-ink">
                {centro.nombre}
              </h3>

              {centro.direccion ? (
                <p className="mt-1 flex items-center gap-1 text-[13px] text-ink-soft">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">{centro.direccion}</span>
                </p>
              ) : null}

              {centro.necesidades.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {centro.necesidades.slice(0, 6).map((n, i) => (
                    <span
                      key={`${centro.id}-${i}`}
                      className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-ink-soft dark:bg-white/10"
                    >
                      {n.categoria}
                    </span>
                  ))}
                </div>
              ) : null}

              {googleMapsUrl(centro.lat, centro.lng) ? (
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={googleMapsUrl(centro.lat, centro.lng) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    Cómo llegar
                  </a>
                </div>
              ) : null}
            </article>
          ))}
          {filteredPoints.map((point) => (
            <article key={point.id} className="glass overflow-hidden rounded-[22px] p-3">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
                <p className="text-[12px] font-medium text-ink-soft">Punto de acopio</p>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft dark:bg-white/10">
                    {point.municipality}
                  </span>
                  <FuenteBadge fuente="pereira_unida" />
                </div>
              </div>
              <h3 className="mt-0.5 line-clamp-2 text-[17px] leading-snug font-semibold text-ink">
                {point.name}
              </h3>

              <PhotoStrip urls={point.photo_urls} alt={point.name} />

              {point.description ? (
                <ExpandableText
                  text={point.description}
                  className="mt-1.5 text-[13px] leading-snug whitespace-pre-wrap break-words text-ink-soft"
                />
              ) : null}

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

              {point.supplies_needed.length > 0 || (point.supplies_surplus ?? []).length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {point.supplies_needed.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-carmine">Falta:</span>
                      {point.supplies_needed.map((supply) => (
                        <span
                          key={supply}
                          className="rounded-full bg-carmine/10 px-2.5 py-1 text-[11px] font-medium text-carmine"
                        >
                          {supply}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {(point.supplies_surplus ?? []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-forest">Sobra:</span>
                      {point.supplies_surplus.map((supply) => (
                        <span
                          key={supply}
                          className="rounded-full bg-forest/10 px-2.5 py-1 text-[11px] font-medium text-forest"
                        >
                          {supply}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <BalanceEditor
                point={point}
                mine={myIds.has(point.id)}
                onUpdated={handlePointUpdated}
              />

              <div className="mt-2 flex items-center gap-2">
                {isPhoneLike(point.contact) ? (
                  <a
                    href={shareToWhatsAppAcopio(point)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--whatsapp)] px-3 text-[13px] font-semibold text-white"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    WhatsApp
                  </a>
                ) : null}
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
                    aria-label={`Llamar a ${point.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
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

/**
 * Toggle inline para actualizar qué le falta/sobra. En centros propios
 * (publicados desde este celular) se abre sin PIN. En los demás pide el
 * PIN de organizadores si alguien lo tiene, o se puede dejar vacío en
 * el wiki de emergencia.
 */
function BalanceEditor({
  point,
  mine,
  onUpdated,
}: {
  point: CollectionPoint;
  mine: boolean;
  onUpdated: (point: CollectionPoint) => void;
}) {
  const [open, setOpen] = useState(false);
  const [needed, setNeeded] = useState<string[]>(point.supplies_needed);
  const [surplus, setSurplus] = useState<string[]>(point.supplies_surplus ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setNeeded(point.supplies_needed);
          setSurplus(point.supplies_surplus ?? []);
          setError(null);
          setOpen(true);
        }}
        className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-ink-soft"
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        {mine ? "Actualizar falta/sobra" : "¿Estás en el centro? Actualiza falta/sobra"}
      </button>
    );
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateCollectionPointBalance(point.id, "", needed, surplus);
    setPending(false);
    if (result.success && result.data) {
      onUpdated(result.data);
      setOpen(false);
    } else {
      setError(result.error ?? "No se pudo actualizar.");
    }
  }

  return (
    <div className="mt-1.5 space-y-2 rounded-2xl bg-black/5 p-2.5 dark:bg-white/10">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-carmine">Falta</p>
        <SupplyChipRow
          selected={needed}
          onToggle={(item) => setNeeded(toggleChip(needed, item))}
          activeClass="bg-carmine/90 text-white"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold text-forest">Sobra</p>
        <SupplyChipRow
          selected={surplus}
          onToggle={(item) => setSurplus(toggleChip(surplus, item))}
          activeClass="bg-forest/90 text-white"
        />
      </div>
      {error ? <p className="text-[11px] font-medium text-carmine">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-full bg-black/5 py-1.5 text-[12px] font-medium text-ink dark:bg-white/10"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-forest py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
        </button>
      </div>
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
  const photosRef = useRef<File[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [municipality, setMunicipality] = useState<Municipality>("Pereira");
  const [needed, setNeeded] = useState<string[]>([]);
  const [surplus, setSurplus] = useState<string[]>([]);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mapOpen, setMapOpen] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const [photosBusy, setPhotosBusy] = useState(false);
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
      formData.set("supplies_needed", needed.join(", "));
      formData.set("supplies_surplus", surplus.join(", "));
      formData.set("pin", accessKey);
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      const result = await createCollectionPoint(formData);
      if (result.success && result.data) {
        onCreated(result.data);
        formRef.current?.reset();
        setLat("");
        setLng("");
        setAddress("");
        setNeeded([]);
        setSurplus([]);
        setGeoStatus("idle");
        setPhotoEpoch((n) => n + 1);
        photosRef.current = [];
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
        <label htmlFor="acopio-description" className={LABEL_CLASS}>
          Qué reciben y cómo llegar (opcional)
        </label>
        <textarea
          id="acopio-description"
          name="description"
          maxLength={500}
          rows={3}
          placeholder="Ej: Recibimos mercados y aseo. Entrada por la cancha."
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
        <span className={LABEL_CLASS}>Qué le falta</span>
        <div className="flex flex-wrap gap-1.5">
          {ACOPIO_SUPPLY_OPTIONS.map((item) => {
            const on = needed.includes(item);
            return (
              <button
                key={`admin-need-${item}`}
                type="button"
                onClick={() => setNeeded(toggleChip(needed, item))}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium",
                  on ? "bg-carmine/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={LABEL_CLASS}>Qué le sobra</span>
        <div className="flex flex-wrap gap-1.5">
          {ACOPIO_SUPPLY_OPTIONS.map((item) => {
            const on = surplus.includes(item);
            return (
              <button
                key={`admin-surplus-${item}`}
                type="button"
                onClick={() => setSurplus(toggleChip(surplus, item))}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium",
                  on ? "bg-forest/90 text-white" : "bg-black/5 text-ink dark:bg-white/10"
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
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
            WhatsApp *
          </label>
          <input
            id="acopio-contact"
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
        id="acopio-admin-photos"
        label="Fotos del centro"
        hint="Fachada, donaciones o el aviso. Hasta 5."
        max={MAX_ACOPIO_PHOTOS}
        onFilesChange={(files) => {
          photosRef.current = files;
        }}
        onBusyChange={setPhotosBusy}
      />

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
          disabled={isPending || photosBusy || !hasExactLocation}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-forest py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Publicar punto
        </button>
      </div>
    </form>
  );
}
