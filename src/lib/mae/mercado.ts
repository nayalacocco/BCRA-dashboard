/**
 * MAE Mercado data — repos, renta fija, cauciones, forex.
 *
 * Behavior per endpoint:
 * - /repo     → historical daily data, paginated (50/page). Always available.
 * - /rentafija, /cauciones, /forex → today's snapshot. Returns [] when market is closed.
 */

import { fetchMAE } from "./client";

// ---- Shared types ----

export interface SeriesPoint {
  fecha: string;  // "YYYY-MM-DD"
  valor: number;
}

/** Raw MAE quote (rentafija / cauciones / forex snapshot) */
export interface MAEQuote {
  fecha: string;
  ticker: string;
  descripcion: string;
  tipoEmision: string;
  segmento: string;
  codigoSegmento: string;
  plazo: string;
  moneda: string;
  volumenAcumulado: number;
  montoAcumulado:   number;   // nominal ARS traded
  precioUltimo: number;
  ultimaTasa: number;
  precioCierre: number | null;
  precioCierreAnterior: number;
  precioMinimo: number;
  precioMaximo: number;
  variacion: number;
}

/** Raw repo record from MAE */
interface RawRepo {
  fecha: string;
  rueda: string;
  moneda: string;
  tasaApertura: number;
  ultimaTasa: number;
  tasaMaximo: number;
  tasaMinimo: number;
  cantidad: number;
  volumen: number;
  tasaPP: number;
  variacion: number;
  cantOperaciones: number;
  plazo: string;
}

export interface RepoTermPoint {
  plazo: string;
  tasa: number;
  vol: number;
  ops: number;
}

export interface MercadoData {
  // Repo — historical time series
  repoOvernight: SeriesPoint[];    // plazo "001" daily tasaPP
  repo3d:        SeriesPoint[];    // plazo "003"
  repo7d:        SeriesPoint[];    // plazo "007"
  repoVolume:    SeriesPoint[];    // overnight daily volume (ARS)
  repoLatestCurve: RepoTermPoint[];  // all plazos for the most recent date
  // Snapshots — empty [] when market is closed
  cauciones:  MAEQuote[];
  rentafija:  MAEQuote[];
  forex:      MAEQuote[];
  // Meta
  lastRepoDate: string | null;
  marketOpen:   boolean;  // true if any snapshot returned data
}

// ---- Repo fetcher (paginated) ----

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

// Max 4 pages (200 records ≈ 2 months) — keeps total fetch time well under Vercel's 10s limit
const MAX_REPO_PAGES = 4;

async function fetchRepoHistory(months = 3): Promise<RawRepo[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - months);

  const all: RawRepo[] = [];
  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    try {
      const batch = await fetchMAE("/mercado/cotizaciones/repo", {
        fechaDesde: toISO(desde),
        fechaHasta: toISO(new Date()),
        pageNumber: page,
      }) as RawRepo[];

      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < 50) break;  // last page reached
    } catch (err) {
      console.error(`[MAE] repo page ${page} failed:`, err);
      break;
    }
  }
  return all;
}

function buildRepoSeries(records: RawRepo[]): {
  overnight: SeriesPoint[];
  three_day: SeriesPoint[];
  seven_day: SeriesPoint[];
  volume:    SeriesPoint[];
  latestCurve: RepoTermPoint[];
} {
  // Group by date+plazo
  const byDatePlazo = new Map<string, Map<string, RawRepo>>();
  for (const r of records) {
    const fecha = r.fecha.slice(0, 10);
    if (!byDatePlazo.has(fecha)) byDatePlazo.set(fecha, new Map());
    byDatePlazo.get(fecha)!.set(r.plazo, r);
  }

  const dates = Array.from(byDatePlazo.keys()).sort();

  const overnight: SeriesPoint[] = [];
  const three_day: SeriesPoint[] = [];
  const seven_day: SeriesPoint[] = [];
  const volume:    SeriesPoint[] = [];

  for (const fecha of dates) {
    const day = byDatePlazo.get(fecha)!;
    if (day.has("001")) {
      overnight.push({ fecha, valor: day.get("001")!.tasaPP });
      volume.push({ fecha, valor: Math.round(day.get("001")!.volumen / 1e9) }); // ARS billions
    }
    if (day.has("003")) three_day.push({ fecha, valor: day.get("003")!.tasaPP });
    if (day.has("007")) seven_day.push({ fecha, valor: day.get("007")!.tasaPP });
  }

  // Latest curve — all plazos for the most recent date
  const latestDate = dates[dates.length - 1];
  const latestDay = byDatePlazo.get(latestDate) ?? new Map();
  const latestCurve: RepoTermPoint[] = Array.from(latestDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plazo, r]) => ({ plazo, tasa: r.tasaPP, vol: r.volumen, ops: r.cantOperaciones }));

  return { overnight, three_day, seven_day, volume, latestCurve };
}

// ---- Main fetch ----

export async function fetchMercadoData(): Promise<MercadoData> {
  const [repoRes, caucionesRes, rentafijaRes, forexRes] = await Promise.allSettled([
    fetchRepoHistory(6),
    fetchMAE("/mercado/cotizaciones/cauciones", { pageNumber: 1 }) as Promise<MAEQuote[]>,
    fetchMAE("/mercado/cotizaciones/rentafija", { pageNumber: 1 }) as Promise<MAEQuote[]>,
    fetchMAE("/mercado/cotizaciones/forex", { pageNumber: 1 }) as Promise<MAEQuote[]>,
  ]);

  if (repoRes.status === "rejected")
    console.error("[MAE] repo fetch failed:", repoRes.reason);
  if (caucionesRes.status === "rejected")
    console.error("[MAE] cauciones fetch failed:", caucionesRes.reason);
  if (rentafijaRes.status === "rejected")
    console.error("[MAE] rentafija fetch failed:", rentafijaRes.reason);
  if (forexRes.status === "rejected")
    console.error("[MAE] forex fetch failed:", forexRes.reason);

  const rawRepo   = repoRes.status       === "fulfilled" ? repoRes.value       : [];
  const cauciones = (caucionesRes.status === "fulfilled" ? caucionesRes.value  : []) as MAEQuote[];
  const rentafija = (rentafijaRes.status === "fulfilled" ? rentafijaRes.value  : []) as MAEQuote[];
  const forex     = (forexRes.status     === "fulfilled" ? forexRes.value      : []) as MAEQuote[];

  const {
    overnight, three_day, seven_day, volume, latestCurve,
  } = buildRepoSeries(rawRepo);

  const lastRepoDate = overnight.at(-1)?.fecha ?? null;
  const marketOpen = cauciones.length > 0 || rentafija.length > 0 || forex.length > 0;

  return {
    repoOvernight:   overnight,
    repo3d:          three_day,
    repo7d:          seven_day,
    repoVolume:      volume,
    repoLatestCurve: latestCurve,
    cauciones,
    rentafija,
    forex,
    lastRepoDate,
    marketOpen,
  };
}
