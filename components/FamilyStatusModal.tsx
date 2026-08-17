"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Search,
  X,
} from "lucide-react";
import {
  getPeopleStatusByIds,
  registerPersonStatus,
  searchPersonStatus,
  updatePersonStatus,
  type ActionResult,
} from "@/app/actions";
import { reverseGeocode } from "@/lib/geocode";
import { cn, formatTimeAgo, googleMapsUrl } from "@/lib/utils";
import { explainPhotoFailure } from "@/lib/photos";
import PhotoPicker from "./PhotoPicker";
import PhotoStrip from "./PhotoStrip";
import CityBanner from "./CityBanner";
import {
  cityById,
  DEFAULT_CITY_ID,
  isRisaraldaMetro,
  municipalityForPin,
  zoneQueryFor,
  type AppCity,
} from "@/lib/regions";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-2xl bg-[#0e0e10] text-xs text-white/70">
      Cargando mapa
    </div>
  ),
});
import {
  MUNICIPALITIES,
  PERSON_STATUS_LABELS,
  maskDocumentId,
  type Municipality,
  type PeopleStatus,
  type PersonStatus,
} from "@/lib/types";

interface FamilyStatusModalProps {
  open: boolean;
  onClose: () => void;
  city?: AppCity;
  onChangeCity?: () => void;
}

type Tab = "buscar" | "estoy_bien";

const initialState: ActionResult<PeopleStatus> = { success: false };

const STATUS_EMOJI: Record<PersonStatus, string> = {
  a_salvo: "🟢",
  necesito_traslado: "🔴",
  sin_conexion: "🟡",
};

const MY_IDS_KEY = "pereiraunida:my-status-ids";

const FIELD_CLASS =
  "w-full rounded-2xl bg-black/5 px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest/30 dark:bg-white/10";
const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-ink-soft";

type GeoStatus = "idle" | "loading" | "success" | "error";

function readMyIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function addMyId(id: string) {
  if (typeof window === "undefined") return;
  const ids = readMyIds();
  if (ids.includes(id)) return;
  try {
    window.localStorage.setItem(MY_IDS_KEY, JSON.stringify([...ids, id]));
  } catch {
    // localStorage puede fallar en modo privado; no es crítico.
  }
}

export default function FamilyStatusModal({
  open,
  onClose,
  city = cityById(DEFAULT_CITY_ID),
  onChangeCity,
}: FamilyStatusModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<Tab>("buscar");

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PeopleStatus[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, startSearch] = useTransition();

  const [municipality, setMunicipality] = useState<Municipality>(() => municipalityForPin(city));
  const [status, setStatus] = useState<PersonStatus>("a_salvo");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locationName, setLocationName] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [mapOpen, setMapOpen] = useState(false);
  const [registeredPerson, setRegisteredPerson] = useState<PeopleStatus | null>(null);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const [photosBusy, setPhotosBusy] = useState(false);
  const locationRef = useRef({ lat, lng, locationName, municipality, status });
  locationRef.current = { lat, lng, locationName, municipality, status };

  useEffect(() => {
    setMunicipality(municipalityForPin(city));
  }, [city]);
  const hasExactLocation = Boolean(lat && lng);
  const photosRef = useRef<File[]>([]);

  const [myRecords, setMyRecords] = useState<PeopleStatus[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isUpdating, startUpdate] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async (_prevState: ActionResult<PeopleStatus>, formData: FormData) => {
      const loc = locationRef.current;
      formData.set("municipality", loc.municipality);
      formData.set("department", city.department);
      formData.set("status", loc.status);
      formData.set("lat", loc.lat);
      formData.set("lng", loc.lng);
      formData.set("neighborhood", loc.locationName || "Ubicación exacta");
      formData.delete("photos");
      for (const file of photosRef.current) {
        formData.append("photos", file);
      }
      try {
        const result = await registerPersonStatus(formData);
        if (result.success && result.data) {
          addMyId(result.data.id);
          setMyRecords((prev) => [result.data!, ...prev]);
          setRegisteredPerson(result.data);
          photosRef.current = [];
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

  // Carga "Mi registro en este teléfono" a partir de los ids guardados en
  // localStorage. Sin autenticación: el dispositivo es el único "dueño".
  useEffect(() => {
    let active = true;
    const ids = readMyIds();
    if (ids.length === 0) return;
    getPeopleStatusByIds(ids).then((data) => {
      if (active) setMyRecords(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const [prevDebouncedQuery, setPrevDebouncedQuery] = useState(debouncedQuery);
  if (debouncedQuery !== prevDebouncedQuery) {
    setPrevDebouncedQuery(debouncedQuery);
    if (!debouncedQuery.trim()) {
      setResults([]);
      setSearched(false);
    }
  }

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) return;
    startSearch(async () => {
      const data = await searchPersonStatus(q, zoneQueryFor(city));
      setResults(data);
      setSearched(true);
    });
  }, [debouncedQuery, city]);

  // people_status ya no tiene policy pública de Realtime (ver "Notas de
  // seguridad" en el README: se cerró para que nadie pueda streamear
  // cédulas/teléfonos crudos por WebSocket). En su lugar, mientras el modal
  // de búsqueda está abierto con una consulta activa, refrescamos con un
  // polling liviano cada 20s reusando la misma búsqueda enmascarada.
  const searchStateRef = useRef({ tab, debouncedQuery, city });
  useEffect(() => {
    searchStateRef.current = { tab, debouncedQuery, city };
  }, [tab, debouncedQuery, city]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => {
      const { tab: currentTab, debouncedQuery: q } = searchStateRef.current;
      const trimmed = q.trim();
      if (currentTab === "buscar" && trimmed) {
        startSearch(async () => {
          const data = await searchPersonStatus(trimmed, zoneQueryFor(searchStateRef.current.city));
          setResults(data);
          setSearched(true);
        });
      }
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();

    function handleClose() {
      onClose();
      setRegisteredPerson(null);
      formRef.current?.reset();
      setMunicipality(municipalityForPin(city));
      setStatus("a_salvo");
      setLat("");
      setLng("");
      setLocationName("");
      setGeoStatus("idle");
      setMapOpen(false);
      setPhotoEpoch((n) => n + 1);
      photosRef.current = [];
      setPhotosBusy(false);
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
        setMunicipality(municipalityForPin(city, geo.municipality));
        locationRef.current = {
          ...locationRef.current,
          locationName: geo.displayName,
          municipality: municipalityForPin(city, geo.municipality),
        };
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

  function handleUpdateStatus(id: string, newStatus: PersonStatus) {
    setUpdatingId(id);
    startUpdate(async () => {
      const result = await updatePersonStatus(id, newStatus);
      if (result.success && result.data) {
        const updated = result.data;
        setMyRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
      }
      setUpdatingId(null);
    });
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="family-status-title"
      className="glass m-0 mt-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] p-0 text-ink sm:m-auto sm:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/25" />

      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <h2 id="family-status-title" className="text-[17px] font-semibold text-ink">
          Familia
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

      <div className="px-4 pb-3">
        <CityBanner city={city} action="familia" onChange={onChangeCity} />
        <div className="mt-3 flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
          <button
            type="button"
            onClick={() => setTab("buscar")}
            aria-pressed={tab === "buscar"}
            className={cn(
              "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
              tab === "buscar" ? "bg-ink text-paper shadow-sm" : "text-ink-soft"
            )}
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={() => setTab("estoy_bien")}
            aria-pressed={tab === "estoy_bien"}
            className={cn(
              "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
              tab === "estoy_bien"
                ? "bg-ink text-paper shadow-sm"
                : "text-ink-soft"
            )}
          >
            Estoy bien
          </button>
        </div>
      </div>

      {tab === "buscar" ? (
        <div className="sheet-scroll max-h-[min(78dvh,680px)] space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-soft"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o número de documento"
              className={cn(FIELD_CLASS, "pl-11")}
            />
          </label>
          <p className="text-[12px] text-ink-soft">
            Si tu familiar subió una foto al decir &ldquo;Estoy bien&rdquo;, la verás aquí para
            reconocerlo.
          </p>

          {isSearching && <p className="text-[13px] font-medium text-ink-soft">Buscando...</p>}

          {!isSearching && searched && results.length === 0 && (
            <p className="rounded-2xl bg-black/5 px-4 py-8 text-center text-[13px] font-medium text-ink-soft dark:bg-white/5">
              No encontramos a esa persona todavía.
            </p>
          )}

          <div className="space-y-2">
            {results.map((person) => (
              <div key={person.id} className="glass rounded-[18px] p-3.5">
                <div className="flex items-start gap-3">
                  {person.photo_urls?.[0] ? (
                    <a
                      href={person.photo_urls[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto de usuario en CDN */}
                      <img
                        src={person.photo_urls[0]}
                        alt={person.full_name}
                        className="h-14 w-14 rounded-2xl object-cover"
                      />
                    </a>
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/5 text-base dark:bg-white/10">
                      {STATUS_EMOJI[person.status]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{person.full_name}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-soft">
                      {PERSON_STATUS_LABELS[person.status]} · {person.municipality} ·{" "}
                      {person.neighborhood}
                    </p>
                    {person.document_id ? (
                      <p className="text-xs text-ink-soft">
                        Cédula {maskDocumentId(person.document_id)}
                      </p>
                    ) : null}
                    <p className="text-xs text-ink-soft" suppressHydrationWarning>
                      {formatTimeAgo(person.created_at)}
                    </p>
                  </div>
                </div>
                {person.photo_urls && person.photo_urls.length > 1 ? (
                  <PhotoStrip urls={person.photo_urls.slice(1)} alt={person.full_name} />
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={`tel:${person.contact_number}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3.5 py-2 text-[13px] font-medium text-ink dark:bg-white/10"
                  >
                    <Phone className="h-3.5 w-3.5" /> Llamar {person.contact_number}
                  </a>
                  {googleMapsUrl(person.lat, person.lng) ? (
                    <a
                      href={googleMapsUrl(person.lat, person.lng)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3.5 py-2 text-[13px] font-medium text-ink dark:bg-white/10"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Cómo llegar
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sheet-scroll max-h-[min(78dvh,680px)] space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {myRecords.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink-soft">Mi registro en este teléfono</p>
              {myRecords.map((record) => (
                <div key={record.id} className="glass rounded-[18px] p-3">
                  <div className="flex items-start gap-3">
                    {record.photo_urls?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto de usuario en CDN
                      <img
                        src={record.photo_urls[0]}
                        alt={record.full_name}
                        className="h-12 w-12 shrink-0 rounded-2xl object-cover"
                      />
                    ) : (
                      <span className="text-base">{STATUS_EMOJI[record.status]}</span>
                    )}
                    <div className="min-w-0">
                      <span className="text-[15px] font-semibold text-ink">{record.full_name}</span>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {PERSON_STATUS_LABELS[record.status]} · {record.municipality} ·{" "}
                        {record.neighborhood}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Object.keys(PERSON_STATUS_LABELS) as PersonStatus[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={isUpdating && updatingId === record.id}
                        onClick={() => handleUpdateStatus(record.id, value)}
                        aria-pressed={record.status === value}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60",
                          record.status === value
                            ? "bg-ink text-paper"
                            : "bg-black/5 text-ink-soft dark:bg-white/10"
                        )}
                      >
                        {isUpdating && updatingId === record.id && record.status !== value ? (
                          <Loader2 className="inline h-3 w-3 animate-spin" />
                        ) : (
                          `${STATUS_EMOJI[value]} ${PERSON_STATUS_LABELS[value]}`
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {registeredPerson ? (
            <div className="space-y-2 py-2 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-forest" aria-hidden="true" />
              <p className="text-[17px] font-semibold text-ink">{registeredPerson.full_name}</p>
              {registeredPerson.photo_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- foto de usuario en CDN
                <img
                  src={registeredPerson.photo_urls[0]}
                  alt={registeredPerson.full_name}
                  className="mx-auto h-20 w-20 rounded-2xl object-cover"
                />
              ) : null}
              <p className="text-[13px] font-medium text-forest">
                {STATUS_EMOJI[registeredPerson.status]}{" "}
                {PERSON_STATUS_LABELS[registeredPerson.status]}
              </p>
              <p className="text-[13px] text-ink-soft">
                Tu familia puede buscarte por nombre o cédula en la pestaña &ldquo;Buscar&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-forest text-[15px] font-semibold text-white"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <form ref={formRef} action={formAction} className="space-y-4">
              <div>
                <label htmlFor="full_name" className={LABEL_CLASS}>
                  Tu nombre completo
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="Ej: María Fernanda Gómez"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor="document_id" className={LABEL_CLASS}>
                  Cédula (opcional, ayuda a que te encuentren)
                </label>
                <input
                  id="document_id"
                  name="document_id"
                  type="text"
                  inputMode="numeric"
                  maxLength={20}
                  placeholder="Ej: 1088123456"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <span className={LABEL_CLASS}>¿Dónde estás?</span>
                <input type="hidden" name="lat" value={lat} />
                <input type="hidden" name="lng" value={lng} />
                <input type="hidden" name="neighborhood" value={locationName} />

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={geoStatus === "loading"}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[13px] font-medium transition disabled:opacity-60",
                      hasExactLocation && !mapOpen
                        ? "bg-forest text-white"
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
                      mapOpen ? "bg-forest text-white" : "bg-black/5 text-ink dark:bg-white/10"
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
                    Debes marcar un punto exacto. Sin ubicación no se puede registrar.
                  </p>
                )}

                {isRisaraldaMetro(city) ? (
                  <div className="mt-2 flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
                    {MUNICIPALITIES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMunicipality(m)}
                        aria-pressed={municipality === m}
                        className={cn(
                          "flex-1 rounded-full py-1.5 text-[13px] font-medium transition",
                          municipality === m
                            ? "bg-ink text-paper shadow-sm"
                            : "text-ink-soft"
                        )}
                      >
                        📍 {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] font-medium text-ink-soft">Ciudad: {city.name}</p>
                )}
              </div>

              <div>
                <span className={LABEL_CLASS}>¿Cómo estás?</span>
                <div className="grid grid-cols-1 gap-1.5">
                  <StatusButton
                    value="a_salvo"
                    current={status}
                    onSelect={setStatus}
                    emoji="🟢"
                    label="A salvo"
                  />
                  <StatusButton
                    value="necesito_traslado"
                    current={status}
                    onSelect={setStatus}
                    emoji="🔴"
                    label="Necesito traslado"
                  />
                  <StatusButton
                    value="sin_conexion"
                    current={status}
                    onSelect={setStatus}
                    emoji="🟡"
                    label="Sin conexión"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact_number" className={LABEL_CLASS}>
                  Tu teléfono
                </label>
                <input
                  id="contact_number"
                  name="contact_number"
                  type="tel"
                  required
                  placeholder="3001234567"
                  className={FIELD_CLASS}
                />
              </div>

              <PhotoPicker
                key={photoEpoch}
                id="family-photos"
                label="Foto tuya (opcional)"
                hint="Ayuda a que tu familia te reconozca al buscarte."
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
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-forest text-base font-semibold text-white transition disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar mi estado
              </button>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}

interface StatusButtonProps {
  value: PersonStatus;
  current: PersonStatus;
  onSelect: (v: PersonStatus) => void;
  emoji: string;
  label: string;
}

function StatusButton({ value, current, onSelect, emoji, label }: StatusButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={current === value}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium transition",
        current === value ? "bg-ink text-paper" : "bg-black/5 text-ink dark:bg-white/10"
      )}
    >
      <span>{emoji}</span> {label}
    </button>
  );
}
