/**
 * Inflación, Expectativas y Tasas de Mercado
 * Sources: INDEC (IPC), BCRA-REM, UTDT, BCRA tasas — via datos.gob.ar
 */

import { fetchINDECSeries, type SeriesPoint } from "./client";

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
  CALL:          "89.1_TIC_0_0_18",           // Call interbancario mensual
  PF_30_59:      "89.1_TIPF35D_0_0_35",      // Plazo fijo 30–59 días
  PF_60_MAS:     "89.1_TIPFM6D_0_0_36",      // Plazo fijo +60 días
} as const;

export interface InflacionData {
  // IPC
  ipcMensual:     SeriesPoint[];  // % mensual NGL
  ipcNivel:       SeriesPoint[];  // índice nivel general
  ipcNucleo:      SeriesPoint[];  // índice núcleo
  ipcRegulados:   SeriesPoint[];  // índice regulados
  ipcEstacional:  SeriesPoint[];  // índice estacionales
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

  const [ipcRes, expRes, tasRes] = await Promise.allSettled([
    fetchINDECSeries(ipcIds, 500),
    fetchINDECSeries(expIds, 300),
    fetchINDECSeries(tasIds, 400),
  ]);

  const ipc = ipcRes.status === "fulfilled" ? ipcRes.value : {};
  const exp = expRes.status === "fulfilled" ? expRes.value : {};
  const tas = tasRes.status === "fulfilled" ? tasRes.value : {};

  if (ipcRes.status === "rejected") console.error("[Inflacion] IPC fetch failed:", ipcRes.reason);
  if (expRes.status === "rejected") console.error("[Inflacion] Expectativas fetch failed:", expRes.reason);
  if (tasRes.status === "rejected") console.error("[Inflacion] Tasas fetch failed:", tasRes.reason);

  return {
    ipcMensual:    ipc[IPC_SERIES.VARIACION_MENSUAL]       ?? [],
    ipcNivel:      ipc[IPC_SERIES.NIVEL_GENERAL]           ?? [],
    ipcNucleo:     ipc[IPC_SERIES.NUCLEO]                  ?? [],
    ipcRegulados:  ipc[IPC_SERIES.REGULADOS]               ?? [],
    ipcEstacional: ipc[IPC_SERIES.ESTACIONALES]            ?? [],
    remT:          exp[EXPECTATIVAS_SERIES.REM_T]          ?? [],
    remT1:         exp[EXPECTATIVAS_SERIES.REM_T1]         ?? [],
    remT6:         exp[EXPECTATIVAS_SERIES.REM_T6]         ?? [],
    remAnual25:    exp[EXPECTATIVAS_SERIES.REM_ANUAL_25]   ?? [],
    remAnual26:    exp[EXPECTATIVAS_SERIES.REM_ANUAL_26]   ?? [],
    utdt12m:       exp[EXPECTATIVAS_SERIES.UTDT_12M]       ?? [],
    politicaMon:   tas[TASAS_SERIES.POLITICA_MON]          ?? [],
    badlar:        tas[TASAS_SERIES.BADLAR]                 ?? [],
    call:          tas[TASAS_SERIES.CALL]                   ?? [],
    pf30:          tas[TASAS_SERIES.PF_30_59]              ?? [],
    pf60:          tas[TASAS_SERIES.PF_60_MAS]             ?? [],
  };
}
