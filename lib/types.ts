export type ReportCategory =
  | "alimentos"
  | "herramientas"
  | "medicinas"
  | "voluntariado"
  | "otros"
  | "herramientas_rescate"
  | "conectividad_energia"
  | "mascotas"
  | "revision_ingenieria"
  | "transporte_logistica";

export type UrgentLevel = "critico" | "moderado" | "atendido";

export type ReportStatus =
  | "buscando"
  | "en_camino"
  | "resuelto"
  | "informacion_falsa"
  | "duplicado";

export type Municipality = "Pereira" | "Dosquebradas";

export interface Report {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  urgent_level: UrgentLevel;
  status: ReportStatus;
  municipality: Municipality;
  location_name: string;
  lat: number | null;
  lng: number | null;
  contact_phone: string;
  photo_urls: string[];
  comments_count: number;
  created_at: string;
  last_confirmed_at?: string | null;
}

export interface Comment {
  id: string;
  report_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface CollectionPoint {
  id: string;
  name: string;
  address: string;
  municipality: Municipality;
  supplies_needed: string[];
  open_hours: string;
  contact: string;
  lat: number | null;
  lng: number | null;
}

export type PersonStatus = "a_salvo" | "necesito_traslado" | "sin_conexion";

export interface PeopleStatus {
  id: string;
  full_name: string;
  document_id: string | null;
  municipality: Municipality;
  neighborhood: string;
  lat: number | null;
  lng: number | null;
  status: PersonStatus;
  contact_number: string;
  photo_urls: string[];
  created_at: string;
}

/** Centro geográfico aproximado de Pereira, Risaralda. */
export const PEREIRA_CENTER: [number, number] = [4.8143, -75.6946];

/** Centro geográfico aproximado de Dosquebradas, Risaralda. */
export const DOSQUEBRADAS_CENTER: [number, number] = [4.8389, -75.6708];

export const MUNICIPALITIES: Municipality[] = ["Pereira", "Dosquebradas"];

export const MUNICIPALITY_CENTERS: Record<Municipality, [number, number]> = {
  Pereira: PEREIRA_CENTER,
  Dosquebradas: DOSQUEBRADAS_CENTER,
};

/** Centro por defecto del mapa, cubriendo
 * el área metropolitana Pereira / Dosquebradas. */
export const MAP_DEFAULT_CENTER: { lat: number; lng: number } = {
  lat: 4.8133,
  lng: -75.6961,
};

export const MAP_DEFAULT_ZOOM = 13;

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  alimentos: "Alimentos y Agua",
  herramientas: "Herramientas y Cascos",
  medicinas: "Medicinas",
  voluntariado: "Voluntariado",
  otros: "Otros",
  herramientas_rescate: "Herramientas de Rescate",
  conectividad_energia: "Energía / Wifi",
  mascotas: "Mascotas",
  revision_ingenieria: "Revisión de Ingeniería",
  transporte_logistica: "Transporte y Logística",
};

export const CATEGORY_EMOJI: Record<ReportCategory, string> = {
  alimentos: "🍲",
  herramientas: "🛠️",
  medicinas: "🩺",
  voluntariado: "🤝",
  otros: "📦",
  herramientas_rescate: "⛑️",
  conectividad_energia: "⚡",
  mascotas: "🐶",
  revision_ingenieria: "🏗️",
  transporte_logistica: "🚚",
};

/** Color intenso del pin (y tinte suave de los filtros). */
export const CATEGORY_COLORS: Record<ReportCategory, string> = {
  alimentos: "#c47a1b",
  medicinas: "#a61b1b",
  herramientas: "#8a5a2b",
  herramientas_rescate: "#c2410c",
  mascotas: "#b4532a",
  conectividad_energia: "#ca8a04",
  revision_ingenieria: "#3b6ea5",
  transporte_logistica: "#2f6b4f",
  voluntariado: "#4f6d7a",
  otros: "#6b6560",
};

export const ACOPIO_COLOR = "#c4a35a";

export const MUNICIPALITY_COLORS: Record<Municipality, string> = {
  Pereira: "#a61b1b",
  Dosquebradas: "#3b6ea5",
};

export function pinColorForReport(report: Pick<Report, "category">): string {
  return CATEGORY_COLORS[report.category];
}

export const URGENCY_EMOJI: Record<UrgentLevel, string> = {
  critico: "🔴",
  moderado: "🟡",
  atendido: "🟢",
};

/** Subconjunto de categorías mostradas como pills grandes en los filtros
 * rápidos de la pantalla principal (UX de emergencia: pocas opciones,
 * legibles a golpe de vista). */
export const QUICK_CATEGORY_FILTERS: {
  key: ReportCategory | "todos";
  label: string;
  emoji: string;
}[] = [
  { key: "todos", label: "Todos", emoji: "🔎" },
  { key: "alimentos", label: "Comida", emoji: "🍲" },
  { key: "medicinas", label: "Salud", emoji: "🩺" },
  { key: "herramientas", label: "Herramientas", emoji: "🛠️" },
  { key: "herramientas_rescate", label: "Rescate", emoji: "⛑️" },
  { key: "mascotas", label: "Mascotas", emoji: "🐶" },
  { key: "conectividad_energia", label: "Luz/Wifi", emoji: "⚡" },
  { key: "revision_ingenieria", label: "Ingeniería", emoji: "🏗️" },
  { key: "transporte_logistica", label: "Transporte", emoji: "🚚" },
  { key: "voluntariado", label: "Voluntarios", emoji: "🤝" },
  { key: "otros", label: "Otros", emoji: "📦" },
];

export const CATEGORY_DESCRIPTIONS: Partial<Record<ReportCategory, string>> = {
  herramientas_rescate: "Discos de corte, gasolina, guantes, cascos, linternas",
  conectividad_energia: "Puntos de carga de celulares, internet satelital",
  mascotas: "Perdidas, encontradas, alimento veterinario",
  revision_ingenieria: "Inspección voluntaria de vigas y estructuras por ingenieros",
  transporte_logistica: "Camionetas 4x4, furgones, motocarros",
};

export const URGENCY_LABELS: Record<UrgentLevel, string> = {
  critico: "Crítico",
  moderado: "Moderado",
  atendido: "Atendido",
};

/** Colores del sello (carmine / ocre / bosque) reutilizados en el mapa,
 * donde las clases de Tailwind no están disponibles. */
export const URGENCY_COLORS: Record<UrgentLevel, string> = {
  critico: "#a61b1b",
  moderado: "#c47a1b",
  atendido: "#2f6b4f",
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  buscando: "Buscando ayuda",
  en_camino: "En camino",
  resuelto: "Resuelto",
  informacion_falsa: "Info falsa",
  duplicado: "Duplicado",
};

export const STATUS_PIN_COLORS: Record<ReportStatus, string> = {
  buscando: "#a61b1b",
  en_camino: "#3b6ea5",
  resuelto: "#2f6b4f",
  informacion_falsa: "#6b6560",
  duplicado: "#8a8078",
};

export const CLOSED_STATUSES: ReportStatus[] = [
  "resuelto",
  "informacion_falsa",
  "duplicado",
];

export function isClosedStatus(status: ReportStatus): boolean {
  return status === "resuelto" || status === "informacion_falsa" || status === "duplicado";
}

export const STATUS_ACTIONS: {
  status: ReportStatus;
  label: string;
  kind: "help" | "done" | "flag";
}[] = [
  { status: "en_camino", label: "Voy en camino", kind: "help" },
  { status: "resuelto", label: "Marcar como resuelto", kind: "done" },
  { status: "informacion_falsa", label: "Información falsa", kind: "flag" },
  { status: "duplicado", label: "Es duplicado", kind: "flag" },
];

export const STATUS_FLOW: Record<ReportStatus, ReportStatus> = {
  buscando: "en_camino",
  en_camino: "resuelto",
  resuelto: "buscando",
  informacion_falsa: "buscando",
  duplicado: "buscando",
};

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  a_salvo: "A salvo",
  necesito_traslado: "Necesita traslado",
  sin_conexion: "Sin conexión",
};

export const PERSON_STATUS_COLORS: Record<PersonStatus, string> = {
  a_salvo: "#2f6b4f",
  necesito_traslado: "#a61b1b",
  sin_conexion: "#c47a1b",
};

export type ClosedRoadReason =
  | "derrumbe"
  | "inundacion"
  | "arbol"
  | "hundimiento"
  | "bloqueo"
  | "otro";

export type ClosedRoadStatus = "cerrada" | "reabierta";

export interface RoadPoint {
  lat: number;
  lng: number;
}

export interface ClosedRoad {
  id: string;
  name: string;
  reason: ClosedRoadReason;
  note: string;
  municipality: Municipality;
  path: RoadPoint[];
  status: ClosedRoadStatus;
  created_at: string;
}

export const CLOSED_ROAD_REASON_LABELS: Record<ClosedRoadReason, string> = {
  derrumbe: "Derrumbe",
  inundacion: "Inundación",
  arbol: "Árbol o escombros",
  hundimiento: "Hundimiento / grieta",
  bloqueo: "Bloqueo",
  otro: "Otro",
};

export const CLOSED_ROAD_REASONS = Object.keys(
  CLOSED_ROAD_REASON_LABELS
) as ClosedRoadReason[];

export const ROAD_HAZARD_YELLOW = "#e2b340";
export const ROAD_HAZARD_RED = "#a61b1b";

/** Enmascara un documento de identidad dejando solo los últimos 4 dígitos
 * visibles (privacidad en resultados de búsqueda pública). */
export function maskDocumentId(id: string | null): string | null {
  if (!id) return null;
  const d = id.replace(/\s/g, "");
  if (d.length <= 4) return "****";
  return "****" + d.slice(-4);
}

/** Resultado de getHomeData(): datos iniciales de la home + un mensaje de
 * error en español si Supabase no está configurado o no respondió. */
export interface HomeData {
  reports: Report[];
  points: CollectionPoint[];
  roads: ClosedRoad[];
  error: string | null;
}
