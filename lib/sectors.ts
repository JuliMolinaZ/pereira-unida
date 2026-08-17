/**
 * Filtro rápido por sector/comuna. Los reportes no guardan un campo
 * estructurado de barrio — `location_name` es el texto que devuelve el
 * geocodificador inverso al marcar el pin (ej. "Calle 17, Vasconia, AMCO,
 * Area Metropolitana Centro Occidente"), así que el barrio viaja como
 * substring dentro de ese texto, no como columna propia. Por eso este
 * filtro es por coincidencia de texto, no un cruce contra un listado
 * oficial de comunas — no tenemos cargada esa capa geoespacial (DANE MGN)
 * todavía. Cubre los sectores de más movimiento reportados hasta ahora;
 * sumar el resto es agregar una línea acá, no tocar el resto del código.
 */
export interface SectorQuickFilter {
  id: string;
  label: string;
  /** Términos a buscar en location_name (ademas del label mismo). */
  aliases?: string[];
}

export const SECTOR_QUICK_FILTERS: SectorQuickFilter[] = [
  { id: "cuba", label: "Cuba" },
  { id: "combia", label: "Combia" },
  { id: "parque-industrial", label: "Parque Industrial" },
  { id: "altagracia", label: "Altagracia" },
  { id: "centro", label: "Centro" },
  { id: "los-lirios", label: "Urbanización Los Lirios", aliases: ["Los Lirios"] },
  { id: "danubio", label: "Danubio" },
  {
    id: "dosquebradas-centro",
    label: "Dosquebradas Centro",
    aliases: ["Centro de Dosquebradas"],
  },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function sectorById(id: string): SectorQuickFilter | null {
  return SECTOR_QUICK_FILTERS.find((s) => s.id === id) ?? null;
}

/** ¿El texto de ubicación (location_name / neighborhood / address) menciona este sector? */
export function matchesSector(locationText: string, sector: SectorQuickFilter): boolean {
  if (!locationText) return false;
  const haystack = fold(locationText);
  const terms = [sector.label, ...(sector.aliases ?? [])];
  return terms.some((term) => haystack.includes(fold(term)));
}
