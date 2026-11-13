/**
 * Client for the Argentine government's open data Time Series API.
 * https://apis.datos.gob.ar/series/api
 *
 * No authentication required. Rate limit: ~10 req/s.
 * Response: { data: [[date, v1, v2, ...], ...], meta: [...], count: N }
 */

const BASE_URL = "https://apis.datos.gob.ar/series/api";

export interface SeriesPoint {
  fecha: string;
  valor: number;
}

// Series IDs for the variables used in the dashboard
export const INDEC_SERIES = {
  // ICA (INDEC) — exportaciones, importaciones y saldo comercial totales, mensual, M USD.
  // Reemplazan a las series de cereales (162.3_XREALESLES / 164.3_SEREALELES), que
  // datos.gob.ar dejó de actualizar en feb-2025.
  EXPO_TOTAL: "74.3_IET_0_M_16",
  IMPO_TOTAL: "74.3_IIT_0_M_25",
  SALDO_COMERCIAL: "74.3_ISC_0_M_19",
  // Monthly 12-month inflation expectations — consumer survey (UTDT/Di Tella).
  // Ojo: en datos.gob.ar el último dato es ene-2026 (la tarjeta lo marca como desactualizado).
  INFLACION_ESPERADA_12M: "431.1_EXPECTATIVDIO_M_0_0_30_56",
} as const;

export type IndecSeriesKey = keyof typeof INDEC_SERIES;
export type IndecSeriesId = (typeof INDEC_SERIES)[IndecSeriesKey];

export interface IndecDashboardData {
  expoTotal: SeriesPoint[];
  impoTotal: SeriesPoint[];
  saldoComercial: SeriesPoint[];
  inflacionEsperada: SeriesPoint[];
}

/**
 * Fetch multiple time series in a single request.
 * Returns the MOST RECENT `limit` observations, sorted oldest→newest (asc) — ready for Recharts.
 *
 * Importante: se pide sort=desc y se invierte acá. Con sort=asc + limit, la API devuelve
 * las PRIMERAS N observaciones del índice de fechas (ej.: series desde 1990 → cortaban en 2014).
 *
 * If the API is unavailable, throws an error so callers can catch it gracefully.
 */
export async function fetchINDECSeries(
  ids: string[],
  limit = 300,
): Promise<Record<string, SeriesPoint[]>> {
  const url = new URL(`${BASE_URL}/series/`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "desc");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // ISR cache 1h
  });

  if (!res.ok) throw new Error(`INDEC API ${res.status}`);

  const json = await res.json() as {
    data: Array<(string | number | null)[]>;
  };

  // Build per-series arrays. Columns: [date, v0, v1, v2, ...]
  const result: Record<string, SeriesPoint[]> = {};
  for (const id of ids) result[id] = [];

  // La API devuelve desc (más reciente primero); recorremos al revés para quedar en orden asc.
  for (const row of [...json.data].reverse()) {
    const fecha = row[0] as string;
    ids.forEach((id, i) => {
      const val = row[i + 1];
      if (val != null) {
        result[id].push({ fecha, valor: val as number });
      }
    });
  }

  return result;
}

/**
 * Fetch the three dashboard series in one call.
 * Returns empty arrays on error so the dashboard degrades gracefully.
 */
export async function fetchDashboardIndecData(): Promise<IndecDashboardData> {
  const ids = [
    INDEC_SERIES.EXPO_TOTAL,
    INDEC_SERIES.IMPO_TOTAL,
    INDEC_SERIES.SALDO_COMERCIAL,
    INDEC_SERIES.INFLACION_ESPERADA_12M,
  ];

  try {
    const data = await fetchINDECSeries(ids, 300);
    return {
      expoTotal:         data[INDEC_SERIES.EXPO_TOTAL]         ?? [],
      impoTotal:         data[INDEC_SERIES.IMPO_TOTAL]         ?? [],
      saldoComercial:    data[INDEC_SERIES.SALDO_COMERCIAL]    ?? [],
      inflacionEsperada: data[INDEC_SERIES.INFLACION_ESPERADA_12M] ?? [],
    };
  } catch (err) {
    console.error("[INDEC] fetchDashboardIndecData failed:", err);
    return { expoTotal: [], impoTotal: [], saldoComercial: [], inflacionEsperada: [] };
  }
}
