export type PlaceKind =
  | "hospital"
  | "clinic"
  | "pharmacy"
  | "fire"
  | "police"
  | "shelter"
  | "place";

export interface MapPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
}

/** Pereira + Dosquebradas (lat_min, lng_min, lat_max, lng_max). */
export const METRO_BBOX = {
  south: 4.74,
  west: -75.8,
  north: 4.9,
  east: -75.62,
} as const;

export const PLACE_EMOJI: Record<PlaceKind, string> = {
  hospital: "🏥",
  clinic: "🩺",
  pharmacy: "💊",
  fire: "🚒",
  police: "🚓",
  shelter: "🏠",
  place: "📍",
};

export const PLACE_COLOR: Record<PlaceKind, string> = {
  hospital: "#a61b1b",
  clinic: "#3b6ea5",
  pharmacy: "#2f6b4f",
  fire: "#c2410c",
  police: "#3b6ea5",
  shelter: "#c4a35a",
  place: "#4f6d7a",
};

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  hospital: "Hospital",
  clinic: "Clínica / puesto de salud",
  pharmacy: "Farmacia",
  fire: "Bomberos",
  police: "Policía",
  shelter: "Refugio",
  place: "Lugar",
};

export function foldSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AMENITY_GROUPS: { keys: string[]; amenities: string[]; kind: PlaceKind }[] = [
  {
    keys: ["hospital", "hospitales", "urgencia", "urgencias", "salud"],
    amenities: ["hospital"],
    kind: "hospital",
  },
  {
    keys: ["clinica", "clinicas", "medico", "medicos", "consultorio", "eps"],
    amenities: ["clinic", "doctors"],
    kind: "clinic",
  },
  {
    keys: ["farmacia", "farmacias", "drogueria", "droguerias"],
    amenities: ["pharmacy"],
    kind: "pharmacy",
  },
  {
    keys: ["bombero", "bomberos"],
    amenities: ["fire_station"],
    kind: "fire",
  },
  {
    keys: ["policia", "cai"],
    amenities: ["police"],
    kind: "police",
  },
  {
    keys: ["refugio", "refugios", "albergue", "albergues"],
    amenities: ["social_facility", "shelter"],
    kind: "shelter",
  },
];

export function detectPlaceSearch(query: string): {
  amenities: string[];
  extra: string;
} {
  const folded = foldSearch(query);
  if (!folded) return { amenities: [], extra: "" };

  const words = folded.split(" ");
  const amenities = new Set<string>();
  const extra: string[] = [];

  for (const word of words) {
    const group = AMENITY_GROUPS.find((g) =>
      g.keys.some((key) => word === key || (word.length >= 4 && (word.startsWith(key) || key.startsWith(word))))
    );
    if (group) {
      for (const amenity of group.amenities) amenities.add(amenity);
      continue;
    }
    extra.push(word);
  }

  if (folded.includes("cruz roja")) amenities.add("hospital");

  return { amenities: [...amenities], extra: extra.join(" ") };
}

export function kindsForAmenities(amenities: string[]): Set<PlaceKind> {
  const kinds = new Set<PlaceKind>();
  for (const amenity of amenities) {
    if (amenity === "hospital") kinds.add("hospital");
    if (amenity === "clinic" || amenity === "doctors") kinds.add("clinic");
    if (amenity === "pharmacy") kinds.add("pharmacy");
    if (amenity === "fire_station") kinds.add("fire");
    if (amenity === "police") kinds.add("police");
    if (amenity === "shelter" || amenity === "social_facility") kinds.add("shelter");
  }
  return kinds;
}

export function kindFromOsmTags(tags: Record<string, string | undefined>): PlaceKind {
  const amenity = tags.amenity ?? "";
  const healthcare = tags.healthcare ?? "";
  if (amenity === "hospital" || healthcare === "hospital") return "hospital";
  if (amenity === "clinic" || amenity === "doctors" || healthcare === "clinic") return "clinic";
  if (amenity === "pharmacy") return "pharmacy";
  if (amenity === "fire_station") return "fire";
  if (amenity === "police") return "police";
  if (amenity === "social_facility" || amenity === "shelter") return "shelter";
  return "place";
}

export function matchesHaystack(haystack: string, query: string): boolean {
  const hay = foldSearch(haystack);
  const q = foldSearch(query);
  if (!q) return true;
  return q.split(" ").every((word) => word.length === 0 || hay.includes(word));
}

export function isCollectionPointSearch(query: string): boolean {
  const q = foldSearch(query);
  if (!q) return false;
  return ["acopio", "acopios", "punto", "puntos"].some(
    (key) => q === key || q.includes(key)
  );
}

/** Sedes conocidas que OSM a veces no prioriza en Nominatim. */
export const KNOWN_PLACES: MapPlace[] = [
  {
    id: "known-los-rosales",
    name: "Clínica Los Rosales",
    address: "Cra. 9 #25-25, Pereira",
    lat: 4.81337,
    lng: -75.69988,
    kind: "clinic",
  },
  {
    id: "known-san-jorge",
    name: "Hospital Universitario San Jorge",
    address: "Pereira",
    lat: 4.81809,
    lng: -75.69892,
    kind: "hospital",
  },
  {
    id: "known-comfamiliar",
    name: "Clínica Comfamiliar Pereira",
    address: "Pereira",
    lat: 4.8067,
    lng: -75.68081,
    kind: "hospital",
  },
  {
    id: "known-santa-monica",
    name: "Hospital Santa Mónica",
    address: "Dosquebradas",
    lat: 4.8243,
    lng: -75.67986,
    kind: "hospital",
  },
  {
    id: "known-san-rafael",
    name: "Clínica San Rafael",
    address: "Pereira",
    lat: 4.80408,
    lng: -75.6899,
    kind: "hospital",
  },
  {
    id: "known-cruz-roja",
    name: "Cruz Roja Risaralda",
    address: "Pereira",
    lat: 4.80739,
    lng: -75.6922,
    kind: "shelter",
  },
];

export function knownPlacesForQuery(query: string): MapPlace[] {
  const { amenities, extra } = detectPlaceSearch(query);
  const healthSearch = amenities.some((a) =>
    ["hospital", "clinic", "doctors"].includes(a)
  );
  return KNOWN_PLACES.filter((place) => {
    if (matchesHaystack(`${place.name} ${place.address}`, query)) return true;
    if (!healthSearch) return false;
    if (extra) return matchesHaystack(place.name, extra);
    return place.kind === "hospital" || place.kind === "clinic" || place.kind === "shelter";
  });
}

export function rankPlaces(places: MapPlace[], query: string): MapPlace[] {
  const needle = foldSearch(query);
  const words = needle.split(" ").filter(Boolean);
  const score = (place: MapPlace) => {
    const name = foldSearch(place.name);
    let value = 40;
    if (name === needle) value = 0;
    else if (needle && name.includes(needle)) value = 4;
    else if (words.length > 0 && words.every((word) => name.includes(word))) value = 8;
    else if (matchesHaystack(`${place.name} ${place.address}`, query)) value = 16;
    if (place.id.startsWith("known-")) value -= 1;
    if (place.kind === "hospital" || place.kind === "clinic") value -= 2;
    if (place.name === PLACE_KIND_LABEL[place.kind]) value += 24;
    return value;
  };
  return [...places].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "es"));
}
