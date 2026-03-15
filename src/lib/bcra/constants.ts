import type { VariableDisplay } from "./types";

/** Base URL de la API BCRA v4 */
export const BCRA_API_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";

/** TTL de caché en segundos (1 hora — aplica revalidación automática con ISR) */
export const CACHE_TTL_SECONDS = 3600;

/** Máximo de puntos a traer en histórico por defecto (90 días) */
export const DEFAULT_HISTORY_LIMIT = 365;

// ============================================================
// Metadata de las variables que exponemos en el dashboard
// IDs verificados contra la API v4 real (marzo 2026)
// ============================================================

export const VARIABLES_CONFIG: Record<number, Omit<VariableDisplay, keyof import("./types").BCRAVariable>> = {
  // ---- Tipo de cambio ----
  5: {
    label: "USD Mayorista",
    color: "#3b5bdb",
    prefix: "$",
    decimals: 2,
    featured: true,
    dashboardOrder: 1,
  },
  4: {
    label: "USD Minorista",
    color: "#4c6ef5",
    prefix: "$",
    decimals: 2,
    featured: true,
    dashboardOrder: 2,
  },
  // ---- Reservas ----
  1: {
    label: "Reservas BCRA",
    color: "#0ca678",
    suffix: "M USD",
    decimals: 0,
    featured: true,
    dashboardOrder: 3,
  },
  // ---- Tasas ----
  7: {
    label: "BADLAR Priv.",
    color: "#f76707",
    suffix: "% n.a.",
    decimals: 3,
    featured: true,
    dashboardOrder: 4,
  },
  8: {
    label: "TM20",
    color: "#fd7e14",
    suffix: "% n.a.",
    decimals: 3,
    featured: false,
  },
  44: {
    label: "TAMAR",
    color: "#fcc419",
    suffix: "% n.a.",
    decimals: 3,
    featured: false,
  },
  // ---- Inflación ----
  27: {
    label: "Inflación Mensual",
    color: "#e03131",
    suffix: "%",
    decimals: 1,
    featured: true,
    dashboardOrder: 5,
  },
  28: {
    label: "Inflación Interanual",
    color: "#c92a2a",
    suffix: "%",
    decimals: 1,
    featured: true,
    dashboardOrder: 6,
  },
  // ---- Monetarias ----
  15: {
    label: "Base Monetaria",
    color: "#862e9c",
    suffix: "M ARS",
    decimals: 0,
    featured: false,
  },
  25: {
    label: "M2 Privado (var. i.a.)",
    color: "#ae3ec9",
    suffix: "%",
    decimals: 1,
    featured: false,
  },
  // ---- Índices ----
  31: {
    label: "UVA",
    color: "#1098ad",
    prefix: "$",
    decimals: 2,
    featured: false,
  },
  30: {
    label: "CER",
    color: "#0c8599",
    decimals: 6,
    featured: false,
  },
  40: {
    label: "ICL",
    color: "#099268",
    decimals: 4,
    featured: false,
  },
};

/** IDs de variables que aparecen en el dashboard principal (ordenadas) */
export const DASHBOARD_VARIABLE_IDS = [5, 4, 1, 7, 27, 28];

/** Todos los IDs configurados */
export const ALL_VARIABLE_IDS = Object.keys(VARIABLES_CONFIG).map(Number);

/** Paleta de colores para variables dinámicas (comparador de series) */
export const CHART_COLORS = [
  "#3b5bdb",
  "#0ca678",
  "#f76707",
  "#e03131",
  "#ae3ec9",
  "#1098ad",
  "#862e9c",
  "#fcc419",
  "#099268",
  "#c92a2a",
];

/** Formato de fecha para la API */
export const DATE_FORMAT_API = "yyyy-MM-dd";

/** Formato de fecha para display */
export const DATE_FORMAT_DISPLAY = "dd/MM/yyyy";
