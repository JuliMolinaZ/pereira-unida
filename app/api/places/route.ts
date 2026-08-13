import {
  detectPlaceSearch,
  kindFromOsmTags,
  matchesHaystack,
  PLACE_KIND_LABEL,
  type MapPlace,
  METRO_BBOX,
} from "@/lib/places";

export const dynamic = "force-dynamic";

const USER_AGENT = "PereiraUnida/1.0 (https://pereira-unida.vercel.app)";
const { south, west, north, east } = METRO_BBOX;

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
  class?: string;
  type?: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
  };
};

function inBbox(lat: number, lng: number): boolean {
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function dedupe(places: MapPlace[]): MapPlace[] {
  const seen = new Set<string>();
  const out: MapPlace[] = [];
  for (const place of places) {
    const key = `${place.lat.toFixed(4)}:${place.lng.toFixed(4)}:${place.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out.slice(0, 100);
}

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function overpassFilters(amenities: string[]): string {
  const parts: string[] = [];
  for (const amenity of amenities) {
    parts.push(`nwr["amenity"="${amenity}"](${south},${west},${north},${east});`);
    if (amenity === "hospital") {
      parts.push(`nwr["healthcare"="hospital"](${south},${west},${north},${east});`);
    }
    if (amenity === "clinic" || amenity === "doctors") {
      parts.push(`nwr["healthcare"="clinic"](${south},${west},${north},${east});`);
      parts.push(`nwr["healthcare"="centre"](${south},${west},${north},${east});`);
      parts.push(`nwr["healthcare"="doctor"](${south},${west},${north},${east});`);
    }
    if (amenity === "pharmacy") {
      parts.push(`nwr["healthcare"="pharmacy"](${south},${west},${north},${east});`);
    }
    if (amenity === "shelter" || amenity === "social_facility") {
      parts.push(`nwr["social_facility"="shelter"](${south},${west},${north},${east});`);
    }
  }
  return parts.join("");
}

async function fetchOverpass(amenities: string[]): Promise<MapPlace[]> {
  if (amenities.length === 0) return [];
  const query = `[out:json][timeout:18];(${overpassFilters(amenities)});out center tags;`;
  let res: Response | null = null;
  for (const url of OVERPASS_URLS) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
  }
  if (!res?.ok) return [];
  const data = (await res.json()) as { elements?: OverpassElement[] };
  const places: MapPlace[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !inBbox(lat, lng)) continue;
    const tags = el.tags ?? {};
    const kind = kindFromOsmTags(tags);
    const name = tags.name || tags["name:es"] || tags.operator || PLACE_KIND_LABEL[kind];
    const address = [tags["addr:street"], tags["addr:housenumber"], tags["addr:suburb"] || tags["addr:city"]]
      .filter(Boolean)
      .join(" ");
    places.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      address,
      lat,
      lng,
      kind,
    });
  }
  return places;
}

async function fetchNominatim(query: string): Promise<MapPlace[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "25");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("accept-language", "es");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const hits = (await res.json()) as NominatimHit[];
  return hits
    .map((hit) => {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBbox(lat, lng)) return null;
      const addr = hit.address;
      const address = [addr?.road, addr?.neighbourhood ?? addr?.suburb, addr?.city ?? addr?.town]
        .filter(Boolean)
        .join(", ");
      const tags = { amenity: hit.type, healthcare: hit.type };
      return {
        id: `nom-${hit.osm_id ?? `${lat}-${lng}`}`,
        name: hit.name || hit.display_name?.split(",")[0] || "Lugar",
        address: address || hit.display_name || "",
        lat,
        lng,
        kind: kindFromOsmTags(tags),
      } satisfies MapPlace;
    })
    .filter((place): place is MapPlace => place !== null);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const mode = url.searchParams.get("mode");
  if (q.length < 2) {
    return Response.json({ places: [] as MapPlace[] });
  }

  if (mode === "geo") {
    const nominatim = await fetchNominatim(q).catch(() => [] as MapPlace[]);
    return Response.json(
      { places: dedupe(nominatim).slice(0, 8) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  }

  const { amenities, extra } = detectPlaceSearch(q);
  const nominatimQuery = extra || q;

  const [overpass, nominatimRaw] = await Promise.all([
    fetchOverpass(amenities).catch(() => [] as MapPlace[]),
    fetchNominatim(nominatimQuery).catch(() => [] as MapPlace[]),
  ]);

  const amenityKinds = new Set<MapPlace["kind"]>(
    amenities.flatMap((amenity) => {
      if (amenity === "hospital") return ["hospital" as const];
      if (amenity === "clinic" || amenity === "doctors") return ["clinic" as const];
      if (amenity === "pharmacy") return ["pharmacy" as const];
      if (amenity === "fire_station") return ["fire" as const];
      if (amenity === "police") return ["police" as const];
      if (amenity === "shelter" || amenity === "social_facility") return ["shelter" as const];
      return [];
    })
  );
  const nominatim =
    amenityKinds.size > 0
      ? nominatimRaw.filter((place) => amenityKinds.has(place.kind))
      : nominatimRaw;

  let merged = dedupe([...overpass, ...nominatim]);
  if (extra && amenities.length > 0) {
    const named = merged.filter((place) => matchesHaystack(place.name, extra));
    if (named.length > 0) merged = named;
  }

  return Response.json(
    { places: merged },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
