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
  VRbanda: Record<K, [number | null, number | null]>;
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
    umbral_D_concentrada: number;
    umbral_D_generalizada: number;
    replicas_banda_VR: number;
    metodo_banda_VR: string;
    banda_VR_percentiles: number[];
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
