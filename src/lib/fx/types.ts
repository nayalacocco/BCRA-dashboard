/** Tipos de data/fx/*.json (pipeline/fx/run.py). Montos de reservas en millones de USD. */

export type Punto = [string, number | null];

export interface Banda {
  fecha: string;
  oficial: number;
  piso: number;
  techo: number;
  dist_techo_pct: number;
  dist_piso_pct: number;
  posicion_pct: number;
  ritmo_oficial_3m: number;
  ritmo_techo_3m: number | null;
  ritmo_piso_3m: number | null;
  meses_al_techo: number | null;
  meses_al_piso: number | null;
  ventana_dias: number;
}

export interface CotizacionesData {
  generado: string;
  series: Record<"a3500" | "piso" | "techo" | "mep" | "ccl" | "blue" | "cripto", Punto[]>;
  banda: Banda;
  ultimos: Record<string, Punto | null>;
  regla_banda: { texto: string; fuente: string; url: string; serie: string };
}

export interface ComprasData {
  generado: string;
  diarias: Punto[];
  acum: [string, number | null, number | null][];
  ultimo: { fecha: string; dia: number; d30: number; d90: number; anio: number; anio_ref: string };
  tesoro: { disponible: boolean; nota: string };
  fuente: string;
}

export interface FilaDiaria {
  f: string;
  brutas: number;
  encajes: number;
  dep_tesoro: number | null;
  planilla: string;
  netas_a: number;
  super_a: number | null;
  netas_b: number | null;
  rin_fmi: number | null;
}

export interface FilaMensual {
  f: string;
  brutas: number;
  encajes: number | null;
  swaps: number;
  pases: number;
  agrupado: boolean;
  otros_bcra: number | null;
  otros_bcra_mas_tesoro: number;
  dep_tesoro: number | null;
  deuda_tesoro_12m: number;
  netas_a: number;
  super_a: number | null;
  netas_b: number | null;
}

export interface LineaWaterfall {
  id: string;
  tipo: "base" | "resta" | "total";
  monto: number | null;
  fecha: string;
  fuente: string;
  frecuencia: "diaria" | "mensual" | null;
  criterio: string;
  desactualizado: boolean | null;
}

export interface AnclaRin {
  fecha: string;
  rin: number;
  fuente: string;
  replica: number | null;
  error: number | null;
  planilla: string | null;
}

export interface ReservasData {
  generado: string;
  ultimo: FilaDiaria;
  diaria: FilaDiaria[];
  mensual: FilaMensual[];
  waterfalls: Record<"A" | "B", LineaWaterfall[]>;
  meta: Record<string, { fuente: string; frecuencia: "diaria" | "mensual" | null; criterio: string }>;
  calendario: {
    planilla: string;
    tramos: string[];
    series: { id: string; deudor: "BCRA" | "Tesoro"; concepto: string; valores: (number | null)[] }[];
    swaps: (number | null)[];
    nota: string;
  };
  rin_fmi: {
    publicable: boolean;
    tolerancia: number;
    anclas: AnclaRin[];
    escalones_fmi: { fecha: string; deg: number; aprox?: boolean }[];
    definicion: string;
  };
  validacion: {
    waterfall_ok: boolean;
    waterfall_errores: string[];
    no_doble_conteo_ok: boolean;
    no_doble_conteo: { desembolso: number; delta_super_a: number | null; delta_netas_b: number | null };
    brutas_vs_api: { f: string; planilla: number; api: number }[];
    planillas_faltantes: string[];
    advertencias_parser: Record<string, string[]>;
  };
}

export interface FuenteEstado {
  ultimo: string | null;
  frecuencia: "diaria" | "mensual" | "diaria_rezagada";
  desactualizado: boolean;
}

export interface FxManifest {
  generado: string;
  fuentes: Record<string, FuenteEstado>;
}
