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
