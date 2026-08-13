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
import { AlertTriangle, Loader2, X } from "lucide-react";
import { getReports } from "@/app/actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { isClosedStatus, type CollectionPoint, type Report } from "@/lib/types";
import { isReportFromLastHours } from "@/lib/utils";
import Header from "./Header";
import BrandMark from "./BrandMark";
import ActionCards from "./ActionCards";
import FilterBar, {
  type CategoryQuickFilter,
  type MunicipalityFilter,
  type TimeWindowFilter,
} from "./FilterBar";
import DenseReportList from "./DenseReportList";
import ReportCard from "./ReportCard";
import ReportCardSkeleton from "./ReportCardSkeleton";

const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => <MapBootScreen />,
});
const CollectionPoints = dynamic(() => import("./CollectionPoints"));
const RequestHelpModal = dynamic(() => import("./RequestHelpModal"));
const FamilyStatusModal = dynamic(() => import("./FamilyStatusModal"));

function MapBootScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0e0e10]">
      <div className="flex flex-col items-center gap-2 text-white/70">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="text-xs">Cargando mapa</span>
      </div>
    </div>
  );
}

type SheetMode = "map" | "peek" | "expanded";

const SHEET_DRAG_THRESHOLD = 28;

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
  initialReportId?: string | null;
  dataError?: string | null;
}

export default function HomeClient({
  initialReports,
  initialPoints,
  initialReportId = null,
  dataError = null,
}: HomeClientProps) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [municipality, setMunicipality] = useState<MunicipalityFilter>("todos");
  const [category, setCategory] = useState<CategoryQuickFilter>("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [priorityMode, setPriorityMode] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [appliedInitialReportId, setAppliedInitialReportId] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("map");
  const [listScope, setListScope] = useState<"activos" | "todos" | "cerrados">("activos");
  const [timeWindow, setTimeWindow] = useState<TimeWindowFilter>("todas");
  const [mapReady, setMapReady] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const skipNextRefetch = useRef(true);

  const isPointsView = category === "puntos_acopio";

  useEffect(() => {
    const fromProp = initialReportId;
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("reporte")
        : null;
    const id = fromProp || fromUrl;
    if (!id) return;
    setAppliedInitialReportId(true);
    setSelectedReportId(id);
    setCategory("todos");
    setMunicipality("todos");
    setPriorityMode(false);
  }, [initialReportId]);

  useEffect(() => {
    if (appliedInitialReportId) {
      window.history.replaceState(null, "", "/");
    }
  }, [appliedInitialReportId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.replace(/[%_,]/g, " ").trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const filtersRef = useRef({ municipality, category, debouncedSearchQuery, selectedReportId });

  useEffect(() => {
    filtersRef.current = { municipality, category, debouncedSearchQuery, selectedReportId };
  }, [municipality, category, debouncedSearchQuery, selectedReportId]);

  const refetch = useCallback(() => {
    const {
      municipality: currentMunicipality,
      category: currentCategory,
      debouncedSearchQuery: currentSearch,
      selectedReportId: currentSelectedId,
    } = filtersRef.current;
    const categoryForQuery = currentCategory === "puntos_acopio" ? "todos" : currentCategory;

    startTransition(async () => {
      const data = await getReports(categoryForQuery, "todos", currentSearch, currentMunicipality);
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
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setMapReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    if (dataError) return;
    if (isPointsView) return;
    if (skipNextRefetch.current) {
      skipNextRefetch.current = false;
      return;
    }
    refetch();
  }, [municipality, category, debouncedSearchQuery, isPointsView, refetch, dataError]);

  useEffect(() => {
    if (dataError) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel("reports-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => refetch())
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
        .subscribe();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (channel) {
        getSupabaseBrowserClient().removeChannel(channel);
      }
    };
  }, [refetch, dataError]);

  const visibleReports = useMemo(() => {
    let base = reports;
    if (listScope === "activos") base = reports.filter((r) => !isClosedStatus(r.status));
    if (listScope === "cerrados") base = reports.filter((r) => isClosedStatus(r.status));
    if (timeWindow === "6h") {
      base = base.filter((r) => isReportFromLastHours(r, 6));
    }
    if (priorityMode) {
      base = base.filter((r) => !isClosedStatus(r.status));
      const urgencyRank: Record<Report["urgent_level"], number> = {
        critico: 0,
        moderado: 1,
        atendido: 2,
      };
      return [...base].sort((a, b) => urgencyRank[a.urgent_level] - urgencyRank[b.urgent_level]);
    }
    return base;
  }, [reports, priorityMode, listScope, timeWindow]);

  useEffect(() => {
    if (!selectedReportId) return;
    const el = document.getElementById(`report-${selectedReportId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedReportId, visibleReports]);

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

  function handleSelectReport(id: string, expand = false) {
    setSelectedReportId(id);
    setSheetMode(expand ? "expanded" : "map");
  }

  function handleWantsToHelp() {
    setPriorityMode(true);
    if (isPointsView) setCategory("todos");
    setSheetMode("expanded");
    requestAnimationFrame(() => {
      const firstCard = document.querySelector('[id^="report-"]');
      firstCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const stats = useMemo(() => {
    const activos = reports.filter((r) => !isClosedStatus(r.status));
    const cerrados = reports.length - activos.length;
    const critico = activos.filter((r) => r.urgent_level === "critico").length;
    const falsa = reports.filter((r) => r.status === "informacion_falsa").length;
    return { total: activos.length, critico, cerrados, all: reports.length, falsa };
  }, [reports]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  const showSkeleton = isPending && visibleReports.length === 0;

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#0e0e10]"
      data-sheet={sheetMode}
      style={
        {
          "--sheet-current": selectedReport ? "0px" : sheetHeight(sheetMode),
          ...(selectedReport ? { "--dock-offset": "0px" } : {}),
        } as CSSProperties
      }
    >
      <div className="absolute inset-0 z-0">
        {mapReady ? (
          <ReportsMap
            reports={visibleReports}
            points={initialPoints}
            selectedReportId={selectedReportId}
            onSelectReport={handleSelectReport}
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
            }}
            timeWindow={timeWindow}
            onTimeWindowChange={setTimeWindow}
          />
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-x-2.5 z-10 transition-opacity duration-200 lg:inset-x-3",
          "bottom-[calc(var(--sheet-current)+0.45rem)]",
          (sheetMode === "expanded" || selectedReport) &&
            "max-lg:pointer-events-none max-lg:opacity-0",
          "lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-3 lg:right-[calc(var(--sheet-panel-width)+1.5rem)]"
        )}
      >
        <ActionCards
          onReportClick={() => setReportModalOpen(true)}
          onHelpClick={handleWantsToHelp}
          onFamilyClick={() => setFamilyModalOpen(true)}
        />
      </div>

      <div
        className={cn(
          "pointer-events-auto absolute z-20 flex flex-col overflow-hidden",
          "inset-x-0 bottom-0 h-[var(--sheet-current)] rounded-t-[24px]",
          "transition-[height,opacity] duration-300 ease-out",
          selectedReport && "max-lg:pointer-events-none max-lg:opacity-0",
          "lg:top-3 lg:right-3 lg:bottom-auto lg:left-auto lg:h-[calc(100dvh-24px)] lg:w-[var(--sheet-panel-width)] lg:rounded-[28px] lg:transition-none"
        )}
      >
        <div className="glass pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <SheetHandle
            mode={sheetMode}
            count={visibleReports.length}
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
            {isPointsView ? (
              <CollectionPoints points={initialPoints} />
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-1 rounded-full bg-black/5 p-0.5 dark:bg-white/10">
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
                <p className="mb-1.5 px-1 text-[11px] text-ink-soft">
                  Toca una fila para notas o marcar info falsa
                  {stats.falsa > 0 ? ` · ${stats.falsa} falsos` : ""}
                </p>

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

                {!showSkeleton && visibleReports.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm font-medium text-ink-soft">
                    {dataError
                      ? "No pudimos cargar los reportes."
                      : timeWindow === "6h"
                        ? "No hay reportes de las últimas 6 horas."
                        : "No hay reportes con estos filtros."}
                  </p>
                )}

                {!showSkeleton && visibleReports.length > 0 && (
                  <div className={cn("p-0.5 transition-opacity duration-200", isPending && "opacity-50")}>
                    <DenseReportList
                      reports={visibleReports}
                      selectedId={selectedReportId}
                      scrollRef={listScrollRef}
                      onSelect={(id) => handleSelectReport(id)}
                      onStatusUpdated={handleStatusUpdated}
                    />
                  </div>
                )}
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
          <div className="relative z-10 flex max-h-[min(78dvh,680px)] w-full max-w-md flex-col px-0 lg:max-h-[min(82dvh,720px)]">
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
            <div className="min-h-0 overflow-y-auto overscroll-contain rounded-[22px] shadow-[0_16px_48px_rgba(15,10,8,0.28)]">
              <ReportCard
                report={selectedReport}
                selected
                anchor={false}
                onStatusUpdated={handleStatusUpdated}
              />
            </div>
          </div>
        </div>
      )}

      <RequestHelpModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onCreated={handleReportCreated}
      />
      <FamilyStatusModal open={familyModalOpen} onClose={() => setFamilyModalOpen(false)} />
    </div>
  );
}
