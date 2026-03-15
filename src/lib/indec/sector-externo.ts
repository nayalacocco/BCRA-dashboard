/**
 * Sector Externo — series from INDEC (ICA) and BCRA (Balance Cambiario).
 * All monthly, via datos.gob.ar time-series API.
 */

import { fetchINDECSeries, type SeriesPoint } from "./client";

export type { SeriesPoint };

// ---- Intercambio Comercial Argentino (ICA) — INDEC ----
export const ICA_SERIES = {
  EXPO_TOTAL:        "74.3_IET_0_M_16",
  IMPO_TOTAL:        "74.3_IIT_0_M_25",
  SALDO_COMERCIAL:   "74.3_ISC_0_M_19",
  EXPO_PP:           "74.3_IEPP_0_M_35",   // Productos Primarios
  EXPO_MOA:          "74.3_IEMOA_0_M_48",  // Manuf. Origen Agropecuario
  EXPO_MOI:          "74.3_IEMOI_0_M_46",  // Manuf. Origen Industrial
  IMPO_BIENES_CAP:   "74.3_IBCPP_0_M_32",  // Bienes de capital + partes
  IMPO_COMBUSTIBLES: "74.3_IICL_0_M_42",   // Combustibles y lubricantes
} as const;

// ---- Balance Cambiario — BCRA ----
export const BAL_CAM_SERIES = {
  CTA_CTE_TOTAL: "182.1_TOTAL_CUENRIA_0_M_32",
  BIENES:        "182.1_CUENTA_CORNES_0_M_39",
  SERVICIOS:     "182.1_CUENTA_CORIOS_0_M_42",
} as const;

export interface SectorExternoData {
  // ICA
  expoTotal:        SeriesPoint[];
  impoTotal:        SeriesPoint[];
  saldoComercial:   SeriesPoint[];
  expoPP:           SeriesPoint[];
  expoMOA:          SeriesPoint[];
  expoMOI:          SeriesPoint[];
  impoBienesCap:    SeriesPoint[];
  impoCombustibles: SeriesPoint[];
  // Balance Cambiario
  ctaCteTotal:      SeriesPoint[];
  bienes:           SeriesPoint[];
  servicios:        SeriesPoint[];
}

export async function fetchSectorExternoData(): Promise<SectorExternoData> {
  const icaIds = Object.values(ICA_SERIES);
  const balIds = Object.values(BAL_CAM_SERIES);

  const [icaResult, balResult] = await Promise.allSettled([
    fetchINDECSeries(icaIds, 400),
    fetchINDECSeries(balIds, 400),
  ]);

  const ica = icaResult.status === "fulfilled" ? icaResult.value : {};
  const bal = balResult.status === "fulfilled" ? balResult.value : {};

  if (icaResult.status === "rejected")
    console.error("[SectorExterno] ICA fetch failed:", icaResult.reason);
  if (balResult.status === "rejected")
    console.error("[SectorExterno] BalanceCambiario fetch failed:", balResult.reason);

  return {
    expoTotal:        ica[ICA_SERIES.EXPO_TOTAL]        ?? [],
    impoTotal:        ica[ICA_SERIES.IMPO_TOTAL]        ?? [],
    saldoComercial:   ica[ICA_SERIES.SALDO_COMERCIAL]   ?? [],
    expoPP:           ica[ICA_SERIES.EXPO_PP]           ?? [],
    expoMOA:          ica[ICA_SERIES.EXPO_MOA]          ?? [],
    expoMOI:          ica[ICA_SERIES.EXPO_MOI]          ?? [],
    impoBienesCap:    ica[ICA_SERIES.IMPO_BIENES_CAP]   ?? [],
    impoCombustibles: ica[ICA_SERIES.IMPO_COMBUSTIBLES] ?? [],
    ctaCteTotal:      bal[BAL_CAM_SERIES.CTA_CTE_TOTAL] ?? [],
    bienes:           bal[BAL_CAM_SERIES.BIENES]        ?? [],
    servicios:        bal[BAL_CAM_SERIES.SERVICIOS]     ?? [],
  };
}
