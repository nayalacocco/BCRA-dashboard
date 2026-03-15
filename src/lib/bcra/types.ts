// ============================================================
// BCRA API v4.0 — Principales Variables / Monetarias
// Base URL: https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias
// ============================================================

/** Categorías disponibles en la API v4 */
export type VariableCategory =
  | "Principales Variables"
  | "Monetarias y Financieras"
  | "Sector Externo"
  | "Precios"
  | string;

/** Unidad de expresión de cada variable */
export type UnidadExpresion =
  | "En millones de USD"
  | "En millones de ARS"
  | "Pesos argentinos por dólar estadounidense"
  | "En porcentaje nominal anual"
  | "En porcentaje efectivo anual"
  | "En porcentaje"
  | "Índice base 2.2.02=1"
  | "En ARS"
  | string;

/** Moneda de la variable: ML = moneda local, ME = moneda extranjera */
export type Moneda = "ML" | "ME" | "MEyML" | string;

// ---- Respuesta genérica de la API ----

export interface BCRAResultset {
  count: number;
  offset: number;
  limit: number;
}

export interface BCRAMetadata {
  resultset: BCRAResultset;
}

export interface BCRAResponse<T> {
  status: number;
  metadata: BCRAMetadata;
  results: T[];
  errorMessages?: string[];
}

// ---- Variable (endpoint: GET /estadisticas/v4.0/Monetarias) ----

export interface BCRAVariable {
  idVariable: number;
  descripcion: string;
  categoria: VariableCategory;
  tipoSerie?: string;
  periodicidad?: string;
  unidadExpresion: UnidadExpresion;
  moneda: Moneda;
  primerFechaInformada?: string; // ISO date "YYYY-MM-DD"
  ultFechaInformada?: string;    // ISO date "YYYY-MM-DD"
  ultValorInformado?: number;
}

// ---- Datos históricos (endpoint: GET /estadisticas/v4.0/Monetarias/{id}) ----

export interface BCRADataPoint {
  fecha: string; // ISO date "YYYY-MM-DD"
  valor: number;
}

export interface BCRAVariableData {
  idVariable: number;
  detalle: BCRADataPoint[];
}

// ---- Tipos procesados para el frontend ----

/** Variable con metadata enriquecida para display */
export interface VariableDisplay extends BCRAVariable {
  label: string;         // Nombre corto para UI
  color: string;         // Color hex para gráficos
  prefix?: string;       // Prefijo de formato (ej: "USD", "ARS")
  suffix?: string;       // Sufijo de formato (ej: "%", "M")
  decimals: number;      // Decimales a mostrar
  featured: boolean;     // Si aparece en el dashboard principal
  dashboardOrder?: number; // Orden en el dashboard
}

/** Punto de datos con fecha parseada */
export interface DataPoint {
  fecha: string;   // "YYYY-MM-DD"
  valor: number;
  fechaDisplay?: string; // Formateada para display "DD/MM/YYYY"
}

/** Respuesta completa de histórico para una variable */
export interface VariableHistorico {
  variable: BCRAVariable;
  datos: DataPoint[];
  totalCount: number;
}

/** Para el comparador de series */
export interface SerieData {
  idVariable: number;
  descripcion: string;
  label: string;
  color: string;
  unidad: string;
  datos: DataPoint[];
}

/** Para el ratio builder */
export interface RatioData {
  fecha: string;
  numerador: number;
  denominador: number;
  ratio: number;
}

/** Error estructurado del cliente */
export interface BCRAClientError {
  message: string;
  status?: number;
  raw?: unknown;
}

/** Parámetros para consultar histórico */
export interface HistoricoParams {
  desde?: string;  // "YYYY-MM-DD"
  hasta?: string;  // "YYYY-MM-DD"
  limit?: number;  // 10–3000, default 1000
  offset?: number;
}
