import { reverseGeocodeServer, roundCoord } from "@/lib/osm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const geo = await reverseGeocodeServer(roundCoord(lat), roundCoord(lng));
  return Response.json(geo, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
