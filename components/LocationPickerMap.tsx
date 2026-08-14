"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type StyleSpecification } from "maplibre-gl";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import { Loader2, Search, X } from "lucide-react";
import { MAP_DEFAULT_CENTER } from "@/lib/types";
import type { MapPlace } from "@/lib/places";
import { placesSearchUrl } from "@/lib/regions-core";
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

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  cityId?: string;
  cityName?: string;
  centerLat?: number;
  centerLng?: number;
}

export default function LocationPickerMap({
  lat,
  lng,
  onPick,
  cityId = "pereira",
  cityName = "Pereira",
  centerLat = MAP_DEFAULT_CENTER.lat,
  centerLng = MAP_DEFAULT_CENTER.lng,
}: LocationPickerMapProps) {
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
    if (lat === null || lng === null) return;
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: Math.max(mapRef.current.getZoom() ?? 15, 16),
      duration: 500,
    });
  }, [lat, lng]);

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

  function pickPlace(place: MapPlace) {
    setQuery(place.name);
    setHits([]);
    setOpenList(false);
    onPick(place.lat, place.lng);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <label className="flex h-10 items-center gap-2 rounded-2xl bg-black/5 px-3 dark:bg-white/10">
          <Search className="h-4 w-4 shrink-0 text-ink/50" aria-hidden="true" />
          <span className="sr-only">Buscar una ubicación</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenList(true);
            }}
            onFocus={() => {
              if (hits.length > 0) setOpenList(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (hits[0]) pickPlace(hits[0]);
              }
              if (e.key === "Escape") {
                setOpenList(false);
              }
            }}
            placeholder="Buscar barrio, calle o lugar…"
            autoComplete="off"
            role="combobox"
            aria-expanded={openList && (hits.length > 0 || searching)}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink/45"
          />
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink/50" aria-hidden="true" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setHits([]);
                setOpenList(false);
              }}
              className="text-ink/45"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        {openList && query.trim().length >= 2 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-40 overflow-y-auto rounded-2xl bg-paper py-1 shadow-[0_8px_28px_rgba(28,20,16,0.16)] ring-1 ring-black/8 dark:bg-[#1c1814] dark:ring-white/10"
          >
            {hits.length === 0 && !searching ? (
              <li className="px-3 py-2 text-[12px] text-ink-soft">
                Sin resultados en {cityName}
              </li>
            ) : (
              hits.map((place) => (
                <li key={place.id} role="option">
                  <button
                    type="button"
                    onClick={() => pickPlace(place)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/8"
                  >
                    <span className="text-[13px] leading-snug font-semibold text-ink">
                      {place.name}
                    </span>
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

      <div ref={wrapRef} className="relative h-52 w-full overflow-hidden rounded-2xl bg-[#0e0e10]">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          workerUrl={WORKER_URL}
          mapStyle={mapStyle}
          initialViewState={{
            latitude: lat ?? centerLat,
            longitude: lng ?? centerLng,
            zoom: lat !== null ? 16 : 13,
          }}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          cursor="crosshair"
          onLoad={() => mapRef.current?.resize()}
          onClick={(e) => {
            setOpenList(false);
            onPick(e.lngLat.lat, e.lngLat.lng);
          }}
          onError={() => {
            if (usedFallback.current) return;
            usedFallback.current = true;
            setMapStyle(RASTER_STYLE);
          }}
        >
          {lat !== null && lng !== null && (
            <Marker
              latitude={Number(lat)}
              longitude={Number(lng)}
              anchor="bottom"
              offset={[0, 0]}
              draggable
              onDragEnd={(e) => onPick(e.lngLat.lat, e.lngLat.lng)}
            >
              <div className="h-5 w-4 origin-bottom" aria-hidden="true">
                <span className="block h-4 w-4 rounded-full border-2 border-white bg-carmine shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
                <span className="mx-auto -mt-0.5 block h-2 w-0.5 bg-carmine" />
              </div>
            </Marker>
          )}
        </Map>

        {lat === null && (
          <p className="glass pointer-events-none absolute inset-x-3 bottom-3 rounded-full px-3 py-1.5 text-center text-[12px] font-medium text-ink">
            Toca el mapa o busca para marcar el punto
          </p>
        )}
      </div>
    </div>
  );
}
