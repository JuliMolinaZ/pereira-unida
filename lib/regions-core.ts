export type GeoBBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export interface AppCity {
  id: string;
  name: string;
  department: string;
  center: [number, number];
  bbox: GeoBBox;
}

export type ZoneQuery = {
  department?: string;
  municipality?: string;
};

const ZONE_KEY = "pereiraunida:city-id";
const ZONE_CITY_KEY = "pereiraunida:city";
const CHOSEN_KEY = "pereiraunida:city-chosen";

export const DEFAULT_CITY_ID = "pereira";
export const DEFAULT_DEPARTMENT = "Risaralda";
export const NATIONAL_CITY_ID = "colombia";

function around(lat: number, lng: number, pad: number): GeoBBox {
  return {
    south: lat - pad,
    north: lat + pad,
    west: lng - pad,
    east: lng + pad,
  };
}

export const NATIONAL_CITY: AppCity = {
  id: NATIONAL_CITY_ID,
  name: "Colombia completa",
  department: "Todo el país",
  center: [4.57, -74.3],
  bbox: { south: -4.3, west: -81.85, north: 13.6, east: -66.7 },
};

export const PEREIRA_CITY: AppCity = {
  id: DEFAULT_CITY_ID,
  name: "Pereira",
  department: DEFAULT_DEPARTMENT,
  center: [4.8143, -75.6946],
  bbox: { south: 4.74, west: -75.8, north: 4.9, east: -75.62 },
};

export const DOSQUEBRADAS_CITY: AppCity = {
  id: "dosquebradas",
  name: "Dosquebradas",
  department: DEFAULT_DEPARTMENT,
  center: [4.8389, -75.6708],
  bbox: around(4.8389, -75.6708, 0.08),
};

const CORE_BY_ID = new Map<string, AppCity>([
  [NATIONAL_CITY.id, NATIONAL_CITY],
  [PEREIRA_CITY.id, PEREIRA_CITY],
  [DOSQUEBRADAS_CITY.id, DOSQUEBRADAS_CITY],
]);

/** Lookup liviano (Pereira / Dosquebradas / Colombia). El catálogo completo vive en regions.ts. */
export function cityById(id: string | null | undefined): AppCity {
  return CORE_BY_ID.get(id ?? "") ?? PEREIRA_CITY;
}

export function isRisaraldaMetro(city: AppCity): boolean {
  return city.id === DEFAULT_CITY_ID || city.id === "dosquebradas";
}

export function isNationwide(city: AppCity | string | null | undefined): boolean {
  const id = typeof city === "string" ? city : city?.id;
  return id === NATIONAL_CITY_ID;
}

export function inBbox(bbox: GeoBBox, lat: number, lng: number): boolean {
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

export function inColombia(lat: number, lng: number): boolean {
  return lat >= -4.4 && lat <= 13.6 && lng >= -82.1 && lng <= -66.7;
}

export function zoneQueryFor(city: AppCity): ZoneQuery {
  if (isNationwide(city)) return {};
  if (isRisaraldaMetro(city)) return { department: city.department };
  return { department: city.department, municipality: city.name };
}

export function isDefaultZone(city: AppCity): boolean {
  if (isNationwide(city)) return false;
  const zone = zoneQueryFor(city);
  return zone.department === DEFAULT_DEPARTMENT && !zone.municipality;
}

export function placesSearchUrl(query: string, cityId: string, mode?: "geo"): string {
  const params = new URLSearchParams({ q: query, city: cityId });
  if (mode) params.set("mode", mode);
  return `/api/places?${params.toString()}`;
}

function isAppCity(value: unknown): value is AppCity {
  if (!value || typeof value !== "object") return false;
  const city = value as AppCity;
  return (
    typeof city.id === "string" &&
    typeof city.name === "string" &&
    typeof city.department === "string" &&
    Array.isArray(city.center) &&
    city.center.length === 2
  );
}

export function readSavedCityId(): string {
  return readSavedCity().id;
}

export function readSavedCity(): AppCity {
  if (typeof window === "undefined") return PEREIRA_CITY;
  try {
    const snap = window.localStorage.getItem(ZONE_CITY_KEY);
    if (snap) {
      const parsed = JSON.parse(snap) as unknown;
      if (isAppCity(parsed)) return parsed;
    }
    const id = window.localStorage.getItem(ZONE_KEY);
    if (id && CORE_BY_ID.has(id)) return CORE_BY_ID.get(id)!;
  } catch {
    /* ignore */
  }
  return PEREIRA_CITY;
}

export function saveCityId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ZONE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function saveCity(city: AppCity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ZONE_KEY, city.id);
    window.localStorage.setItem(ZONE_CITY_KEY, JSON.stringify(city));
  } catch {
    /* ignore */
  }
}

export function readCityChosen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCityChosen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHOSEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
