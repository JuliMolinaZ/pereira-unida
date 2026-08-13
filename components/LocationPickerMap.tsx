"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type StyleSpecification } from "maplibre-gl";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import { MAP_DEFAULT_CENTER } from "@/lib/types";

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
}

export default function LocationPickerMap({ lat, lng, onPick }: LocationPickerMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  const usedFallback = useRef(false);
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(VECTOR_STYLE);

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

  return (
    <div ref={wrapRef} className="relative h-52 w-full overflow-hidden rounded-2xl bg-[#0e0e10]">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        workerUrl={WORKER_URL}
        mapStyle={mapStyle}
        initialViewState={{
          latitude: lat ?? MAP_DEFAULT_CENTER.lat,
          longitude: lng ?? MAP_DEFAULT_CENTER.lng,
          zoom: lat !== null ? 16 : 13,
        }}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cursor="crosshair"
        onLoad={() => mapRef.current?.resize()}
        onClick={(e) => {
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
            <div
              className="h-5 w-4 origin-bottom"
              aria-hidden="true"
            >
              <span className="block h-4 w-4 rounded-full border-2 border-white bg-carmine shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
              <span className="mx-auto -mt-0.5 block h-2 w-0.5 bg-carmine" />
            </div>
          </Marker>
        )}
      </Map>

      {lat === null && (
        <p className="glass pointer-events-none absolute inset-x-3 bottom-3 rounded-full px-3 py-1.5 text-center text-[12px] font-medium text-ink">
          Toca el mapa para marcar el punto exacto
        </p>
      )}
    </div>
  );
}
