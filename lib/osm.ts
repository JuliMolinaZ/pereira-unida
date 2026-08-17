import "server-only";
import {
  kindFromOsmTags,
  type MapPlace,
  METRO_BBOX,
} from "@/lib/places";

const USER_AGENT = "PereiraUnida/1.0 (https://pereira-unida.vercel.app)";
const { south, west, north, east } = METRO_BBOX;

const memory = new Map<string, { exp: number; stale: number; value: unknown }>();
let nominatimAt = 0;
let nominatimQueue: Promise<unknown> = Promise.resolve();

function memGet<T>(key: string): { value: T; fresh: boolean } | null {
  const hit = memory.get(key);
  if (!hit) return null;
  const now = Date.now();
  if (now > hit.stale) {
    memory.delete(key);
    return null;
  }
  return { value: hit.value as T, fresh: now < hit.exp };
}

function memSet(key: string, value: unknown, ttlMs: number, staleMs = ttlMs * 3) {
  memory.set(key, { value, exp: Date.now() + ttlMs, stale: Date.now() + staleMs });
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type NominatimHit = {
  osm_id?: number;
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  type?: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
  };
};

export function inBbox(lat: number, lng: number): boolean {
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function parseOsmPlaces(elements: OverpassElement[]): MapPlace[] {
  const places: MapPlace[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !inBbox(lat, lng)) continue;
    const tags = el.tags ?? {};
    const name = tags.name || tags["name:es"] || tags.operator;
    if (!name) continue;
    const address = [tags["addr:street"], tags["addr:housenumber"], tags["addr:suburb"] || tags["addr:city"]]
      .filter(Boolean)
      .join(" ");
    places.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      address,
      lat,
      lng,
      kind: kindFromOsmTags(tags),
    });
  }
  return places;
}

async function fetchOverpassDump(): Promise<MapPlace[]> {
  const query = `[out:json][timeout:18];(
    nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|fire_station|police|shelter|social_facility)$"](${south},${west},${north},${east});
    nwr["healthcare"~"^(hospital|clinic|centre|doctor|pharmacy)$"](${south},${west},${north},${east});
  );out center tags;`;
  const urls = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return parseOsmPlaces(data.elements ?? []);
    } catch {
      continue;
    }
  }
  return [];
}

export async function getCachedAmenities(): Promise<MapPlace[]> {
  const cached = memGet<MapPlace[]>("osm-amenities");
  if (cached?.fresh) return cached.value;
  const places = await fetchOverpassDump();
  if (places.length > 0) {
    memSet("osm-amenities", places, 30 * 60 * 1000, 3 * 60 * 60 * 1000);
    return places;
  }
  return cached?.value ?? [];
}

function parseNominatim(hits: NominatimHit[]): MapPlace[] {
  return hits
    .map((hit) => {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBbox(lat, lng)) return null;
      const addr = hit.address;
      const address = [addr?.road, addr?.neighbourhood ?? addr?.suburb, addr?.city ?? addr?.town]
        .filter(Boolean)
        .join(", ");
      return {
        id: `nom-${hit.osm_id ?? `${lat}-${lng}`}`,
        name: hit.name || hit.display_name?.split(",")[0] || "Lugar",
        address: address || hit.display_name || "",
        lat,
        lng,
        kind: kindFromOsmTags({ amenity: hit.type, healthcare: hit.type }),
      } satisfies MapPlace;
    })
    .filter((place): place is MapPlace => place !== null);
}

async function nominatimSearch(query: string): Promise<MapPlace[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "12");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("accept-language", "es");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  return parseNominatim((await res.json()) as NominatimHit[]);
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    osm_value?: string;
  };
};

async function photonSearch(query: string): Promise<MapPlace[]> {
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", query);
  url.searchParams.set("lat", String((south + north) / 2));
  url.searchParams.set("lon", String((west + east) / 2));
  url.searchParams.set("limit", "12");
  url.searchParams.set("lang", "es");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .map((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return null;
      const [lng, lat] = coords;
      if (!inBbox(lat, lng)) return null;
      const props = feature.properties ?? {};
      const address = [props.street, props.district, props.city].filter(Boolean).join(", ");
      return {
        id: `pho-${props.osm_id ?? `${lat}-${lng}`}`,
        name: props.name || "Lugar",
        address,
        lat,
        lng,
        kind: kindFromOsmTags({ amenity: props.osm_value, healthcare: props.osm_value }),
      } satisfies MapPlace;
    })
    .filter((place): place is MapPlace => place !== null);
}

function enqueueNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = 1100 - (Date.now() - nominatimAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nominatimAt = Date.now();
    return fn();
  });
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function searchRemotePlaces(query: string): Promise<MapPlace[]> {
  const key = `search:${query.toLowerCase()}`;
  const cached = memGet<MapPlace[]>(key);
  if (cached?.fresh) return cached.value;

  const fromNominatim = await enqueueNominatim(() => nominatimSearch(query)).catch(() => [] as MapPlace[]);
  const places = fromNominatim.length > 0 ? fromNominatim : await photonSearch(query).catch(() => [] as MapPlace[]);
  if (places.length > 0) {
    memSet(key, places, 10 * 60 * 1000, 60 * 60 * 1000);
    return places;
  }
  return cached?.value ?? [];
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const hit = (await searchRemotePlaces(q))[0];
  return hit ? { lat: hit.lat, lng: hit.lng, displayName: hit.address || hit.name } : null;
}

export type ReverseGeo = { displayName: string; municipality: "Pereira" | "Dosquebradas" };

function municipalityFromText(text: string): ReverseGeo["municipality"] {
  return text.toLowerCase().includes("dosquebradas") ? "Dosquebradas" : "Pereira";
}

async function nominatimReverse(lat: number, lng: number): Promise<ReverseGeo | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    display_name?: string;
    address?: {
      road?: string;
      neighbourhood?: string;
      suburb?: string;
      city?: string;
      town?: string;
      village?: string;
    };
  };
  const haystack = `${data.display_name ?? ""} ${JSON.stringify(data.address ?? {})}`;
  const addr = data.address;
  const displayName =
    [addr?.road, addr?.neighbourhood ?? addr?.suburb, addr?.city ?? addr?.town ?? addr?.village]
      .filter(Boolean)
      .join(", ") || data.display_name;
  if (!displayName) return null;
  return { displayName, municipality: municipalityFromText(haystack) };
}

async function photonReverse(lat: number, lng: number): Promise<ReverseGeo | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lang", "es");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const props = data.features?.[0]?.properties;
  if (!props) return null;
  const displayName = [props.name, props.street, props.district, props.city].filter(Boolean).join(", ");
  if (!displayName) return null;
  return { displayName, municipality: municipalityFromText(displayName) };
}

export function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export async function reverseGeocodeServer(lat: number, lng: number): Promise<ReverseGeo | null> {
  const key = `rev:${roundCoord(lat)},${roundCoord(lng)}`;
  const cached = memGet<ReverseGeo>(key);
  if (cached?.fresh) return cached.value;

  const fromNominatim = await enqueueNominatim(() => nominatimReverse(lat, lng)).catch(() => null);
  const geo = fromNominatim ?? (await photonReverse(lat, lng).catch(() => null));
  if (geo) {
    memSet(key, geo, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000);
    return geo;
  }
  return cached?.value ?? null;
}
