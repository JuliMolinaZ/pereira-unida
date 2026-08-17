/**
 * Detecta si un reporte pide un medicamento crítico (control especial o
 * soporte vital) para destacarlo visualmente — una solicitud de insulina no
 * puede perderse entre pedidos de arroz y agua. Es un filtro de texto
 * simple, no un diccionario farmacéutico completo: prioriza no tener falsos
 * negativos en los nombres más comunes reportados, a costa de algún falso
 * positivo ocasional (ej. "quetiapina" mencionada de pasada).
 */
const CRITICAL_KEYWORDS = [
  // Insulinas y diabetes
  "insulina",
  "lantus",
  "glargina",
  "nph",
  "metformina",
  "novorapid",
  // Convulsiones / neurológico
  "fenobarbital",
  "anticonvulsivo",
  "anticonvulsivante",
  "carbamazepina",
  "levetiracetam",
  "acido valproico",
  "ácido valproico",
  // Dolor severo / paliativo / control especial
  "morfina",
  "metadona",
  "fentanilo",
  "tramadol",
  "oxicodona",
  // Psiquiátrico de continuidad
  "quetiapina",
  "clozapina",
  "risperidona",
  "litio",
  "desvenlafaxina",
  "sertralina",
  // Oncológico
  "oncologico",
  "oncológico",
  "quimioterapia",
  "quimio",
  // Cardiovascular crítico
  "losartan",
  "losartán",
  "warfarina",
  "clopidogrel",
  "digoxina",
  // Respiratorio / soporte vital
  "oxigeno",
  "oxígeno",
  "concentrador de oxigeno",
  "concentrador de oxígeno",
  "salbutamol",
  "budesonida",
  // Renal / trasplante
  "dialisis",
  "diálisis",
  "inmunosupresor",
  "tacrolimus",
  "ciclosporina",
] as const;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FOLDED_KEYWORDS = CRITICAL_KEYWORDS.map(fold);

export function isCriticalMedicine(text: string): boolean {
  if (!text) return false;
  const folded = fold(text);
  return FOLDED_KEYWORDS.some((keyword) => folded.includes(keyword));
}

/** Para resaltar el/los términos encontrados dentro de un texto (ver ReportCard). */
export function findCriticalMedicineTerms(text: string): string[] {
  if (!text) return [];
  const folded = fold(text);
  const found = new Set<string>();
  for (let i = 0; i < CRITICAL_KEYWORDS.length; i++) {
    if (folded.includes(FOLDED_KEYWORDS[i])) found.add(CRITICAL_KEYWORDS[i]);
  }
  return [...found];
}
