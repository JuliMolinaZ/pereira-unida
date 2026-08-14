"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type StyleSpecification } from "maplibre-gl";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import { Loader2, Search, Undo2, X } from "lucide-react";
import { MAP_DEFAULT_CENTER, ROAD_HAZARD_RED, ROAD_HAZARD_YELLOW, type RoadPoint } from "@/lib/types";
import type { MapPlace } from "@/lib/places";
import { placesSearchUrl } from "@/lib/regions";
import "maplibre-gl/dist/maplibre-gl.css";

const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/liberty";
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

interface RoadDrawMapProps {
  path: RoadPoint[];
  onChange: (path: RoadPoint[]) => void;
  cityId?: string;
  cityName?: string;
  centerLat?: number;
  centerLng?: number;
}

export default function RoadDrawMap({
  path,
  onChange,
  cityId = "pereira",
  cityName = "Pereira",
  centerLat = MAP_DEFAULT_CENTER.lat,
  centerLng = MAP_DEFAULT_CENTER.lng,
}: RoadDrawMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  const usedFallback = useRef(false);
  const listId = useId();
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(VECTOR_STYLE);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => mapRef.current?.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const t = window.setTimeout(resize, 80);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetch(placesSearchUrl(q, cityId, "geo"))
        .then((res) => (res.ok ? res.json() : { places: [] }))
        .then((data: { places?: MapPlace[] }) => {
          if (cancelled) return;
          setHits(data.places ?? []);
          setOpenList(true);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, cityId]);

  const lineData = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: path.map((point) => [point.lng, point.lat] as [number, number]),
    },
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <label className="flex h-10 items-center gap-2 rounded-2xl bg-black/5 px-3 dark:bg-white/10">
          <Search className="h-4 w-4 shrink-0 text-ink/50" aria-hidden="true" />
          <span className="sr-only">Buscar la calle para centrar el mapa</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenList(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const place = hits[0];
                if (place) {
                  mapRef.current?.flyTo({
                    center: [place.lng, place.lat],
                    zoom: 16,
                    duration: 500,
                  });
                  setQuery(place.name);
                  setOpenList(false);
                }
              }
              if (e.key === "Escape") setOpenList(false);
            }}
            placeholder="Busca la calle y luego tócala en el mapa"
            autoComplete="off"
            role="combobox"
            aria-expanded={openList && hits.length > 0}
            aria-controls={listId}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink/45"
          />
          {searching ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink/50" /> : null}
        </label>
        {openList && query.trim().length >= 2 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-36 overflow-y-auto rounded-2xl bg-paper py-1 shadow-[0_8px_28px_rgba(28,20,16,0.16)] ring-1 ring-black/8 dark:bg-[#1c1814]"
          >
            {hits.length === 0 && !searching ? (
              <li className="px-3 py-2 text-[12px] text-ink-soft">Sin resultados en {cityName}</li>
            ) : (
              hits.map((place) => (
                <li key={place.id} role="option">
                  <button
                    type="button"
                    onClick={() => {
                      mapRef.current?.flyTo({
                        center: [place.lng, place.lat],
                        zoom: 16,
                        duration: 500,
                      });
                      setQuery(place.name);
                      setOpenList(false);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-black/5"
                  >
                    <span className="text-[13px] font-semibold text-ink">{place.name}</span>
                    {place.address ? (
                      <span className="line-clamp-1 text-[11px] text-ink-soft">{place.address}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div ref={wrapRef} className="relative h-56 w-full overflow-hidden rounded-2xl bg-[#0e0e10]">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          workerUrl={WORKER_URL}
          mapStyle={mapStyle}
          initialViewState={{
            latitude: centerLat,
            longitude: centerLng,
            zoom: 14,
          }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          cursor="crosshair"
          onLoad={() => mapRef.current?.resize()}
          onClick={(e) => {
            setOpenList(false);
            onChange([...path, { lat: e.lngLat.lat, lng: e.lngLat.lng }].slice(0, 40));
          }}
          onError={() => {
            if (usedFallback.current) return;
            usedFallback.current = true;
            setMapStyle(RASTER_STYLE);
          }}
        >
          {path.length >= 2 && (
            <Source id="draft-road" type="geojson" data={lineData}>
              <Layer
                id="draft-road-glow"
                type="line"
                paint={{ "line-color": ROAD_HAZARD_YELLOW, "line-width": 10, "line-opacity": 0.55 }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
              <Layer
                id="draft-road-line"
                type="line"
                paint={{
                  "line-color": ROAD_HAZARD_RED,
                  "line-width": 4,
                  "line-dasharray": [1.6, 1.1],
                }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
            </Source>
          )}
          {path.map((point, index) => (
            <Marker
              key={`${point.lat}-${point.lng}-${index}`}
              latitude={point.lat}
              longitude={point.lng}
              anchor="center"
            >
              <span
                className="block h-2.5 w-2.5 rounded-full border-2 border-white bg-carmine shadow"
                aria-hidden="true"
              />
            </Marker>
          ))}
        </Map>
        <p className="glass pointer-events-none absolute inset-x-3 bottom-3 rounded-full px-3 py-1.5 text-center text-[12px] font-medium text-ink">
          {path.length < 2
            ? "Toca el inicio y el fin del tramo cerrado"
            : `${path.length} puntos · sigue tocando para alargar`}
        </p>
      </div>

      {path.length > 0 && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange(path.slice(0, -1))}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-black/5 text-[13px] font-medium text-ink dark:bg-white/10"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Borrar último
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex min-h-10 items-center justify-center gap-1 rounded-2xl bg-black/5 px-3 text-[13px] font-medium text-ink dark:bg-white/10"
            aria-label="Limpiar tramo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
