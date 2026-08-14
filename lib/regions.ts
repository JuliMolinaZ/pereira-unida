import rawMunicipalities from "@/lib/data/colombia-municipalities.json";
import {
  DEFAULT_CITY_ID,
  DEFAULT_DEPARTMENT,
  NATIONAL_CITY,
  NATIONAL_CITY_ID,
  cityById as coreCityById,
  inBbox,
  type AppCity,
} from "@/lib/regions-core";

export * from "@/lib/regions-core";

type MuniRow = [string, string, string, number, number, number, number, number, number];

function around(lat: number, lng: number, pad: number) {
  return {
    south: lat - pad,
    north: lat + pad,
    west: lng - pad,
    east: lng + pad,
  };
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Centros urbanos cuando el polígono municipal es demasiado grande para el mapa. */
const CENTER_OVERRIDES: Record<string, { center: [number, number]; bbox?: ReturnType<typeof around> }> = {
  pereira: {
    center: [4.8143, -75.6946],
    bbox: { south: 4.74, west: -75.8, north: 4.9, east: -75.62 },
  },
  dosquebradas: { center: [4.8389, -75.6708] },
  "11001": { center: [4.711, -74.072], bbox: around(4.711, -74.072, 0.22) },
};

const LEGACY_IDS: Record<string, string> = {
  medellin: "05001",
  bello: "05088",
  envigado: "05266",
  itagui: "05360",
  apartado: "05045",
  bogota: "11001",
  soacha: "25754",
  cali: "76001",
  palmira: "76520",
  buenaventura: "76109",
  tulua: "76834",
  quibdo: "27001",
  istmina: "27361",
  cartagena: "13001",
  barranquilla: "08001",
  "santa-marta": "47001",
  valledupar: "20001",
  monteria: "23001",
  sincelejo: "70001",
  cucuta: "54001",
  bucaramanga: "68001",
  barrancabermeja: "68081",
  ibague: "73001",
  neiva: "41001",
  popayan: "19001",
  pasto: "52001",
  villavicencio: "50001",
  yopal: "85001",
  tunja: "15001",
  duitama: "15238",
  riohacha: "44001",
  florencia: "18001",
  mocoa: "86001",
  leticia: "91001",
  "san-andres": "88001",
  magangue: "13430",
  armenia: "63001",
  calarca: "63130",
  manizales: "17001",
  "santa-rosa-de-cabal": "66682",
};

function hydrate(row: MuniRow): AppCity {
  const [id, name, department, lat, lng, south, west, north, east] = row;
  const override = CENTER_OVERRIDES[id];
  return {
    id,
    name,
    department,
    center: override?.center ?? [lat, lng],
    bbox: override?.bbox ?? { south, west, north, east },
  };
}

export const COLOMBIA_CITIES: AppCity[] = (rawMunicipalities as MuniRow[]).map(hydrate);

const CITY_BY_ID = new Map(COLOMBIA_CITIES.map((city) => [city.id, city]));
CITY_BY_ID.set(NATIONAL_CITY_ID, NATIONAL_CITY);
for (const [legacy, id] of Object.entries(LEGACY_IDS)) {
  const city = CITY_BY_ID.get(id);
  if (city) CITY_BY_ID.set(legacy, city);
}

const CITIES_BY_DEPT = new Map<string, AppCity[]>();
for (const city of COLOMBIA_CITIES) {
  const list = CITIES_BY_DEPT.get(city.department);
  if (list) list.push(city);
  else CITIES_BY_DEPT.set(city.department, [city]);
}

export const COLOMBIA_DEPARTMENTS: string[] = [
  DEFAULT_DEPARTMENT,
  ...[...CITIES_BY_DEPT.keys()]
    .filter((name) => name !== DEFAULT_DEPARTMENT)
    .sort((a, b) => a.localeCompare(b, "es")),
];

export function cityById(id: string | null | undefined): AppCity {
  return CITY_BY_ID.get(id ?? "") ?? CITY_BY_ID.get(DEFAULT_CITY_ID) ?? coreCityById(id);
}

export function citiesInDepartment(department: string): AppCity[] {
  const list = CITIES_BY_DEPT.get(department) ?? [];
  return [...list].sort((a, b) => {
    if (a.id === DEFAULT_CITY_ID) return -1;
    if (b.id === DEFAULT_CITY_ID) return 1;
    if (a.id === "dosquebradas") return -1;
    if (b.id === "dosquebradas") return 1;
    return a.name.localeCompare(b.name, "es");
  });
}

export function findDepartments(query: string): string[] {
  const q = fold(query);
  if (!q) return COLOMBIA_DEPARTMENTS;
  return COLOMBIA_DEPARTMENTS.filter((name) => fold(name).includes(q));
}

export function findCities(query: string, department?: string): AppCity[] {
  const q = fold(query);
  const pool = department ? citiesInDepartment(department) : COLOMBIA_CITIES;
  if (!q) return pool;
  return pool.filter(
    (city) => fold(city.name).includes(q) || fold(city.department).includes(q)
  );
}

const QUICK_CITY_IDS = [
  "pereira",
  "dosquebradas",
  "05001",
  "76001",
  "11001",
  "27001",
  "13001",
  "08001",
  "17001",
  "63001",
];

export function suggestedCities(): AppCity[] {
  return QUICK_CITY_IDS.map((id) => cityById(id));
}

const COUNTRY_QUERIES = [
  "colombia",
  "pais",
  "el pais",
  "todo el pais",
  "toda colombia",
  "todo colombia",
  "colombia completa",
  "ver colombia",
  "ver colombia completa",
];

function matchesCountryQuery(q: string): boolean {
  if (COUNTRY_QUERIES.includes(q)) return true;
  if (q.length < 4) return false;
  return COUNTRY_QUERIES.some((alias) => alias.startsWith(q));
}

/** Busca ciudades por nombre. Si escribes un departamento, salen sus ciudades. */
export function searchCities(query: string, limit = 24): AppCity[] {
  const q = fold(query);
  if (!q) return suggestedCities();
  if (matchesCountryQuery(q)) {
    return [NATIONAL_CITY];
  }

  const exactDept = COLOMBIA_DEPARTMENTS.find((name) => fold(name) === q);
  if (exactDept) return citiesInDepartment(exactDept);

  const ranked: { city: AppCity; score: number }[] = [];
  for (const city of COLOMBIA_CITIES) {
    const n = fold(city.name);
    const d = fold(city.department);
    let score = 99;
    if (n === q) score = 0;
    else if (n.startsWith(q)) score = 1;
    else if (n.includes(q)) score = 2;
    else if (d.startsWith(q)) score = 4;
    else if (d.includes(q)) score = 5;
    else continue;
    ranked.push({ city, score });
  }
  ranked.sort(
    (a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name, "es")
  );
  return ranked.slice(0, limit).map((row) => row.city);
}

function bboxArea(bbox: AppCity["bbox"]): number {
  return Math.max(0, bbox.north - bbox.south) * Math.max(0, bbox.east - bbox.west);
}

/** Municipio cuyo bbox contiene el punto; gana el más chico (más preciso). */
export function cityAt(lat: number, lng: number): AppCity | null {
  const hits = COLOMBIA_CITIES.filter((city) => inBbox(city.bbox, lat, lng));
  if (hits.length === 0) return null;
  hits.sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));
  return hits[0];
}

const CITIES_BY_NAME_LENGTH = [...COLOMBIA_CITIES].sort((a, b) => b.name.length - a.name.length);

export function cityFromText(text: string, fallback: AppCity): AppCity {
  const hay = fold(text);
  for (const city of CITIES_BY_NAME_LENGTH) {
    if (fold(city.name).length < 4) continue;
    if (hay.includes(fold(city.name))) return city;
  }
  return fallback;
}

export function isKnownCityName(name: string): boolean {
  const n = fold(name);
  return COLOMBIA_CITIES.some((city) => fold(city.name) === n);
}

export function cityByName(name: string): AppCity | null {
  const n = fold(name);
  return COLOMBIA_CITIES.find((city) => fold(city.name) === n) ?? null;
}

/** Pereira/Dosquebradas se eligen en el metro; el resto usa la ciudad de la zona. */
export function municipalityForPin(city: AppCity, geoCity?: string): string {
  if (city.id === NATIONAL_CITY_ID) {
    if (geoCity && isKnownCityName(geoCity)) return geoCity;
    return "Pereira";
  }
  if (city.id === DEFAULT_CITY_ID || city.id === "dosquebradas") {
    if (geoCity === "Pereira" || geoCity === "Dosquebradas") return geoCity;
    return city.name === "Dosquebradas" ? "Dosquebradas" : "Pereira";
  }
  return city.name;
}
