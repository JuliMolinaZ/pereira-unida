import type { Municipality } from "./types";

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
}

interface NominatimReverse {
  display_name?: string;
  address?: NominatimAddress;
}

/**
 * Reverse geocode gratis (Nominatim / OpenStreetMap). Solo se llama al
 * pulsar "Usar mi ubicación"; respeta el uso ocasional de Nominatim.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ displayName: string; municipality: Municipality } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as NominatimReverse;
  const haystack = `${data.display_name ?? ""} ${JSON.stringify(data.address ?? {})}`.toLowerCase();
  const municipality: Municipality = haystack.includes("dosquebradas")
    ? "Dosquebradas"
    : "Pereira";

  const addr = data.address;
  const displayName =
    [addr?.road, addr?.neighbourhood ?? addr?.suburb, addr?.city ?? addr?.town ?? addr?.village]
      .filter(Boolean)
      .join(", ") || data.display_name;

  if (!displayName) return null;
  return { displayName, municipality };
}
