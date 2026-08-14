import { geocodeAddress } from "@/lib/osm";
import { cityById, cityByName, DEFAULT_CITY_ID } from "@/lib/regions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const cityName = url.searchParams.get("city")?.trim() ?? "";
  if (q.length < 3) {
    return Response.json({ lat: null, lng: null });
  }

  const city = cityByName(cityName) ?? cityById(DEFAULT_CITY_ID);
  const hit = await geocodeAddress(q, city.bbox).catch(() => null);
  return Response.json(
    hit
      ? { lat: hit.lat, lng: hit.lng, displayName: hit.displayName }
      : { lat: null, lng: null },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
}
