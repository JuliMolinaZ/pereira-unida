/**
 * Oculta teléfonos y datos bancarios que la gente pega por error en texto
 * libre (título/descripción de un reporte, comentarios) — esos campos son
 * públicos y no pasan por el enmascarado que sí tiene `contact_phone`
 * (columna dedicada, pensada para mostrarse). Se aplica al guardar, no solo
 * al mostrar, para no dejar el dato crudo en la base.
 */

const PHONE_RE = /(?:\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const BANK_RE =
  /(?:nequi|daviplata|bancolombia|davivienda|banco\s*agrario|bbva|ahorros|corriente|cuenta)[\s:#-]*\d{5,15}/gi;

export function sanitizeFreeText(text: string): string {
  if (!text) return text;
  return text
    .replace(BANK_RE, "[dato bancario oculto]")
    .replace(PHONE_RE, "[teléfono oculto]");
}
