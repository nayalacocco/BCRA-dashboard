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
  // Monthly exports of cereals/agro sector (INDEC). Good proxy for "liquidación agro".
  EXPORT_CEREALES: "162.3_XREALESLES_0_0_10",
  // Monthly trade balance of cereals sector (INDEC).
  BALANCE_CEREALES: "164.3_SEREALELES_0_0_11",
  // Monthly 12-month inflation expectations — consumer survey (UTDT/Di Tella)
  INFLACION_ESPERADA_12M: "431.1_EXPECTATIVDIO_M_0_0_30_56",
} as const;

export type IndecSeriesKey = keyof typeof INDEC_SERIES;
export type IndecSeriesId = (typeof INDEC_SERIES)[IndecSeriesKey];

export interface IndecDashboardData {
  exportCereales: SeriesPoint[];
  balanceCereales: SeriesPoint[];
  inflacionEsperada: SeriesPoint[];
}

/**
 * Fetch multiple time series in a single request.
 * Returns data sorted oldest→newest (asc) — ready for Recharts.
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
  url.searchParams.set("sort", "asc");
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

  for (const row of json.data) {
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
    INDEC_SERIES.EXPORT_CEREALES,
    INDEC_SERIES.BALANCE_CEREALES,
    INDEC_SERIES.INFLACION_ESPERADA_12M,
  ];

  try {
    const data = await fetchINDECSeries(ids, 300);
    return {
      exportCereales:    data[INDEC_SERIES.EXPORT_CEREALES]    ?? [],
      balanceCereales:   data[INDEC_SERIES.BALANCE_CEREALES]   ?? [],
      inflacionEsperada: data[INDEC_SERIES.INFLACION_ESPERADA_12M] ?? [],
    };
  } catch (err) {
    console.error("[INDEC] fetchDashboardIndecData failed:", err);
    return { exportCereales: [], balanceCereales: [], inflacionEsperada: [] };
  }
}
