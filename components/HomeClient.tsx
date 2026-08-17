"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { AlertTriangle, Loader2, Navigation, X } from "lucide-react";
import { getHomeData, getReports, reopenClosedRoad } from "@/app/actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  cn,
  googleMapsUrl,
  isReportFromLastHours,
  listShareUrl,
  rememberMyOfferId,
  rememberMyRentalId,
} from "@/lib/utils";
import ShareButton from "./ShareButton";
import FuenteBadge from "./FuenteBadge";
import {
  CATEGORY_LABELS,
  CLOSED_ROAD_REASON_LABELS,
  HELP_SKILL_LABELS,
  isClosedStatus,
  MAP_COUNTRY_ZOOM,
  MAP_DEFAULT_ZOOM,
  type ClosedRoad,
  type CollectionPoint,
  type ExternalAfectacion,
  type ExternalAyuda,
  type ExternalCentro,
  type HelpOffer,
  type Rental,
  type Report,
  type ReportCategory,
} from "@/lib/types";
import {
  matchesHaystack,
  isCollectionPointSearch,
  PLACE_COLOR,
  PLACE_EMOJI,
  PLACE_KIND_LABEL,
  type MapPlace,
} from "@/lib/places";
import Header from "./Header";
import BrandMark from "./BrandMark";
import FlagLoader from "./FlagLoader";
import ActionCards from "./ActionCards";
import FilterBar, {
  type CategoryQuickFilter,
  type MunicipalityFilter,
  type TimeWindowFilter,
} from "./FilterBar";
import DenseReportList from "./DenseReportList";
import ReportCardSkeleton from "./ReportCardSkeleton";
import NotificationsPrompt from "./NotificationsPrompt";
import { isInAppBrowser } from "@/lib/device";
import { isCriticalMedicine } from "@/lib/medicine";
import {
  cityById,
  DEFAULT_CITY_ID,
  DEFAULT_DEPARTMENT,
  isDefaultZone,
  isNationwide,
  isRisaraldaMetro,
  placesSearchUrl,
  readCityChosen,
  readSavedCity,
  saveCity,
  saveCityChosen,
  zoneQueryFor,
  type AppCity,
} from "@/lib/regions-core";

const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => <MapBootScreen />,
});
const CollectionPoints = dynamic(() => import("./CollectionPoints"));
const RequestHelpModal = dynamic(() => import("./RequestHelpModal"));
const FamilyStatusModal = dynamic(() => import("./FamilyStatusModal"));
const ClosedRoadModal = dynamic(() => import("./ClosedRoadModal"));
const HelpOfferModal = dynamic(() => import("./HelpOfferModal"));
const HelpOffers = dynamic(() => import("./HelpOffers"));
const Rentals = dynamic(() => import("./Rentals"));
const RentalFormModal = dynamic(() => import("./RentalFormModal"));
const RentalCard = dynamic(() => import("./RentalCard"));
const ReportCard = dynamic(() => import("./ReportCard"));
const RegionPicker = dynamic(() => import("./RegionPicker"));
const ExternalAyudaCard = dynamic(() => import("./ExternalAyudaCard"));
const ExternalAfectacionCard = dynamic(() => import("./ExternalAfectacionCard"));

function MapBootScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0e10]">
      <FlagLoader caption="Cargando mapa" />
    </div>
  );
}

type SheetMode = "map" | "peek" | "expanded";

const SHEET_DRAG_THRESHOLD = 28;

/** Valores válidos para `?vista=` al abrir un link compartido (ver `listShareUrl`). */
const VALID_VISTA_VALUES = new Set<CategoryQuickFilter>([
  "todos",
  "puntos_acopio",
  "vias_cerradas",
  "ofrezco",
  "arriendos",
  "alimentos",
  "herramientas",
  "medicinas",
  "voluntariado",
  "otros",
  "herramientas_rescate",
  "conectividad_energia",
  "mascotas",
  "revision_ingenieria",
  "transporte_logistica",
]);

function isValidVista(value: string | null): value is CategoryQuickFilter {
  return value !== null && VALID_VISTA_VALUES.has(value as CategoryQuickFilter);
}

function sheetHeight(mode: SheetMode): string {
  if (mode === "expanded") return "var(--sheet-expanded)";
  if (mode === "map") return "var(--sheet-map)";
  return "var(--sheet-peek)";
}

function SheetHandle({
  mode,
  count,
  onMap,
  onPeek,
  onExpand,
}: {
  mode: SheetMode;
  count: number;
  onMap: () => void;
  onPeek: () => void;
  onExpand: () => void;
}) {
  const startY = useRef<number | null>(null);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    if (dy < -SHEET_DRAG_THRESHOLD) {
      if (mode === "map") onPeek();
      else onExpand();
      return;
    }
    if (dy > SHEET_DRAG_THRESHOLD) {
      if (mode === "expanded") onPeek();
      else onMap();
      return;
    }
    if (mode === "expanded") onPeek();
    else onExpand();
  }

  function onPointerCancel() {
    startY.current = null;
  }

  const label =
    mode === "map"
      ? `Lista · ${count}`
      : mode === "peek"
        ? "Sube para la lista · Baja para el mapa"
        : "Baja para ver el mapa";

  return (
    <button
      type="button"
      aria-expanded={mode === "expanded"}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="flex w-full shrink-0 flex-col items-center px-3 pt-1.5 pb-1 lg:hidden"
    >
      <div className="mx-auto h-1.5 w-10 touch-none rounded-full bg-ink/25" />
      <span className="mt-1 text-[11px] font-medium text-ink-soft">{label}</span>
    </button>
  );
}

interface HomeClientProps {
  initialReports: Report[];
  initialPoints: CollectionPoint[];
  initialRoads?: ClosedRoad[];
  initialOffers?: HelpOffer[];
  initialRentals?: Rental[];
  initialExternalCentros?: ExternalCentro[];
  initialExternalAyudas?: ExternalAyuda[];
  initialExternalAfectaciones?: ExternalAfectacion[];
  initialReportId?: string | null;
  dataError?: string | null;
}

export default function HomeClient({
  initialReports,
  initialPoints,
  initialRoads = [],
  initialOffers = [],
  initialRentals = [],
  initialExternalCentros = [],
  initialExternalAyudas = [],
  initialExternalAfectaciones = [],
  initialReportId = null,
  dataError = null,
}: HomeClientProps) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [points, setPoints] = useState<CollectionPoint[]>(initialPoints);
  const [externalCentros, setExternalCentros] = useState<ExternalCentro[]>(initialExternalCentros);
  const [externalAyudas, setExternalAyudas] = useState<ExternalAyuda[]>(initialExternalAyudas);
  const [externalAfectaciones, setExternalAfectaciones] = useState<ExternalAfectacion[]>(
    initialExternalAfectaciones
  );
  const [city, setCity] = useState<AppCity>(() => cityById(DEFAULT_CITY_ID));
  const [departmentFocus, setDepartmentFocus] = useState<string>("todos");
  const [zoneReady, setZoneReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [needsCity, setNeedsCity] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "report" | "offer" | "family" | "rental" | null
  >(null);
  const [municipality, setMunicipality] = useState<MunicipalityFilter>("todos");
  const [category, setCategory] = useState<CategoryQuickFilter>("todos");
  // Pereira Unida siempre se muestra: este filtro solo apaga/prende las
  // fuentes externas (Ayudas Pereira, Corag, Pereira Responde) — nunca lo
  // propio, para que lo propio sea siempre "lo fuerte" por defecto.
  const [includeExternal, setIncludeExternal] = useState(true);
  const [criticalMedicineOnly, setCriticalMedicineOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [priorityMode, setPriorityMode] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [roadModalOpen, setRoadModalOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [roads, setRoads] = useState<ClosedRoad[]>(initialRoads);
  const [offers, setOffers] = useState<HelpOffer[]>(initialOffers);
  const [rentals, setRentals] = useState<Rental[]>(initialRentals);
  const [isPending, startTransition] = useTransition();
  const [appliedInitialReportId, setAppliedInitialReportId] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("map");
  const [listScope, setListScope] = useState<"activos" | "todos" | "cerrados">("activos");
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>("todas");
  const [mapReady, setMapReady] = useState(false);
  const [mapPlaces, setMapPlaces] = useState<MapPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const skipNextRefetch = useRef(true);
  const lastFetchedZone = useRef<string | null>(null);
  const cityRef = useRef(city);
  cityRef.current = city;

  const isPointsView = category === "puntos_acopio";
  const isRoadsView = category === "vias_cerradas";
  const isOffersView = category === "ofrezco";
  const isRentalsView = category === "arriendos";
  const shareableCategory =
    !isPointsView && !isRoadsView && !isOffersView && !isRentalsView && category !== "todos"
      ? (category as ReportCategory)
      : null;
  const showMetroChips = isRisaraldaMetro(city);
  const nationwide = isNationwide(city);
  const showPlaceOnCards = showMetroChips || nationwide;
  const needsPlaceToPost = needsCity || nationwide;

  function belongsToActiveZone(item: { department?: string; municipality?: string }) {
    if (isNationwide(cityRef.current)) return true;
    const zone = zoneQueryFor(cityRef.current);
    if (!zone.department) return true;
    const dept = item.department || DEFAULT_DEPARTMENT;
    if (dept !== zone.department) return false;
    if (zone.municipality && item.municipality !== zone.municipality) return false;
    return true;
  }

  useEffect(() => {
    const params =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const fromProp = initialReportId;
    const reportId = fromProp || params?.get("reporte") || null;
    const rentalId = params?.get("arriendo") || null;
    const vista = params?.get("vista") ?? null;

    if (!reportId && !rentalId && !isValidVista(vista)) return;
    setAppliedInitialReportId(true);

    if (reportId) {
      setSelectedReportId(reportId);
      setCategory("todos");
      setMunicipality("todos");
      setPriorityMode(false);
    } else if (rentalId) {
      setSelectedRentalId(rentalId);
      setCategory("arriendos");
    } else if (isValidVista(vista)) {
      setCategory(vista);
      setPriorityMode(false);
    }
  }, [initialReportId]);

  useEffect(() => {
    if (appliedInitialReportId) {
      window.history.replaceState(null, "", "/");
    }
  }, [appliedInitialReportId]);

  useEffect(() => {
    const cityIdFromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("ciudad")
        : null;
    if (cityIdFromUrl) {
      const urlCity = cityById(cityIdFromUrl);
      setCity(urlCity);
      saveCity(urlCity);
      saveCityChosen();
      setNeedsCity(false);
      setZoneReady(true);
      return;
    }
    const saved = readSavedCity();
    const chosen = readCityChosen();
    setCity(saved);
    setNeedsCity(!chosen);
    setZoneReady(true);
    if (!chosen) {
      const openPicker = () => setPickerOpen(true);
      const delay = isInAppBrowser() ? 1400 : 500;
      const timer = window.setTimeout(openPicker, delay);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (needsCity && !pickerOpen) setPickerOpen(true);
  }, [needsCity, pickerOpen]);

  useEffect(() => {
    if (!zoneReady) return;
    saveCity(city);
    const zone = zoneQueryFor(city);
    const key = `${zone.department ?? "*"}|${zone.municipality ?? ""}`;
    if (lastFetchedZone.current === key) return;
    if (lastFetchedZone.current === null && isDefaultZone(city)) {
      lastFetchedZone.current = key;
      return;
    }
    lastFetchedZone.current = key;
    skipNextRefetch.current = true;
    startTransition(async () => {
      const data = await getHomeData(zone);
      setReports(data.reports);
      setPoints(data.points);
      setRoads(data.roads ?? []);
      setOffers(data.offers ?? []);
      setRentals(data.rentals ?? []);
      setMunicipality("todos");
      setDepartmentFocus("todos");
    });
  }, [city, zoneReady]);

  useEffect(() => {
    if (!isRentalsView || !zoneReady || rentals.length > 0) return;
    let cancelled = false;
    getHomeData(zoneQueryFor(city)).then((data) => {
      if (cancelled || !data.rentals?.length) return;
      setRentals(data.rentals);
    });
    return () => {
      cancelled = true;
    };
  }, [isRentalsView, zoneReady, rentals.length, city]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.replace(/[%_,]/g, " ").trim());
    }, 450);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const filtersRef = useRef({ municipality, category, debouncedSearchQuery, selectedReportId, city });

  useEffect(() => {
    filtersRef.current = { municipality, category, debouncedSearchQuery, selectedReportId, city };
  }, [municipality, category, debouncedSearchQuery, selectedReportId, city]);

  const refetch = useCallback(() => {
    const {
      municipality: currentMunicipality,
      selectedReportId: currentSelectedId,
      city: currentCity,
    } = filtersRef.current;
    const zone = zoneQueryFor(currentCity);
    const municipalityFilter =
      currentMunicipality !== "todos" ? currentMunicipality : (zone.municipality ?? "todos");
    startTransition(async () => {
      const data = await getReports(
        "todos",
        "todos",
        undefined,
        municipalityFilter,
        zone.department
      );
      if (data === null) return;
      const lostSelectedReport =
        data.length === 0 &&
        !!currentSelectedId &&
        initialReports.some((r) => r.id === currentSelectedId);
      setReports(lostSelectedReport ? initialReports : data);
    });
  }, [initialReports]);

  useEffect(() => {
    let cancelled = false;
    const startMap = () => {
      if (!cancelled) setMapReady(true);
    };
    const timeoutId = window.setTimeout(startMap, isInAppBrowser() ? 2200 : 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (dataError) return;
    if (skipNextRefetch.current) {
      skipNextRefetch.current = false;
      return;
    }
    refetch();
  }, [municipality, refetch, dataError]);

  useEffect(() => {
    const q = debouncedSearchQuery;
    if (q.length < 2) {
      setMapPlaces([]);
      setSelectedPlaceId(null);
      setPlacesLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedPlaceId(null);
    setPlacesLoading(true);
    const timer = window.setTimeout(() => {
      fetch(placesSearchUrl(q, city.id))
        .then((res) => (res.ok ? res.json() : { places: [] }))
        .then((data: { places?: MapPlace[] }) => {
          if (!cancelled) setMapPlaces(data.places ?? []);
        })
        .catch(() => {
          if (!cancelled) setMapPlaces([]);
        })
        .finally(() => {
          if (!cancelled) setPlacesLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [debouncedSearchQuery, city.id]);

  useEffect(() => {
    if (dataError) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel("reports-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reports" },
          (payload) => {
            if (payload.eventType === "INSERT" && payload.new) {
              const next = { ...(payload.new as Report), comments_count: 0 };
              if (!belongsToActiveZone(next)) return;
              setReports((prev) => (prev.some((r) => r.id === next.id) ? prev : [next, ...prev]));
            } else if (payload.eventType === "UPDATE" && payload.new) {
              const next = payload.new as Report;
              setReports((prev) =>
                prev.map((r) => (r.id === next.id ? { ...r, ...next, comments_count: r.comments_count } : r))
              );
            } else if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setReports((prev) => prev.filter((r) => r.id !== id));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "closed_roads" },
          (payload) => {
            if (payload.eventType === "INSERT" && payload.new) {
              const next = payload.new as ClosedRoad;
              if (!belongsToActiveZone(next)) return;
              setRoads((prev) => (prev.some((r) => r.id === next.id) ? prev : [next, ...prev]));
            } else if (payload.eventType === "UPDATE" && payload.new) {
              const next = payload.new as ClosedRoad;
              setRoads((prev) => prev.map((r) => (r.id === next.id ? next : r)));
            } else if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setRoads((prev) => prev.filter((r) => r.id !== id));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "help_offers" },
          (payload) => {
            if (payload.eventType === "INSERT" && payload.new) {
              const next = payload.new as HelpOffer;
              if (!belongsToActiveZone(next)) return;
              setOffers((prev) => (prev.some((o) => o.id === next.id) ? prev : [next, ...prev]));
            } else if (payload.eventType === "UPDATE" && payload.new) {
              const next = payload.new as HelpOffer;
              setOffers((prev) => prev.map((o) => (o.id === next.id ? next : o)));
            } else if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setOffers((prev) => prev.filter((o) => o.id !== id));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rentals" },
          (payload) => {
            if (payload.eventType === "INSERT" && payload.new) {
              const next = payload.new as Rental;
              if (!belongsToActiveZone(next)) return;
              setRentals((prev) =>
                prev.some((item) => item.id === next.id)
                  ? prev
                  : [{ ...next, comments_count: next.comments_count ?? 0 }, ...prev]
              );
            } else if (payload.eventType === "UPDATE" && payload.new) {
              const next = payload.new as Rental;
              setRentals((prev) =>
                prev.map((item) =>
                  item.id === next.id
                    ? { ...item, ...next, comments_count: item.comments_count ?? 0 }
                    : item
                )
              );
            } else if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setRentals((prev) => prev.filter((item) => item.id !== id));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "rental_comments" },
          (payload) => {
            const rentalId = (payload.new as { rental_id?: string }).rental_id;
            if (!rentalId) return;
            setRentals((prev) =>
              prev.map((item) =>
                item.id === rentalId
                  ? { ...item, comments_count: (item.comments_count ?? 0) + 1 }
                  : item
              )
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "rental_comments" },
          (payload) => {
            const rentalId = (payload.old as { rental_id?: string }).rental_id;
            if (!rentalId) return;
            setRentals((prev) =>
              prev.map((item) =>
                item.id === rentalId
                  ? { ...item, comments_count: Math.max(0, (item.comments_count ?? 0) - 1) }
                  : item
              )
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "comments" },
          (payload) => {
            const reportId = (payload.new as { report_id?: string }).report_id;
            if (!reportId) return;
            setReports((prev) =>
              prev.map((r) =>
                r.id === reportId ? { ...r, comments_count: r.comments_count + 1 } : r
              )
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "comments" },
          (payload) => {
            const reportId = (payload.old as { report_id?: string }).report_id;
            if (!reportId) return;
            setReports((prev) =>
              prev.map((r) =>
                r.id === reportId
                  ? { ...r, comments_count: Math.max(0, r.comments_count - 1) }
                  : r
              )
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "external_centros" },
          (payload) => {
            if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setExternalCentros((prev) => prev.filter((c) => c.id !== id));
              return;
            }
            if (payload.new) {
              const next = payload.new as ExternalCentro;
              setExternalCentros((prev) =>
                prev.some((c) => c.id === next.id)
                  ? prev.map((c) => (c.id === next.id ? next : c))
                  : [next, ...prev]
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "external_ayudas" },
          (payload) => {
            if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setExternalAyudas((prev) => prev.filter((a) => a.id !== id));
              return;
            }
            if (payload.new) {
              const next = payload.new as ExternalAyuda;
              setExternalAyudas((prev) =>
                prev.some((a) => a.id === next.id)
                  ? prev.map((a) => (a.id === next.id ? next : a))
                  : [next, ...prev]
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "external_afectaciones" },
          (payload) => {
            if (payload.eventType === "DELETE" && payload.old) {
              const id = (payload.old as { id?: string }).id;
              if (id) setExternalAfectaciones((prev) => prev.filter((a) => a.id !== id));
              return;
            }
            if (payload.new) {
              const next = payload.new as ExternalAfectacion;
              setExternalAfectaciones((prev) =>
                prev.some((a) => a.id === next.id)
                  ? prev.map((a) => (a.id === next.id ? next : a))
                  : [next, ...prev]
              );
            }
          }
        )
        .subscribe();
    }, (isInAppBrowser() ? 3200 : 1600) + Math.floor(Math.random() * 1500));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (channel) {
        getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [refetch, dataError]);

  const isSearching = debouncedSearchQuery.length >= 2;
  // Filtro por una categoría puntual (ej. "Mascotas"): puntos de acopio,
  // centros y ayudas externas no tienen forma confiable de saber si son de
  // esa categoría (cada fuente usa su propio vocabulario), así que en vez
  // de mostrarlos todos sin filtrar — lo que hacía ver "de todo" al elegir
  // una categoría — se ocultan, igual que ya se ocultaban en la lista
  // ("también piden/ofrecen ayuda" solo aparece con category === "todos").
  const isSpecificCategory = !isSearching && Boolean(shareableCategory);

  const visibleReports = useMemo(() => {
    let base = reports;
    if (
      !isSearching &&
      category !== "todos" &&
      category !== "puntos_acopio" &&
      category !== "vias_cerradas" &&
      category !== "ofrezco" &&
      category !== "arriendos"
    ) {
      base = base.filter((r) => r.category === category);
    }
    if (criticalMedicineOnly) {
      base = base.filter((r) => isCriticalMedicine(`${r.title} ${r.description}`));
    }
    if (!isSearching) {
      if (listScope === "activos") base = base.filter((r) => !isClosedStatus(r.status));
      if (listScope === "cerrados") base = base.filter((r) => isClosedStatus(r.status));
      if (timeWindow === "6h") {
        base = base.filter((r) => isReportFromLastHours(r, 6));
      }
    }
    if (nationwide && departmentFocus !== "todos") {
      base = base.filter((r) => (r.department || DEFAULT_DEPARTMENT) === departmentFocus);
    }
    if (isSearching) {
      base = base.filter((r) =>
        matchesHaystack(
          `${r.title} ${r.description} ${r.location_name} ${r.municipality} ${CATEGORY_LABELS[r.category]}`,
          debouncedSearchQuery
        )
      );
    }
    if (priorityMode && !isSearching) {
      base = base.filter((r) => !isClosedStatus(r.status));
      const urgencyRank: Record<Report["urgent_level"], number> = {
        critico: 0,
        moderado: 1,
        atendido: 2,
      };
      return [...base].sort((a, b) => urgencyRank[a.urgent_level] - urgencyRank[b.urgent_level]);
    }
    return base;
  }, [
    reports,
    priorityMode,
    listScope,
    timeWindow,
    category,
    criticalMedicineOnly,
    isSearching,
    debouncedSearchQuery,
    nationwide,
    departmentFocus,
  ]);

  const visiblePoints = useMemo(() => {
    let base =
      municipality === "todos"
        ? points
        : points.filter((p) => p.municipality === municipality);
    if (!isSearching || isCollectionPointSearch(debouncedSearchQuery)) return base;
    return base.filter((p) =>
      matchesHaystack(
        `${p.name} ${p.address} ${p.municipality} ${p.supplies_needed.join(" ")} ${p.open_hours}`,
        debouncedSearchQuery
      )
    );
  }, [points, municipality, isSearching, debouncedSearchQuery]);

  const visibleOffers = useMemo(() => {
    const base = offers.filter((offer) => offer.status === "activa");
    if (!isSearching) return base;
    return base.filter((offer) =>
      matchesHaystack(
        `${offer.full_name} ${offer.description} ${HELP_SKILL_LABELS[offer.skill]}`,
        debouncedSearchQuery
      )
    );
  }, [offers, isSearching, debouncedSearchQuery]);

  const visibleRentals = useMemo(() => {
    let base = rentals.filter((item) => item.status !== "ocultada");
    if (municipality !== "todos") {
      base = base.filter((item) => item.municipality === municipality);
    }
    if (!isSearching) return base;
    return base.filter((item) =>
      matchesHaystack(
        `${item.property_type} ${item.neighborhood} ${item.address} ${item.municipality} ${item.contact}`,
        debouncedSearchQuery
      )
    );
  }, [rentals, municipality, isSearching, debouncedSearchQuery]);

  const mapRoads = useMemo(() => {
    let base = roads.filter((road) => road.status === "cerrada");
    if (municipality !== "todos") {
      base = base.filter((road) => road.municipality === municipality);
    }
    if (!isSearching) return base;
    return base.filter((road) =>
      matchesHaystack(
        `${road.name} ${road.note} ${CLOSED_ROAD_REASON_LABELS[road.reason]}`,
        debouncedSearchQuery
      )
    );
  }, [roads, municipality, isSearching, debouncedSearchQuery]);

  const mapPoints = isSearching || isPointsView ? visiblePoints : points.filter((p) =>
    municipality === "todos" ? true : p.municipality === municipality
  );
  const mapRentals = isSearching || isRentalsView ? visibleRentals : [];

  const externalRoadAfectaciones = useMemo(
    () => (includeExternal ? externalAfectaciones.filter((a) => a.tipo === "road") : []),
    [externalAfectaciones, includeExternal]
  );
  const externalDamageAfectaciones = useMemo(
    () => (includeExternal ? externalAfectaciones.filter((a) => a.tipo !== "road") : []),
    [externalAfectaciones, includeExternal]
  );
  const externalRequests = useMemo(
    () => (includeExternal ? externalAyudas.filter((a) => a.tipo === "request") : []),
    [externalAyudas, includeExternal]
  );
  const externalOffers = useMemo(
    () => (includeExternal ? externalAyudas.filter((a) => a.tipo === "offer") : []),
    [externalAyudas, includeExternal]
  );
  const mapExternalCentros = includeExternal ? externalCentros : [];

  useEffect(() => {
    if (!selectedReportId) return;
    const el = document.getElementById(`report-${selectedReportId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedReportId, visibleReports]);

  function handleRentalUpdated(updated: Rental) {
    setRentals((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleStatusUpdated(updated: Report) {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleReportCreated(created: Report) {
    setReports((prev) => (prev.some((r) => r.id === created.id) ? prev : [created, ...prev]));
    setSelectedReportId(created.id);
    setCategory("todos");
    setMunicipality("todos");
    setPriorityMode(false);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSheetMode("map");
    setReportModalOpen(false);
  }

  function handleReopenRoad(id: string) {
    setRoads((prev) =>
      prev.map((road) => (road.id === id ? { ...road, status: "reabierta" } : road))
    );
    void reopenClosedRoad(id).then((result) => {
      if (result.success && result.data) {
        setRoads((prev) => prev.map((road) => (road.id === result.data!.id ? result.data! : road)));
      }
    });
  }

  function handleSelectReport(id: string, expand = false) {
    setSelectedRentalId(null);
    setSelectedReportId(id);
    setSheetMode(expand ? "expanded" : "map");
  }

  function handleSelectRental(id: string) {
    setSelectedReportId(null);
    setSelectedPlaceId(null);
    setSelectedRentalId(id);
    setSheetMode("map");
  }

  function openCityPicker(action?: "report" | "offer" | "family" | "rental") {
    if (action) setPendingAction(action);
    setPickerOpen(true);
  }

  function handleCityPicked(next: AppCity) {
    setCity(next);
    saveCity(next);
    saveCityChosen();
    setNeedsCity(false);
    setPickerOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (isNationwide(next)) return;
    if (action === "report") setReportModalOpen(true);
    if (action === "offer") {
      setPriorityMode(false);
      setCategory("ofrezco");
      setSheetMode("expanded");
    }
    if (action === "family") setFamilyModalOpen(true);
    if (action === "rental") {
      setPriorityMode(false);
      setCategory("arriendos");
      setSelectedReportId(null);
      setSelectedPlaceId(null);
      setSheetMode("peek");
    }
  }

  function handleWantsToHelp() {
    setPriorityMode(true);
    if (isPointsView || isRoadsView || isOffersView || isRentalsView) setCategory("todos");
    setSheetMode("expanded");
    requestAnimationFrame(() => {
      const firstCard = document.querySelector('[id^="report-"]');
      firstCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleWantsToOffer() {
    setPriorityMode(false);
    setCategory("ofrezco");
    setSheetMode("expanded");
  }

  function handleShowClosedRoads() {
    setPriorityMode(false);
    setCategory("vias_cerradas");
    setSelectedRentalId(null);
    // No colapsar una hoja que ya está en "peek"/"expanded" — solo abrirla
    // si estaba pegada al mapa (el pin de vías cerradas sigue visible en
    // los tres modos, así que tocarlo estando ya expandida no debe achicarla).
    setSheetMode((mode) => (mode === "map" ? "peek" : mode));
  }

  function handleWantsToRent() {
    if (isRentalsView) {
      setCategory("todos");
      setSelectedRentalId(null);
      return;
    }
    setPriorityMode(false);
    setCategory("arriendos");
    setSelectedReportId(null);
    setSelectedPlaceId(null);
    setSheetMode("peek");
  }

  function leaveRentalsIfNeeded() {
    if (!isRentalsView) return;
    setCategory("todos");
    setSelectedRentalId(null);
  }

  const stats = useMemo(() => {
    const activos = reports.filter((r) => !isClosedStatus(r.status));
    const cerrados = reports.length - activos.length;
    const critico = activos.filter((r) => r.urgent_level === "critico").length;
    const falsa = reports.filter((r) => r.status === "informacion_falsa").length;
    return { total: activos.length, critico, cerrados, all: reports.length, falsa };
  }, [reports]);

  const departmentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const report of reports) {
      if (isClosedStatus(report.status)) continue;
      const dept = (report.department || DEFAULT_DEPARTMENT).trim();
      map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [reports]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );
  const selectedRental = useMemo(
    () => rentals.find((item) => item.id === selectedRentalId) ?? null,
    [rentals, selectedRentalId]
  );
  const overlayOpen = Boolean(selectedReport || selectedRental);

  const showSkeleton = isPending && visibleReports.length === 0;

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#0e0e10]"
      data-sheet={sheetMode}
      style={
        {
          "--sheet-current": overlayOpen ? "0px" : sheetHeight(sheetMode),
          ...(overlayOpen ? { "--dock-offset": "0px" } : {}),
        } as CSSProperties
      }
    >
      <div className="absolute inset-0 z-0">
        {mapReady && zoneReady ? (
          <ReportsMap
            reports={(isPointsView || isRentalsView) && !isSearching ? [] : visibleReports}
            points={isRentalsView && !isSearching ? [] : isSpecificCategory ? [] : mapPoints}
            roads={isRentalsView && !isSearching ? [] : isSpecificCategory ? [] : mapRoads}
            places={isSearching ? mapPlaces : []}
            rentals={mapRentals}
            externalCentros={
              isRentalsView && !isSearching ? [] : isSpecificCategory ? [] : mapExternalCentros
            }
            externalAyudas={
              (isRentalsView && !isSearching) || !includeExternal || isSpecificCategory
                ? []
                : externalAyudas
            }
            externalAfectaciones={
              (isRentalsView && !isSearching) || !includeExternal || isSpecificCategory
                ? []
                : externalAfectaciones
            }
            fitSearchResults={isSearching && !selectedPlaceId}
            fitRentals={isRentalsView && !isSearching && !selectedRentalId}
            fitPoints={isPointsView && !isSearching}
            selectedReportId={selectedReportId}
            selectedPlaceId={selectedPlaceId}
            selectedRentalId={selectedRentalId}
            centerLat={city.center[0]}
            centerLng={city.center[1]}
            zoom={nationwide ? MAP_COUNTRY_ZOOM : MAP_DEFAULT_ZOOM}
            fitBbox={nationwide ? city.bbox : null}
            cityName={city.name}
            onSelectReport={(id) => {
              setSelectedPlaceId(null);
              handleSelectReport(id);
            }}
            onSelectPlace={setSelectedPlaceId}
            onSelectRental={handleSelectRental}
            onAddClosedRoad={() => setRoadModalOpen(true)}
            onReopenRoad={handleReopenRoad}
            onShowClosedRoads={handleShowClosedRoads}
          />
        ) : (
          <MapBootScreen />
        )}
      </div>

      <div className="absolute inset-x-0 top-0 z-10 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-3 lg:pt-[max(0.75rem,env(safe-area-inset-top))] lg:pr-[calc(var(--sheet-panel-width)+1.5rem)]">
        <Header
          liveCount={stats.total}
          criticalCount={stats.critico}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          cityName={city.name}
          onCityClick={() => openCityPicker()}
          municipality={zoneQueryFor(city).municipality ?? null}
          department={zoneQueryFor(city).department ?? null}
        />

        {dataError && (
          <div className="glass mt-2 rounded-[22px] px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-carmine">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              No hay conexión con los datos
            </p>
            <p className="mt-1 text-xs text-ink">{dataError}</p>
          </div>
        )}

        <div className="mt-1.5 lg:mt-2">
          <FilterBar
            municipality={municipality}
            onMunicipalityChange={setMunicipality}
            category={category}
            onCategoryChange={(value) => {
              setCategory(value);
              setPriorityMode(false);
              setSelectedRentalId(null);
            }}
            timeWindow={timeWindow}
            onTimeWindowChange={setTimeWindow}
            showMetroChips={showMetroChips}
            includeExternal={includeExternal}
            onIncludeExternalChange={setIncludeExternal}
            criticalMedicineOnly={criticalMedicineOnly}
            onCriticalMedicineOnlyChange={setCriticalMedicineOnly}
          />
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-x-2.5 z-10 transition-opacity duration-200 lg:inset-x-3",
          "bottom-[calc(var(--sheet-current)+0.45rem)]",
          (sheetMode === "expanded" || overlayOpen) &&
            "max-lg:pointer-events-none max-lg:opacity-0",
          "lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-3 lg:right-[calc(var(--sheet-panel-width)+1.5rem)]"
        )}
      >
        <ActionCards
          onReportClick={() => {
            leaveRentalsIfNeeded();
            if (needsPlaceToPost) openCityPicker("report");
            else setReportModalOpen(true);
          }}
          onHelpClick={() => (needsPlaceToPost ? openCityPicker("offer") : handleWantsToOffer())}
          onFamilyClick={() => {
            leaveRentalsIfNeeded();
            if (needsPlaceToPost) openCityPicker("family");
            else setFamilyModalOpen(true);
          }}
          onRentalsClick={() => (needsPlaceToPost ? openCityPicker("rental") : handleWantsToRent())}
          helpActive={isOffersView}
          rentalsActive={isRentalsView}
        />
      </div>

      <NotificationsPrompt
        municipality={zoneQueryFor(city).municipality ?? null}
        department={zoneQueryFor(city).department ?? null}
      />

      <div
        className={cn(
          "pointer-events-auto absolute z-20 flex flex-col overflow-hidden",
          "inset-x-0 bottom-0 h-[var(--sheet-current)] rounded-t-[24px]",
          "transition-[height,opacity] duration-300 ease-out",
          overlayOpen && "max-lg:pointer-events-none max-lg:opacity-0",
          "lg:top-3 lg:right-3 lg:bottom-auto lg:left-auto lg:h-[calc(100dvh-24px)] lg:w-[var(--sheet-panel-width)] lg:rounded-[28px] lg:transition-none"
        )}
      >
        <div className="glass pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <SheetHandle
            mode={sheetMode}
            count={
              isSearching
                ? visibleReports.length +
                  visiblePoints.length +
                  mapPlaces.length +
                  mapRoads.length +
                  visibleOffers.length +
                  visibleRentals.length
                : isPointsView
                  ? visiblePoints.length
                  : isRoadsView
                    ? mapRoads.length
                    : isOffersView
                      ? visibleOffers.length
                      : isRentalsView
                        ? visibleRentals.length
                        : visibleReports.length
            }
            onMap={() => setSheetMode("map")}
            onPeek={() => setSheetMode("peek")}
            onExpand={() => setSheetMode("expanded")}
          />

          <div className="hidden shrink-0 px-3 pt-2 pb-1 lg:block">
            <BrandMark />
            <div
              className="mt-2.5 h-[2px] w-16 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, var(--pereira-gold) 50%, var(--pereira-red) 50%)",
              }}
              aria-hidden="true"
            />
          </div>

          <div
            ref={listScrollRef}
            className="sheet-scroll min-h-0 flex-1 overflow-y-scroll overscroll-contain px-2.5 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:p-2"
          >
            {isPointsView && !isSearching ? (
              <CollectionPoints points={points} externalCentros={mapExternalCentros} city={city} />
            ) : isRoadsView && !isSearching ? (
              <div className="space-y-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setRoadModalOpen(true)}
                  className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-carmine/90 text-[14px] font-semibold text-white"
                >
                  Marcar calle cerrada
                </button>
                {mapRoads.length === 0 && externalRoadAfectaciones.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm font-medium text-ink-soft">
                    No hay vías cerradas en {city.name}. Márcalas tocando el mapa.
                  </p>
                ) : (
                  <>
                    {mapRoads.map((road) => (
                      <article key={road.id} className="rounded-2xl px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-ink">{road.name}</p>
                          <span className="ml-auto">
                            <FuenteBadge fuente="pereira_unida" />
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-soft">
                          {CLOSED_ROAD_REASON_LABELS[road.reason]}
                          {road.note ? ` · ${road.note}` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleReopenRoad(road.id)}
                          className="mt-1 text-[11px] font-semibold text-forest underline underline-offset-2"
                        >
                          Ya se puede transitar
                        </button>
                      </article>
                    ))}
                    {externalRoadAfectaciones.map((afectacion) => (
                      <ExternalAfectacionCard key={afectacion.id} afectacion={afectacion} />
                    ))}
                  </>
                )}
                {externalDamageAfectaciones.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Daños estructurales · {externalDamageAfectaciones.length}
                    </p>
                    <div className="space-y-2">
                      {externalDamageAfectaciones.map((afectacion) => (
                        <ExternalAfectacionCard key={afectacion.id} afectacion={afectacion} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : isOffersView && !isSearching ? (
              <>
                <HelpOffers
                  offers={offers}
                  cityName={city.name}
                  cityId={city.id}
                  onPublish={() => setOfferModalOpen(true)}
                  onSeeNeeds={handleWantsToHelp}
                  onHidden={(offer) =>
                    setOffers((prev) => prev.map((item) => (item.id === offer.id ? offer : item)))
                  }
                />
                {externalOffers.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      También ofrecen ayuda · {externalOffers.length}
                    </p>
                    {externalOffers.map((ayuda) => (
                      <ExternalAyudaCard key={ayuda.id} ayuda={ayuda} />
                    ))}
                  </div>
                ) : null}
              </>
            ) : isRentalsView && !isSearching ? (
              <Rentals
                rentals={visibleRentals}
                cityName={city.name}
                cityId={city.id}
                selectedId={selectedRentalId}
                showMunicipality={showPlaceOnCards}
                onPublish={() => setRentalModalOpen(true)}
                onSeeHelp={handleWantsToHelp}
                onSelect={handleSelectRental}
                onStatusUpdated={handleRentalUpdated}
              />
            ) : (
              <>
                {isSearching ? (
                  <p className="mb-1.5 px-1 text-[11px] text-ink-soft">
                    Resultados de “{debouncedSearchQuery}” en el mapa y en la lista
                  </p>
                ) : (
                  <>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <div className="flex flex-1 items-center gap-1 rounded-full bg-black/5 p-0.5 dark:bg-white/10">
                        {(
                          [
                            ["activos", "Activos", stats.total],
                            ["todos", "Todos", stats.all],
                            ["cerrados", "Cerrados", stats.cerrados],
                          ] as const
                        ).map(([key, label, count]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setListScope(key)}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[12px] font-semibold transition",
                              listScope === key ? "bg-ink text-paper shadow-sm" : "text-ink-soft"
                            )}
                          >
                            {label}
                            <span className="text-[10px] font-medium opacity-70">{count}</span>
                          </button>
                        ))}
                      </div>
                      {shareableCategory ? (
                        <ShareButton
                          title={CATEGORY_LABELS[shareableCategory]}
                          text={
                            city && !nationwide
                              ? `Mira las solicitudes de ${CATEGORY_LABELS[shareableCategory].toLowerCase()} en ${city.name} en Pereira Unida.`
                              : `Mira las solicitudes de ${CATEGORY_LABELS[shareableCategory].toLowerCase()} en Pereira Unida.`
                          }
                          url={listShareUrl(shareableCategory, nationwide ? undefined : city.id)}
                          label={`Compartir ${CATEGORY_LABELS[shareableCategory]}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
                        />
                      ) : null}
                    </div>
                    {nationwide && departmentCounts.length > 0 ? (
                      <div className="no-scrollbar mb-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
                        <button
                          type="button"
                          onClick={() => setDepartmentFocus("todos")}
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                            departmentFocus === "todos" ? "bg-ink text-paper" : "bg-black/5 text-ink-soft dark:bg-white/10"
                          )}
                        >
                          Todo el país {stats.total}
                        </button>
                        {departmentCounts.map(([dept, count]) => (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => setDepartmentFocus(departmentFocus === dept ? "todos" : dept)}
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                              departmentFocus === dept ? "bg-ink text-paper" : "bg-black/5 text-ink-soft dark:bg-white/10"
                            )}
                          >
                            {dept} {count}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="mb-1.5 px-1 text-[11px] text-ink-soft">
                      {nationwide
                        ? "Solicitudes de todo Colombia. Toca un departamento para filtrar."
                        : "Toca una fila para notas o marcar info falsa"}
                      {stats.falsa > 0 ? ` · ${stats.falsa} falsos` : ""}
                    </p>
                  </>
                )}

                {priorityMode && (
                  <div className="mb-2 flex items-center justify-between rounded-2xl bg-forest/10 px-3 py-2">
                    <span className="text-sm font-semibold text-forest">
                      🤝 {visibleReports.length}{" "}
                      {visibleReports.length === 1
                        ? "necesidad abierta"
                        : "necesidades abiertas"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPriorityMode(false)}
                      className="text-xs font-semibold text-forest underline underline-offset-2"
                    >
                      Ver todos
                    </button>
                  </div>
                )}

                {showSkeleton && (
                  <div className="space-y-2 p-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <ReportCardSkeleton key={i} />
                    ))}
                  </div>
                )}

                {isSearching && placesLoading && mapPlaces.length === 0 && (
                  <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] text-ink-soft">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Buscando hospitales, clínicas y lugares en el mapa…
                  </p>
                )}

                {isSearching && mapRoads.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Vías cerradas · {mapRoads.length}
                    </p>
                    {mapRoads.map((road) => (
                      <article key={road.id} className="rounded-2xl px-2 py-2">
                        <p className="text-[13px] font-semibold text-ink">{road.name}</p>
                        <p className="text-[11px] text-ink-soft">
                          {CLOSED_ROAD_REASON_LABELS[road.reason]}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                {isSearching && mapPlaces.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Lugares en el mapa · {mapPlaces.length}
                    </p>
                    <div className="space-y-1">
                      {mapPlaces.map((place) => {
                        const href = googleMapsUrl(place.lat, place.lng);
                        return (
                          <div
                            key={place.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedReportId(null);
                              setSelectedPlaceId(place.id);
                              setSheetMode("map");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedReportId(null);
                                setSelectedPlaceId(place.id);
                                setSheetMode("map");
                              }
                            }}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-2xl px-2 py-2",
                              selectedPlaceId === place.id && "bg-black/5 dark:bg-white/10"
                            )}
                          >
                            <span
                              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px]"
                              style={{ backgroundColor: `${PLACE_COLOR[place.kind]}22` }}
                              aria-hidden="true"
                            >
                              {PLACE_EMOJI[place.kind]}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] leading-snug font-semibold text-ink">
                                {place.name}
                              </p>
                              <p className="text-[11px] text-ink-soft">
                                {PLACE_KIND_LABEL[place.kind]}
                                {place.address ? ` · ${place.address}` : ""}
                              </p>
                            </div>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink dark:bg-white/10"
                                aria-label={`Cómo llegar a ${place.name}`}
                              >
                                <Navigation className="h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isSearching && visibleOffers.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Quienes ayudan en {city.name} · {visibleOffers.length}
                    </p>
                    <HelpOffers
                      offers={visibleOffers}
                      cityName={city.name}
                      showCtas={false}
                      onPublish={() => setOfferModalOpen(true)}
                      onSeeNeeds={handleWantsToHelp}
                      onHidden={(offer) =>
                        setOffers((prev) => prev.map((item) => (item.id === offer.id ? offer : item)))
                      }
                    />
                  </div>
                )}

                {isSearching && visibleRentals.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Arriendos · {visibleRentals.length}
                    </p>
                    <Rentals
                      rentals={visibleRentals}
                      cityName={city.name}
                      showCtas={false}
                      selectedId={selectedRentalId}
                      showMunicipality={showPlaceOnCards}
                      onPublish={() => setRentalModalOpen(true)}
                      onSelect={handleSelectRental}
                      onStatusUpdated={handleRentalUpdated}
                    />
                  </div>
                )}

                {isSearching && visiblePoints.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Acopio · {visiblePoints.length}
                    </p>
                    <CollectionPoints points={visiblePoints} city={city} />
                  </div>
                )}

                {!showSkeleton &&
                  !placesLoading &&
                  visibleReports.length === 0 &&
                  mapPlaces.length === 0 &&
                  visiblePoints.length === 0 &&
                  mapRoads.length === 0 &&
                  visibleOffers.length === 0 &&
                  visibleRentals.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm font-medium text-ink-soft">
                    {dataError
                      ? "No pudimos cargar los reportes."
                      : isSearching
                        ? `No hay hospitales, acopios, arriendos, ofertas ni solicitudes con esa búsqueda en ${city.name}.`
                        : timeWindow === "6h"
                          ? `No hay solicitudes de las últimas 6 horas en ${city.name}.`
                          : `Aún no hay solicitudes de ayuda en ${city.name}.`}
                  </p>
                )}

                {!showSkeleton && visibleReports.length > 0 && (
                  <div className={cn("p-0.5 transition-opacity duration-200", isPending && "opacity-50")}>
                    {isSearching ? (
                      <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                        Solicitudes de ayuda · {visibleReports.length}
                      </p>
                    ) : null}
                    <DenseReportList
                      reports={visibleReports}
                      selectedId={selectedReportId}
                      scrollRef={listScrollRef}
                      onSelect={(id) => handleSelectReport(id)}
                      onStatusUpdated={handleStatusUpdated}
                      showMunicipality={showPlaceOnCards}
                    />
                  </div>
                )}
                {!isSearching && category === "todos" && externalRequests.length > 0 ? (
                  <div className="mt-2 space-y-2 p-0.5">
                    <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      También piden ayuda · {externalRequests.length}
                    </p>
                    {externalRequests.map((ayuda) => (
                      <ExternalAyudaCard key={ayuda.id} ayuda={ayuda} />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {selectedReport && (
        <div className="absolute inset-0 z-40 flex items-end justify-center px-2.5 pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+2.25rem))] lg:items-center lg:p-3 lg:px-3 lg:pb-3 lg:pr-[calc(var(--sheet-panel-width)+1.5rem)]">
          <button
            type="button"
            aria-label="Cerrar ficha"
            className="absolute inset-0 bg-black/25 lg:bg-black/40"
            onClick={() => setSelectedReportId(null)}
          />
          <div className="relative z-10 flex max-h-[min(86dvh,760px)] w-full max-w-md flex-col px-0 lg:max-h-[min(88dvh,820px)]">
            <div className="flex justify-end px-1 pb-1.5 lg:px-0 lg:pb-2">
              <button
                type="button"
                onClick={() => setSelectedReportId(null)}
                className="glass flex h-9 w-9 items-center justify-center rounded-full text-ink"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="sheet-scroll min-h-0 overflow-y-auto overscroll-contain rounded-[22px] shadow-[0_16px_48px_rgba(15,10,8,0.28)]">
              <ReportCard
                report={selectedReport}
                selected
                anchor={false}
                onStatusUpdated={handleStatusUpdated}
                showMunicipality={showPlaceOnCards}
              />
            </div>
          </div>
        </div>
      )}

      {selectedRental && (
        <div className="absolute inset-0 z-40 flex items-end justify-center px-2.5 pb-[max(2.75rem,calc(env(safe-area-inset-bottom)+2.25rem))] lg:items-center lg:p-3 lg:px-3 lg:pb-3 lg:pr-[calc(var(--sheet-panel-width)+1.5rem)]">
          <button
            type="button"
            aria-label="Cerrar ficha"
            className="absolute inset-0 bg-black/25 lg:bg-black/40"
            onClick={() => setSelectedRentalId(null)}
          />
          <div className="relative z-10 flex max-h-[min(86dvh,760px)] w-full max-w-md flex-col px-0 lg:max-h-[min(88dvh,820px)]">
            <div className="flex justify-end px-1 pb-1.5 lg:px-0 lg:pb-2">
              <button
                type="button"
                onClick={() => setSelectedRentalId(null)}
                className="glass flex h-9 w-9 items-center justify-center rounded-full text-ink"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="sheet-scroll min-h-0 overflow-y-auto overscroll-contain rounded-[22px] shadow-[0_16px_48px_rgba(15,10,8,0.28)]">
              <div className="glass">
                <RentalCard
                  rental={selectedRental}
                  selected
                  showMunicipality={showPlaceOnCards}
                  onStatusUpdated={handleRentalUpdated}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {reportModalOpen ? (
        <RequestHelpModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onCreated={handleReportCreated}
          city={city}
          onChangeCity={() => openCityPicker()}
        />
      ) : null}
      {familyModalOpen ? (
        <FamilyStatusModal
          open={familyModalOpen}
          onClose={() => setFamilyModalOpen(false)}
          city={city}
          onChangeCity={() => openCityPicker()}
        />
      ) : null}
      {roadModalOpen ? (
        <ClosedRoadModal
          open={roadModalOpen}
          onClose={() => setRoadModalOpen(false)}
          city={city}
          onChangeCity={() => openCityPicker()}
          onCreated={(road) => {
            setRoads((prev) => (prev.some((item) => item.id === road.id) ? prev : [road, ...prev]));
            setCategory("vias_cerradas");
            setSheetMode("peek");
          }}
        />
      ) : null}
      {offerModalOpen ? (
        <HelpOfferModal
          open={offerModalOpen}
          onClose={() => setOfferModalOpen(false)}
          city={city}
          onChangeCity={() => openCityPicker()}
          onCreated={(offer) => {
            rememberMyOfferId(offer.id);
            setOffers((prev) => (prev.some((item) => item.id === offer.id) ? prev : [offer, ...prev]));
            setCategory("ofrezco");
            setSheetMode("expanded");
          }}
        />
      ) : null}
      {rentalModalOpen ? (
        <RentalFormModal
          open={rentalModalOpen}
          onClose={() => setRentalModalOpen(false)}
          city={city}
          onChangeCity={() => openCityPicker()}
          onCreated={(rental) => {
            rememberMyRentalId(rental.id);
            setRentals((prev) => (prev.some((item) => item.id === rental.id) ? prev : [rental, ...prev]));
            setCategory("arriendos");
            setSelectedRentalId(rental.id);
            setSheetMode("map");
          }}
        />
      ) : null}
      {pickerOpen ? (
        <RegionPicker
          open={pickerOpen}
          currentId={city.id}
          required={needsCity}
          onClose={() => setPickerOpen(false)}
          onSelect={handleCityPicked}
        />
      ) : null}
    </div>
  );
}
