import {
  detectPlaceSearch,
  kindsForAmenities,
  knownPlacesForQuery,
  matchesHaystack,
  rankPlaces,
  type MapPlace,
} from "@/lib/places";
import { getCachedAmenities, searchRemotePlaces } from "@/lib/osm";
import { cityById, DEFAULT_CITY_ID, isRisaraldaMetro } from "@/lib/regions";

function dedupe(places: MapPlace[]): MapPlace[] {
  const seen = new Set<string>();
  const out: MapPlace[] = [];
  for (const place of places) {
    const key = `${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out.slice(0, 80);
}

function filterLocal(
  dump: MapPlace[],
  amenities: string[],
  extra: string,
  query: string
): MapPlace[] {
  const kinds = kindsForAmenities(amenities);
  return dump.filter((place) => {
    if (kinds.size > 0 && !kinds.has(place.kind)) return false;
    if (extra) {
      return (
        matchesHaystack(place.name, extra) ||
        matchesHaystack(`${place.name} ${place.address}`, query)
      );
    }
    if (kinds.size === 0) {
      return matchesHaystack(`${place.name} ${place.address}`, query);
    }
    return true;
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const mode = url.searchParams.get("mode");
  const city = cityById(url.searchParams.get("city") || DEFAULT_CITY_ID);
  if (q.length < 2) {
    return Response.json({ places: [] as MapPlace[] });
  }

  const known = isRisaraldaMetro(city) ? knownPlacesForQuery(q) : [];
  const dump = await getCachedAmenities(city.bbox).catch(() => [] as MapPlace[]);
  const { amenities, extra } = detectPlaceSearch(q);
  const local = filterLocal(dump, amenities, extra, q);

  const needRemote =
    mode === "geo"
      ? known.length + local.length < 3
      : amenities.length === 0
        ? known.length + local.length < 3
        : extra
          ? known.length + local.length < 2
          : false;

  const remote = needRemote ? await searchRemotePlaces(q, city.bbox).catch(() => [] as MapPlace[]) : [];

  let merged = dedupe([...known, ...local, ...remote]);
  if (extra) {
    const named = merged.filter(
      (place) =>
        matchesHaystack(place.name, extra) || matchesHaystack(`${place.name} ${place.address}`, q)
    );
    if (named.length > 0) merged = named;
  }

  const places = rankPlaces(merged, q).slice(0, mode === "geo" ? 8 : 80);
  return Response.json(
    { places },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } }
  );
}
