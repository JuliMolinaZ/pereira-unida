import type { Municipality } from "./types";

interface ReverseGeo {
  displayName: string;
  municipality: Municipality;
}

let inflight: AbortController | null = null;

/**
 * Reverse geocode vía nuestra API (cacheada). No llama a Nominatim
 * desde el navegador para no disparar 429 Too Many Requests.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeo | null> {
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 350);
      controller.signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        },
        { once: true }
      );
    });
    const url = `/api/geocode?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as ReverseGeo | null;
    if (!data?.displayName) return null;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null;
    return null;
  }
}
