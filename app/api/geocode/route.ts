import { geocodeAddress, reverseGeocodeServer } from "@/lib/osm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");

  if (latRaw !== null && lngRaw !== null) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ displayName: null, municipality: null });
    }
    const geo = await reverseGeocodeServer(lat, lng).catch(() => null);
    return Response.json(geo ?? { displayName: null, municipality: null }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  }

  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return Response.json({ lat: null, lng: null });
  }

  const hit = await geocodeAddress(q).catch(() => null);
  return Response.json(
    hit
      ? { lat: hit.lat, lng: hit.lng, displayName: hit.displayName }
      : { lat: null, lng: null },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
}
