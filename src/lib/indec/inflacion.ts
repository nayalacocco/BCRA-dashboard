/**
 * Inflación, Expectativas y Tasas de Mercado
 * Sources: INDEC (IPC), BCRA-REM, UTDT, BCRA tasas — via datos.gob.ar
 */

import { fetchINDECSeries, type SeriesPoint } from "./client";
import { getVariableHistorico } from "@/lib/bcra/client";
import { fetchIpcIndec } from "./ipc-indec";

export type { SeriesPoint };

// ---- IPC INDEC (Base Dic-2016) ----
export const IPC_SERIES = {
  VARIACION_MENSUAL: "145.3_INGNACUAL_DICI_M_38",  // % cambio mensual NGL
  NIVEL_GENERAL:     "148.3_INIVELNAL_DICI_M_26",   // índice nivel general
  NUCLEO:            "148.3_INUCLEONAL_DICI_M_19",  // índice núcleo (core)
  REGULADOS:         "148.3_IREGULANAL_DICI_M_22",  // índice regulados
  ESTACIONALES:      "148.3_IESTACINAL_DICI_M_25",  // índice estacionales
} as const;

// ---- Expectativas — REM (BCRA) + UTDT Di Tella ----
export const EXPECTATIVAS_SERIES = {
  REM_T:         "430.1_REM_IPC_NAL_T_M_0_0_25_28",  // mediana infla esperada mes corriente
  REM_T1:        "430.1_MEDIANA_IPT_1_M_0_0_31_29",   // mediana infla t+1
  REM_T6:        "430.1_MEDIANA_IPT_6_M_0_0_31_24",   // mediana infla t+6
  REM_ANUAL_25:  "430.1_REM_IPC_NA024_M_0_0_23_78",   // proyección interanual 2025
  REM_ANUAL_26:  "430.1_REM_IPC_NA026_M_0_0_23_8",    // proyección interanual 2026
  UTDT_12M:      "431.1_EXPECTATIVDIO_M_0_0_30_56",   // UTDT Di Tella — expectativas 12m
} as const;

// ---- Tasas de interés — BCRA vía datos.gob.ar ----
export const TASAS_SERIES = {
  POLITICA_MON: "89.1_IR_BCRARIA_0_M_34",  // Tasa de Política Monetaria mensual
  BADLAR:        "89.1_TIB_0_0_20",          // BADLAR privada mensual
  PF_30_59:      "89.1_TIPF35D_0_0_35",      // Plazo fijo 30–59 días
  PF_60_MAS:     "89.1_TIPFM6D_0_0_36",      // Plazo fijo +60 días
} as const;

/**
 * Series que datos.gob.ar publica como FRACCIÓN (0,0166 = 1,66%), no en porcentaje.
 * Verificado nov-2026: IPC var. mensual (units "Variación intermensual") y todas las del REM.
 * Sin esta conversión la página mostraba "0,0 %" y la tasa real (BADLAR/12 − IPC) salía ~2 pp de más.
 */
const FRACTION_SERIES = new Set<string>([
  IPC_SERIES.VARIACION_MENSUAL,
  EXPECTATIVAS_SERIES.REM_T,
  EXPECTATIVAS_SERIES.REM_T1,
  EXPECTATIVAS_SERIES.REM_T6,
  EXPECTATIVAS_SERIES.REM_ANUAL_25,
  EXPECTATIVAS_SERIES.REM_ANUAL_26,
]);

function toPct(id: string, pts: SeriesPoint[] | undefined): SeriesPoint[] {
  if (!pts) return [];
  return FRACTION_SERIES.has(id) ? pts.map((p) => ({ ...p, valor: p.valor * 100 })) : pts;
}

/** ID BCRA API v4 — "Interbank Loans in Pesos - Interest Rate" (call, diaria, % n.a.) */
const BCRA_CALL_ID = 148;

/**
 * Call interbancario: la serie de datos.gob.ar (89.1_TIC_0_0_18) no publica desde abr-2023.
 * Se toma la diaria del BCRA y se promedia por mes para alinearla con las demás tasas mensuales.
 */
async function fetchCallMensual(): Promise<SeriesPoint[]> {
  const { data } = await getVariableHistorico(BCRA_CALL_ID, { limit: 3000 });
  const byMonth = new Map<string, { sum: number; n: number }>();
  for (const d of data.detalle ?? []) {
    const key = d.fecha.slice(0, 7) + "-01";
    const acc = byMonth.get(key) ?? { sum: 0, n: 0 };
    acc.sum += d.valor;
    acc.n += 1;
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, { sum, n }]) => ({ fecha, valor: sum / n }));
}

/** Variación % entre cada punto y el de `lag` períodos antes (serie mensual ordenada asc). */
function variacion(index: SeriesPoint[], lag: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = lag; i < index.length; i++) {
    const base = index[i - lag].valor;
    if (base > 0) out.push({ fecha: index[i].fecha, valor: (index[i].valor / base - 1) * 100 });
  }
  return out;
}

export interface InflacionData {
  // IPC
  ipcMensual:     SeriesPoint[];  // % mensual NGL
  ipcNivel:       SeriesPoint[];  // índice nivel general
  ipcNucleo:      SeriesPoint[];  // índice núcleo
  ipcRegulados:   SeriesPoint[];  // índice regulados
  ipcEstacional:  SeriesPoint[];  // índice estacionales
  ipcInteranual:  SeriesPoint[];  // % i.a. nivel general
  nucleoMensual:    SeriesPoint[]; // % mensual núcleo
  reguladosMensual: SeriesPoint[]; // % mensual regulados
  estacionalMensual: SeriesPoint[]; // % mensual estacionales
  /** "INDEC" si vino del CSV oficial (al día); "datos.gob.ar" si se usó el respaldo (rezago de ~2 meses) */
  ipcFuente: "INDEC" | "datos.gob.ar";
  // Expectativas
  remT:           SeriesPoint[];  // REM mes corriente
  remT1:          SeriesPoint[];  // REM t+1
  remT6:          SeriesPoint[];  // REM t+6
  remAnual25:     SeriesPoint[];  // REM proyección 2025
  remAnual26:     SeriesPoint[];  // REM proyección 2026
  utdt12m:        SeriesPoint[];  // UTDT Di Tella 12m
  // Tasas
  politicaMon:    SeriesPoint[];
  badlar:         SeriesPoint[];
  call:           SeriesPoint[];
  pf30:           SeriesPoint[];
  pf60:           SeriesPoint[];
}

export async function fetchInflacionData(): Promise<InflacionData> {
  const ipcIds  = Object.values(IPC_SERIES);
  const expIds  = Object.values(EXPECTATIVAS_SERIES);
  const tasIds  = Object.values(TASAS_SERIES);

  const [indecRes, ipcRes, expRes, tasRes, callRes] = await Promise.allSettled([
    fetchIpcIndec(),
    fetchINDECSeries(ipcIds, 500),
    fetchINDECSeries(expIds, 300),
    fetchINDECSeries(tasIds, 400),
    fetchCallMensual(),
  ]);

  const ipc = ipcRes.status === "fulfilled" ? ipcRes.value : {};
  const exp = expRes.status === "fulfilled" ? expRes.value : {};
  const tas = tasRes.status === "fulfilled" ? tasRes.value : {};

  if (ipcRes.status === "rejected") console.error("[Inflacion] IPC fetch failed:", ipcRes.reason);
  if (expRes.status === "rejected") console.error("[Inflacion] Expectativas fetch failed:", expRes.reason);
  if (tasRes.status === "rejected") console.error("[Inflacion] Tasas fetch failed:", tasRes.reason);
  if (callRes.status === "rejected") console.error("[Inflacion] Call (BCRA) fetch failed:", callRes.reason);

  // IPC: CSV oficial de INDEC (al día) con respaldo en datos.gob.ar (rezago ~2 meses)
  const indec = indecRes.status === "fulfilled" ? indecRes.value : null;
  const nivelDg = ipc[IPC_SERIES.NIVEL_GENERAL] ?? [];
  const nucleoDg = ipc[IPC_SERIES.NUCLEO] ?? [];
  const reguladosDg = ipc[IPC_SERIES.REGULADOS] ?? [];
  const estacionalDg = ipc[IPC_SERIES.ESTACIONALES] ?? [];

  const ipcBlock = indec
    ? {
        ipcMensual:        indec.nivelGeneral.mensual,
        ipcNivel:          indec.nivelGeneral.indice,
        ipcNucleo:         indec.nucleo.indice,
        ipcRegulados:      indec.regulados.indice,
        ipcEstacional:     indec.estacional.indice,
        ipcInteranual:     indec.nivelGeneral.interanual,
        nucleoMensual:     indec.nucleo.mensual,
        reguladosMensual:  indec.regulados.mensual,
        estacionalMensual: indec.estacional.mensual,
        ipcFuente:         "INDEC" as const,
      }
    : {
        ipcMensual:        toPct(IPC_SERIES.VARIACION_MENSUAL, ipc[IPC_SERIES.VARIACION_MENSUAL]),
        ipcNivel:          nivelDg,
        ipcNucleo:         nucleoDg,
        ipcRegulados:      reguladosDg,
        ipcEstacional:     estacionalDg,
        ipcInteranual:     variacion(nivelDg, 12),
        nucleoMensual:     variacion(nucleoDg, 1),
        reguladosMensual:  variacion(reguladosDg, 1),
        estacionalMensual: variacion(estacionalDg, 1),
        ipcFuente:         "datos.gob.ar" as const,
      };

  return {
    ...ipcBlock,
    remT:          toPct(EXPECTATIVAS_SERIES.REM_T, exp[EXPECTATIVAS_SERIES.REM_T]),
    remT1:         toPct(EXPECTATIVAS_SERIES.REM_T1, exp[EXPECTATIVAS_SERIES.REM_T1]),
    remT6:         toPct(EXPECTATIVAS_SERIES.REM_T6, exp[EXPECTATIVAS_SERIES.REM_T6]),
    remAnual25:    toPct(EXPECTATIVAS_SERIES.REM_ANUAL_25, exp[EXPECTATIVAS_SERIES.REM_ANUAL_25]),
    remAnual26:    toPct(EXPECTATIVAS_SERIES.REM_ANUAL_26, exp[EXPECTATIVAS_SERIES.REM_ANUAL_26]),
    utdt12m:       exp[EXPECTATIVAS_SERIES.UTDT_12M]       ?? [],
    politicaMon:   tas[TASAS_SERIES.POLITICA_MON]          ?? [],
    badlar:        tas[TASAS_SERIES.BADLAR]                 ?? [],
    call:          callRes.status === "fulfilled" ? callRes.value : [],
    pf30:          tas[TASAS_SERIES.PF_30_59]              ?? [],
    pf60:          tas[TASAS_SERIES.PF_60_MAS]             ?? [],
  };
}
