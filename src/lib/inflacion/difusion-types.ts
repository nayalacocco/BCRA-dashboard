/**
 * Tipos de data/inflacion/difusion.json y heatmap.json (los genera pipeline/inflacion/difusion_export.py).
 * Las series están alineadas a `fechas` ("YYYY-MM"); null = sin dato o no definido.
 */

export type Serie = (number | null)[];
export type UniversoKey = "todos" | "publicados" | "nacional27";
export type PondKey = "pond" | "simple";
export type SerieKey = "orig" | "sa";
export type K = "3" | "6" | "12";

export interface Variante {
  D: Serie;
  buckets: Serie[];
  C: Record<K, Serie>;
  Cref: Record<K, Serie>;
  A: Record<K, Serie>;
  VR: Record<K, Serie>;
  /** Null por permutación: [p5, p50, p95] por mes. */
  Cnull: Record<K, [Serie, Serie, Serie]>;
  VRnull: Record<K, [Serie, Serie, Serie]>;
  /** Terciles históricos de D̄ (3 meses) de la variante: [p33, p67]. */
  umbrales_D: [number | null, number | null];
  rho: Serie;
  rho6: Serie;
  rho12: Serie;
  regimen: {
    D3: Serie;
    excesoC3: Serie;
    amplitud: (string | null)[];
    dinamica: (string | null)[];
    codigo: string[];
  };
}

export interface DifusionData {
  schema_version: number;
  fechas: string[];
  ultimo_periodo: string;
  ks: number[];
  buckets_etiquetas: string[];
  universos: Record<UniversoKey, { descripcion: string; n: number }>;
  headline: Record<SerieKey, Serie>;
  regimenes: Record<string, { titulo: string; texto: string }>;
  amplitud_etiquetas: Record<string, string>;
  dinamica_etiquetas: Record<string, string>;
  parametros: {
    umbrales_amplitud: string;
    replicas_null: number;
    metodo_null: string;
    null_percentiles: number[];
    desest: { metodo: string; items_ajustados: number; items_total: number };
  };
  variantes: Record<string, Variante>;
}

export interface HeatmapItem {
  id: string;
  codigo: string;
  division: string;
  descripcion: string;
  residual: boolean;
  peso: number | null;
}

export interface HeatmapGrupo {
  items: HeatmapItem[];
  orig: Record<string, Serie>;
  sa: Record<string, Serie>;
}

export interface HeatmapData {
  schema_version: number;
  fechas: string[];
  unidad: string;
  grupos: Record<string, HeatmapGrupo>;
}

// ---------------------------------------------------------------------------
// Precios relativos con anclas (data/inflacion/precios_relativos.json)
// ---------------------------------------------------------------------------

export interface PrecioRelativoItem {
  nombre: string;
  ancla: "historia_filtrada";
  /** Desvío vs. ancla de historia filtrada (meses sin cepo), %. */
  desvio_filtrada: number | null;
  /** Desvío vs. promedio simple de toda la muestra (referencia), %. */
  desvio_simple: number | null;
  d3: number | null;
  d6: number | null;
  d12: number | null;
}

export interface BacktestResultado {
  beta: number;
  se: number;
  t: number | null;
  r2: number;
  acierto_signo: number;
  vida_media_meses: number | null;
}

export interface PreciosRelativosData {
  schema_version: number;
  fechas: string[];
  serie: string;
  ancla: { tipo: string; regla: string; periodos: [string, string][]; meses: number; meses_total: number; fuentes: string };
  backtest: {
    horizonte_meses: number;
    origenes: string[];
    n_obs: number;
    n_items: number;
    filtrada: BacktestResultado;
    simple: BacktestResultado;
    momentum: BacktestResultado;
  };
  grupos: Record<
    string,
    {
      items: Record<string, PrecioRelativoItem>;
      serie?: Record<string, Serie>;
      peso?: Record<string, number | null>;
    }
  >;
}

/** Resumen de la validación del universo y de la reconciliación (se arma en el servidor). */
export interface Validacion {
  items: number;
  publicados: number;
  restos: number;
  sumaPesos: number;
  reconciliacion: {
    meses: number;
    maxPp: number;
    maePp: number;
    fueraDeTolerancia: number;
    peores: { fecha: string; publicado: number; recomputado: number; desvio: number }[];
    regionMaxPp: Record<string, number>;
  };
}
