"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type StyleSpecification } from "maplibre-gl";
import Map, { Marker, Popup, type MapRef } from "react-map-gl/maplibre";
import { Locate, Navigation } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ACOPIO_COLOR,
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  isClosedStatus,
  pinColorForReport,
  type CollectionPoint,
  type Report,
} from "@/lib/types";
import { cn, googleMapsUrl } from "@/lib/utils";

/** Estilo vectorial libre (OpenFreeMap / OSM). Sin API key. */
const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Respaldo raster (Carto Voyager / OSM) si el estilo vectorial falla. */
const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const PIN_POPUP_OFFSET = 62;

function mixHex(hex: string, target: string, amount: number): string {
  const parse = (h: string) => {
    const n = h.replace("#", "");
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function MapPinMarker({
  emoji,
  color,
  selected = false,
  dimmed = false,
  label,
}: {
  emoji: string;
  color: string;
  selected?: boolean;
  dimmed?: boolean;
  label: string;
}) {
  const uid = useId().replace(/:/g, "");
  const highlight = mixHex(color, "#ffffff", 0.38);
  const shade = mixHex(color, "#1c1410", 0.42);
  const width = selected ? 44 : 38;
  const height = selected ? 58 : 50;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "map-pin-3d relative block appearance-none border-0 bg-transparent p-0",
        selected ? "z-10 origin-bottom" : "origin-bottom"
      )}
      style={{
        width,
        height,
        opacity: dimmed ? 0.72 : 1,
      }}
    >
      <span className="map-pin-shadow" aria-hidden="true" />
      <svg
        viewBox="0 0 40 51.7"
        className="relative h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`pin-body-${uid}`} x1="18%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor={highlight} />
            <stop offset="42%" stopColor={color} />
            <stop offset="100%" stopColor={shade} />
          </linearGradient>
          <radialGradient id={`pin-well-${uid}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f3ede4" />
          </radialGradient>
          <linearGradient id={`pin-shine-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M20 1.4C10.2 1.4 2.2 9.3 2.2 19.1c0 14.2 17.8 32.6 17.8 32.6S37.8 33.3 37.8 19.1C37.8 9.3 29.8 1.4 20 1.4z"
          fill={`url(#pin-body-${uid})`}
          stroke="#fff"
          strokeWidth={selected ? 2.4 : 2}
        />
        <path
          d="M20 2.8C12.2 2.8 5.8 8.6 5.2 16.2c-.15 1.8 1.3 2.6 2.7 1.7 3.6-2.3 7.5-4.6 12.1-4.6 2.4 0 4.6.6 6.4 1.6 1.5.8 3.2.1 3.4-1.6C30.4 7.8 25.8 2.8 20 2.8z"
          fill={`url(#pin-shine-${uid})`}
        />
        <circle
          cx="20"
          cy="18.2"
          r="11.2"
          fill={`url(#pin-well-${uid})`}
          stroke={shade}
          strokeOpacity="0.22"
          strokeWidth="1"
        />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[3px] right-0 left-0 flex h-[58%] items-center justify-center leading-none"
        style={{ fontSize: selected ? 18 : 16 }}
      >
        {emoji}
      </span>
    </button>
  );
}

interface ReportsMapProps {
  reports: Report[];
  points: CollectionPoint[];
  selectedReportId: string | null;
  onSelectReport: (id: string) => void;
}

export default function ReportsMap({
  reports,
  points,
  selectedReportId,
  onSelectReport,
}: ReportsMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  const usedFallback = useRef(false);
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(VECTOR_STYLE);
  const [openPointId, setOpenPointId] = useState<string | null>(null);

  const geolocatedReports = reports.filter(
    (r): r is Report & { lat: number; lng: number } => r.lat !== null && r.lng !== null
  );
  const geolocatedPoints = points.filter(
    (p): p is CollectionPoint & { lat: number; lng: number } => p.lat !== null && p.lng !== null
  );
  const missingLocationCount = reports.length - geolocatedReports.length;

  const selectedReport = geolocatedReports.find((r) => r.id === selectedReportId);
  const openPoint = geolocatedPoints.find((p) => p.id === openPointId);
  const pointMapsHref = openPoint ? googleMapsUrl(openPoint.lat, openPoint.lng) : null;

  useEffect(() => {
    if (!selectedReport) return;
    mapRef.current?.flyTo({
      center: [selectedReport.lng, selectedReport.lat],
      zoom: Math.max(mapRef.current.getZoom() ?? MAP_DEFAULT_ZOOM, 15),
      duration: 700,
    });
  }, [selectedReport]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => mapRef.current?.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const t1 = window.setTimeout(resize, 80);
    const t2 = window.setTimeout(resize, 400);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  function recenter() {
    mapRef.current?.flyTo({
      center: [MAP_DEFAULT_CENTER.lng, MAP_DEFAULT_CENTER.lat],
      zoom: MAP_DEFAULT_ZOOM,
      duration: 700,
    });
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 isolate z-0 h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        workerUrl={WORKER_URL}
        mapStyle={mapStyle}
        initialViewState={{
          latitude: MAP_DEFAULT_CENTER.lat,
          longitude: MAP_DEFAULT_CENTER.lng,
          zoom: MAP_DEFAULT_ZOOM,
        }}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        attributionControl={{ compact: true }}
        onLoad={() => mapRef.current?.resize()}
        onError={() => {
          if (usedFallback.current) return;
          usedFallback.current = true;
          setMapStyle(RASTER_STYLE);
        }}
      >
        {geolocatedReports.map((report) => {
          const selected = report.id === selectedReportId;
          return (
            <Marker
              key={report.id}
              latitude={Number(report.lat)}
              longitude={Number(report.lng)}
              anchor="bottom"
              offset={[0, 0]}
              style={{ zIndex: selected ? 4 : isClosedStatus(report.status) ? 1 : 2 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setOpenPointId(null);
                onSelectReport(report.id);
              }}
            >
              <MapPinMarker
                emoji={CATEGORY_EMOJI[report.category]}
                color={pinColorForReport(report)}
                selected={selected}
                dimmed={isClosedStatus(report.status)}
                label={`${CATEGORY_LABELS[report.category]}: ${report.title}`}
              />
            </Marker>
          );
        })}

        {geolocatedPoints.map((point) => (
          <Marker
            key={point.id}
            latitude={Number(point.lat)}
            longitude={Number(point.lng)}
            anchor="bottom"
            offset={[0, 0]}
            style={{ zIndex: point.id === openPointId ? 2 : 1 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setOpenPointId(point.id);
            }}
          >
            <MapPinMarker
              emoji="📦"
              color={ACOPIO_COLOR}
              selected={point.id === openPointId}
              label={`Punto de acopio: ${point.name}`}
            />
          </Marker>
        ))}

        {openPoint && (
          <Popup
            latitude={Number(openPoint.lat)}
            longitude={Number(openPoint.lng)}
            anchor="bottom"
            offset={PIN_POPUP_OFFSET}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setOpenPointId(null)}
            className="pereira-map-popup"
          >
            <div className="min-w-[170px] space-y-1.5 p-0.5 text-xs text-ink">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                  Punto de acopio
                </p>
                <button
                  type="button"
                  onClick={() => setOpenPointId(null)}
                  className="text-[11px] font-medium text-ink-soft"
                >
                  Cerrar
                </button>
              </div>
              <p className="text-[13px] leading-snug font-semibold">{openPoint.name}</p>
              <p className="text-ink-soft">{openPoint.address}</p>
              {openPoint.open_hours && (
                <p className="text-[11px] text-ink-soft">{openPoint.open_hours}</p>
              )}
              {pointMapsHref ? (
                <a
                  href={pointMapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-full bg-black/8 px-2 py-1.5 text-[11px] font-semibold"
                >
                  <Navigation className="h-3 w-3" aria-hidden="true" />
                  Cómo llegar
                </a>
              ) : null}
            </div>
          </Popup>
        )}
      </Map>

      <button
        type="button"
        onClick={recenter}
        aria-label="Centrar mapa en Pereira / Dosquebradas"
        className="glass absolute right-2.5 bottom-[calc(var(--sheet-current)+var(--dock-offset)+0.85rem)] z-10 flex h-10 w-10 items-center justify-center rounded-full text-ink lg:right-[calc(var(--sheet-panel-width)+1.5rem)] lg:bottom-[calc(var(--dock-height)+1.5rem)] lg:h-11 lg:w-11"
      >
        <Locate className="h-[18px] w-[18px]" />
      </button>

      {missingLocationCount > 0 && (
        <div className="absolute left-3 bottom-[calc(var(--sheet-current)+var(--dock-offset)+1.25rem)] z-10 max-w-[min(72vw,240px)] lg:bottom-[calc(var(--dock-height)+1.5rem)]">
          <div className="glass rounded-full px-3 py-1.5 text-xs font-medium text-ink">
            {missingLocationCount}{" "}
            {missingLocationCount === 1
              ? "reporte sin ubicación en el mapa"
              : "reportes sin ubicación en el mapa"}
          </div>
        </div>
      )}
    </div>
  );
}
