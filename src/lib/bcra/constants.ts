import type { VariableDisplay } from "./types";

/** Base URL de la API BCRA v4 */
export const BCRA_API_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";

/** TTL de caché en segundos (1 hora) */
export const CACHE_TTL_SECONDS = 3600;

/** Máximo de puntos a traer en histórico por defecto */
export const DEFAULT_HISTORY_LIMIT = 365;

/** Máximo de puntos para historial extendido (≈6 años de días hábiles) */
export const EXTENDED_HISTORY_LIMIT = 2000;

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
    label: "Reservas Brutas",
    color: "#0ca678",
    suffix: "M USD",
    decimals: 0,
    featured: true,
    dashboardOrder: 3,
  },
  // ---- Intervención MULC ----
  78: {
    label: "Compras MULC",
    color: "#20c997",
    suffix: "M USD",
    decimals: 1,
    featured: true,
    dashboardOrder: 4,
  },
  // ---- Tasas ----
  7: {
    label: "BADLAR Priv.",
    color: "#f76707",
    suffix: "% n.a.",
    decimals: 3,
    featured: true,
    dashboardOrder: 5,
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
    dashboardOrder: 6,
  },
  28: {
    label: "Inflación Interanual",
    color: "#c92a2a",
    suffix: "%",
    decimals: 1,
    featured: true,
    dashboardOrder: 7,
  },
  29: {
    label: "REM – Inflación 12m",
    color: "#f59f00",
    suffix: "%",
    decimals: 1,
    featured: false,
  },
  // ---- Monetarias ----
  15: {
    label: "Base Monetaria",
    color: "#862e9c",
    suffix: "M $",
    decimals: 0,
    featured: false,
  },
  109: {
    label: "M2 Privado",
    color: "#ae3ec9",
    suffix: "M $",
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

/** IDs que se usan en el dashboard extendido */
export const EXTENDED_DASHBOARD_IDS = [1, 5, 4, 15, 78, 109, 27, 28, 29, 7];

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

// ============================================================
// Períodos de gobierno para el selector de período
// ============================================================

export interface GovernmentPeriod {
  key: string;
  label: string;
  presidente: string;
  desde: string;
  hasta?: string;
  color: string;
}

export const GOVERNMENT_PERIODS: GovernmentPeriod[] = [
  {
    key: "milei",
    label: "Milei",
    presidente: "Javier Milei",
    desde: "2023-12-10",
    color: "#7c3aed",
  },
  {
    key: "fernandez",
    label: "Fernández",
    presidente: "Alberto Fernández",
    desde: "2019-12-10",
    hasta: "2023-12-09",
    color: "#1d4ed8",
  },
  {
    key: "macri",
    label: "Macri",
    presidente: "Mauricio Macri",
    desde: "2015-12-10",
    hasta: "2019-12-09",
    color: "#b45309",
  },
  {
    key: "cfk2",
    label: "CFK II",
    presidente: "Cristina Fernández de Kirchner",
    desde: "2011-12-10",
    hasta: "2015-12-09",
    color: "#065f46",
  },
];

// ============================================================
// Variables PENDIENTES (fuente externa al BCRA)
// ============================================================

export interface PendingVariable {
  label: string;
  description: string;
  source: string;
  unit?: string;
}

export const PENDING_VARIABLES: Record<string, PendingVariable> = {
  reservasNetas: {
    label: "Reservas Netas",
    description: "Brutas − SWAP BPCh − FMI − REPO",
    source: "BCRA (cálculo)",
    unit: "M USD",
  },
  mep: {
    label: "USD MEP",
    description: "Implícito de bonos (AL30/GD30)",
    source: "ByMA",
  },
  ccl: {
    label: "USD CCL",
    description: "Contado con Liquidación",
    source: "ByMA",
  },
  brecha: {
    label: "Brecha Cambiaria",
    description: "(MEP − Oficial) / Oficial",
    source: "Calculado",
    unit: "%",
  },
  pasivosRem: {
    label: "Pasivos Remunerados",
    description: "LEFI – Letras Fiscales de Liquidez",
    source: "Secretaría de Finanzas",
    unit: "M $",
  },
  riesgoPais: {
    label: "Riesgo País",
    description: "JP Morgan EMBI+ Argentina",
    source: "JP Morgan",
    unit: "pb",
  },
  futuros: {
    label: "Futuros Dólar",
    description: "ROFEX – contratos a término",
    source: "ROFEX",
  },
  liquidacionAgro: {
    label: "Liquidación Agro",
    description: "CIARA-CEC: sector agroexportador",
    source: "CIARA",
    unit: "M USD",
  },
  importaciones: {
    label: "Importaciones",
    description: "Pagos de importaciones al exterior",
    source: "INDEC",
    unit: "M USD",
  },
  balanceComercial: {
    label: "Balance Comercial",
    description: "Exportaciones − Importaciones",
    source: "INDEC",
    unit: "M USD",
  },
};
