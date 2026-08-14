"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type StyleSpecification } from "maplibre-gl";
import Map, { Layer, Marker, Popup, Source, type MapRef } from "react-map-gl/maplibre";
import { Locate, Navigation } from "lucide-react";
import SupportFab from "./SupportFab";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ACOPIO_COLOR,
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  RENTAL_COLOR,
  RENTAL_EMOJI,
  ROAD_HAZARD_RED,
  ROAD_HAZARD_YELLOW,
  CLOSED_ROAD_REASON_LABELS,
  isClosedStatus,
  pinColorForReport,
  type ClosedRoad,
  type CollectionPoint,
  type Rental,
  type Report,
} from "@/lib/types";
import {
  PLACE_COLOR,
  PLACE_EMOJI,
  PLACE_KIND_LABEL,
  type MapPlace,
} from "@/lib/places";
import { cn, googleMapsUrl } from "@/lib/utils";
import type { GeoBBox } from "@/lib/regions-core";

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

function hasMapCoords<T extends { lat: number | null; lng: number | null }>(
  item: T
): item is T & { lat: number; lng: number } {
  return (
    item.lat != null &&
    item.lng != null &&
    Number.isFinite(Number(item.lat)) &&
    Number.isFinite(Number(item.lng))
  );
}

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
  roads?: ClosedRoad[];
  places?: MapPlace[];
  rentals?: Rental[];
  fitSearchResults?: boolean;
  fitRentals?: boolean;
  selectedReportId: string | null;
  selectedPlaceId?: string | null;
  selectedRentalId?: string | null;
  onSelectReport: (id: string) => void;
  onSelectPlace?: (id: string | null) => void;
  onSelectRental?: (id: string) => void;
  onAddClosedRoad?: () => void;
  onReopenRoad?: (id: string) => void;
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  fitBbox?: GeoBBox | null;
  cityName?: string;
}

export default function ReportsMap({
  reports,
  points,
  roads = [],
  places = [],
  rentals = [],
  fitSearchResults = false,
  fitRentals = false,
  selectedReportId,
  selectedPlaceId = null,
  selectedRentalId = null,
  onSelectReport,
  onSelectPlace,
  onSelectRental,
  onAddClosedRoad,
  onReopenRoad,
  centerLat = MAP_DEFAULT_CENTER.lat,
  centerLng = MAP_DEFAULT_CENTER.lng,
  zoom = MAP_DEFAULT_ZOOM,
  fitBbox = null,
  cityName = "Pereira",
}: ReportsMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  const usedFallback = useRef(false);
  const lastSearchFitKey = useRef("");
  const lastRentalFitKey = useRef("");
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(VECTOR_STYLE);
  const [openPointId, setOpenPointId] = useState<string | null>(null);
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  const [openRoadId, setOpenRoadId] = useState<string | null>(null);

  const activeRoads = roads.filter(
    (road) => road.status === "cerrada" && Array.isArray(road.path) && road.path.length >= 2
  );
  const roadsGeojson = {
    type: "FeatureCollection" as const,
    features: activeRoads.map((road) => ({
      type: "Feature" as const,
      properties: { id: road.id, name: road.name, reason: road.reason },
      geometry: {
        type: "LineString" as const,
        coordinates: road.path.map((point) => [point.lng, point.lat] as [number, number]),
      },
    })),
  };

  const geolocatedReports = reports.filter(hasMapCoords);
  const geolocatedPoints = points.filter(hasMapCoords);
  const geolocatedRentals = rentals.filter(hasMapCoords);
  const missingLocationCount = reports.length - geolocatedReports.length;

  const selectedReport = geolocatedReports.find((r) => r.id === selectedReportId);
  const selectedRental = geolocatedRentals.find((item) => item.id === selectedRentalId);
  const openPoint = geolocatedPoints.find((p) => p.id === openPointId);
  const activePlaceId = selectedPlaceId ?? openPlaceId;
  const openPlace = places.find((p) => p.id === activePlaceId) ?? null;
  const pointMapsHref = openPoint ? googleMapsUrl(openPoint.lat, openPoint.lng) : null;
  const placeMapsHref = openPlace ? googleMapsUrl(openPlace.lat, openPlace.lng) : null;
  const openRoad = activeRoads.find((road) => road.id === openRoadId) ?? null;
  const roadPopupPoint = openRoad?.path[Math.floor(openRoad.path.length / 2)] ?? null;

  useEffect(() => {
    if (!selectedReport) return;
    mapRef.current?.flyTo({
      center: [selectedReport.lng, selectedReport.lat],
      zoom: Math.max(mapRef.current.getZoom() ?? MAP_DEFAULT_ZOOM, 15),
      duration: 700,
    });
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedRental || selectedReport) return;
    mapRef.current?.flyTo({
      center: [selectedRental.lng, selectedRental.lat],
      zoom: Math.max(mapRef.current.getZoom() ?? MAP_DEFAULT_ZOOM, 15),
      duration: 700,
    });
  }, [selectedRental, selectedReport]);

  const searchFitKey = `${fitSearchResults ? 1 : 0}:${places.map((p) => p.id).join(",")}:${geolocatedReports.map((r) => r.id).join(",")}:${geolocatedPoints.map((p) => p.id).join(",")}:${geolocatedRentals.map((p) => p.id).join(",")}`;

  useEffect(() => {
    if (!fitSearchResults || selectedReport || openPlace) return;
    if (searchFitKey === lastSearchFitKey.current) return;
    lastSearchFitKey.current = searchFitKey;
    const map = mapRef.current;
    if (!map) return;

    const coords: [number, number][] = [
      ...geolocatedReports.map((r) => [r.lng, r.lat] as [number, number]),
      ...geolocatedPoints.map((p) => [p.lng, p.lat] as [number, number]),
      ...geolocatedRentals.map((p) => [p.lng, p.lat] as [number, number]),
      ...places.map((p) => [p.lng, p.lat] as [number, number]),
    ];
    if (coords.length === 0) return;

    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 15, duration: 700 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
    for (const coord of coords) bounds.extend(coord);
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 160, left: 40, right: 40 },
      maxZoom: 15,
      duration: 800,
    });
  }, [
    searchFitKey,
    fitSearchResults,
    selectedReport,
    openPlace,
    geolocatedReports,
    geolocatedPoints,
    places,
  ]);

  const rentalFitKey = `${fitRentals ? 1 : 0}:${geolocatedRentals.map((item) => item.id).join(",")}`;

  useEffect(() => {
    if (!fitRentals) {
      lastRentalFitKey.current = "";
      return;
    }
    if (selectedRental) return;
    if (geolocatedRentals.length === 0) return;
    if (rentalFitKey === lastRentalFitKey.current) return;
    lastRentalFitKey.current = rentalFitKey;

    const coords = geolocatedRentals.map(
      (item) => [Number(item.lng), Number(item.lat)] as [number, number]
    );

    const run = () => {
      const map = mapRef.current;
      if (!map) return;
      if (coords.length === 1) {
        map.flyTo({ center: coords[0], zoom: 15, duration: 700 });
        return;
      }
      const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      for (const coord of coords) bounds.extend(coord);
      map.fitBounds(bounds, {
        padding: { top: 88, bottom: 200, left: 36, right: 36 },
        maxZoom: 14,
        duration: 800,
      });
    };

    run();
    const retry = window.setTimeout(run, 250);
    return () => window.clearTimeout(retry);
  }, [fitRentals, rentalFitKey, selectedRental, geolocatedRentals]);

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

  function applyCityView(duration: number) {
    const map = mapRef.current;
    if (!map) return;
    if (fitBbox) {
      map.fitBounds(
        [
          [fitBbox.west, fitBbox.south],
          [fitBbox.east, fitBbox.north],
        ],
        {
          padding: { top: 72, bottom: 180, left: 28, right: 28 },
          maxZoom: zoom,
          duration,
        }
      );
      return;
    }
    map.flyTo({
      center: [centerLng, centerLat],
      zoom,
      duration,
    });
  }

  useEffect(() => {
    applyCityView(800);
  }, [centerLat, centerLng, zoom, fitBbox]);

  function recenter() {
    applyCityView(700);
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 isolate z-0 h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        workerUrl={WORKER_URL}
        mapStyle={mapStyle}
        initialViewState={{
          latitude: centerLat,
          longitude: centerLng,
          zoom,
        }}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        attributionControl={{ compact: true }}
        interactiveLayerIds={activeRoads.length > 0 ? ["closed-roads-hit"] : undefined}
        onLoad={() => mapRef.current?.resize()}
        onClick={(e) => {
          const feature = e.features?.find((item) => item.layer.id === "closed-roads-hit");
          const roadId = feature?.properties?.id;
          if (typeof roadId === "string") {
            setOpenRoadId(roadId);
            setOpenPointId(null);
            setOpenPlaceId(null);
            onSelectPlace?.(null);
          }
        }}
        onError={() => {
          if (usedFallback.current) return;
          usedFallback.current = true;
          setMapStyle(RASTER_STYLE);
        }}
      >
        {activeRoads.length > 0 && (
          <Source id="closed-roads" type="geojson" data={roadsGeojson}>
            <Layer
              id="closed-roads-glow"
              type="line"
              paint={{
                "line-color": ROAD_HAZARD_YELLOW,
                "line-width": 12,
                "line-opacity": 0.55,
                "line-blur": 0.4,
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="closed-roads-line"
              type="line"
              paint={{
                "line-color": ROAD_HAZARD_RED,
                "line-width": 4.5,
                "line-dasharray": [1.7, 1.1],
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="closed-roads-hit"
              type="line"
              paint={{ "line-color": "#000000", "line-width": 18, "line-opacity": 0.01 }}
            />
          </Source>
        )}

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
                setOpenPlaceId(null);
                onSelectPlace?.(null);
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
              setOpenPlaceId(null);
              onSelectPlace?.(null);
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

        {geolocatedRentals.map((rental) => {
          const selected = rental.id === selectedRentalId;
          return (
            <Marker
              key={rental.id}
              latitude={Number(rental.lat)}
              longitude={Number(rental.lng)}
              anchor="bottom"
              offset={[0, 0]}
              style={{ zIndex: selected ? 4 : 2 }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setOpenPointId(null);
                setOpenPlaceId(null);
                onSelectPlace?.(null);
                onSelectRental?.(rental.id);
              }}
            >
              <MapPinMarker
                emoji={RENTAL_EMOJI}
                color={RENTAL_COLOR}
                selected={selected}
                dimmed={rental.status !== "disponible"}
                label={`${rental.property_type}: ${rental.neighborhood || rental.address}`}
              />
            </Marker>
          );
        })}

        {places.map((place) => (
          <Marker
            key={place.id}
            latitude={Number(place.lat)}
            longitude={Number(place.lng)}
            anchor="bottom"
            offset={[0, 0]}
            style={{ zIndex: place.id === activePlaceId ? 5 : 3 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setOpenPointId(null);
              setOpenPlaceId(place.id);
              onSelectPlace?.(place.id);
            }}
          >
            <MapPinMarker
              emoji={PLACE_EMOJI[place.kind]}
              color={PLACE_COLOR[place.kind]}
              selected={place.id === activePlaceId}
              label={`${PLACE_KIND_LABEL[place.kind]}: ${place.name}`}
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

        {openPlace && (
          <Popup
            latitude={Number(openPlace.lat)}
            longitude={Number(openPlace.lng)}
            anchor="bottom"
            offset={PIN_POPUP_OFFSET}
            closeButton={false}
            closeOnClick={false}
            onClose={() => {
              setOpenPlaceId(null);
              onSelectPlace?.(null);
            }}
            className="pereira-map-popup"
          >
            <div className="min-w-[170px] space-y-1.5 p-0.5 text-xs text-ink">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                  {PLACE_KIND_LABEL[openPlace.kind]}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpenPlaceId(null);
                    onSelectPlace?.(null);
                  }}
                  className="text-[11px] font-medium text-ink-soft"
                >
                  Cerrar
                </button>
              </div>
              <p className="text-[13px] leading-snug font-semibold">{openPlace.name}</p>
              {openPlace.address ? <p className="text-ink-soft">{openPlace.address}</p> : null}
              {placeMapsHref ? (
                <a
                  href={placeMapsHref}
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

        {openRoad && roadPopupPoint && (
          <Popup
            latitude={roadPopupPoint.lat}
            longitude={roadPopupPoint.lng}
            anchor="bottom"
            offset={18}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setOpenRoadId(null)}
            className="pereira-map-popup"
          >
            <div className="min-w-[180px] space-y-1.5 p-0.5 text-xs text-ink">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-wide text-carmine uppercase">
                  No transitable
                </p>
                <button
                  type="button"
                  onClick={() => setOpenRoadId(null)}
                  className="text-[11px] font-medium text-ink-soft"
                >
                  Cerrar
                </button>
              </div>
              <p className="text-[13px] leading-snug font-semibold">{openRoad.name}</p>
              <p className="text-ink-soft">{CLOSED_ROAD_REASON_LABELS[openRoad.reason]}</p>
              {openRoad.note ? <p className="text-ink-soft">{openRoad.note}</p> : null}
              {onReopenRoad ? (
                <button
                  type="button"
                  onClick={() => {
                    onReopenRoad(openRoad.id);
                    setOpenRoadId(null);
                  }}
                  className="mt-1 flex w-full items-center justify-center rounded-full bg-black/8 px-2 py-1.5 text-[11px] font-semibold"
                >
                  Ya se puede transitar
                </button>
              ) : null}
            </div>
          </Popup>
        )}
      </Map>

      <div className="absolute right-2.5 bottom-[calc(var(--sheet-current)+var(--dock-offset)+0.85rem)] z-10 flex flex-col gap-2 lg:right-[calc(var(--sheet-panel-width)+1.5rem)] lg:bottom-[calc(var(--dock-height)+1.5rem)]">
        <SupportFab />
        {onAddClosedRoad ? (
          <button
            type="button"
            onClick={onAddClosedRoad}
            aria-label="Marcar calle cerrada"
            className="glass flex h-10 w-10 items-center justify-center rounded-full text-[16px] lg:h-11 lg:w-11"
          >
            🚧
          </button>
        ) : null}
        <button
          type="button"
          onClick={recenter}
          aria-label={`Centrar mapa en ${cityName}`}
          className="glass flex h-10 w-10 items-center justify-center rounded-full text-ink lg:h-11 lg:w-11"
        >
          <Locate className="h-[18px] w-[18px]" />
        </button>
      </div>

      {activeRoads.length > 0 && (
        <div className="absolute left-3 bottom-[calc(var(--sheet-current)+var(--dock-offset)+3.4rem)] z-10 lg:bottom-[calc(var(--dock-height)+3.6rem)]">
          <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink">
            <span
              className="inline-block h-1.5 w-6 rounded-full"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${ROAD_HAZARD_RED} 0 7px, ${ROAD_HAZARD_YELLOW} 7px 12px)`,
              }}
              aria-hidden="true"
            />
            {activeRoads.length} vía{activeRoads.length === 1 ? "" : "s"} cerrada
            {activeRoads.length === 1 ? "" : "s"}
          </div>
        </div>
      )}

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
