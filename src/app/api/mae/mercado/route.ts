/**
 * GET /api/mae/mercado
 *
 * Runs on Vercel Edge Runtime (Cloudflare network) to bypass MAE's IP blocklist
 * which blocks Vercel's standard serverless (AWS Lambda) IPs.
 *
 * Returns { data: MercadoData, error: null } on success
 *      or { data: null, error: string, diagnostics } on failure.
 */

import { NextResponse } from "next/server";
import type { MercadoData, SeriesPoint, MAEQuote, RepoTermPoint } from "@/lib/mae/mercado";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const BASE = "https://api.mae.com.ar/MarketData/v1";

// ---- helpers ----

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

function getKey(): string | null {
  return process.env.MAE_API_KEY ?? null;
}

async function maeGet(path: string, params: Record<string, string | number>, key: string) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: {
      "x-api-key": key,
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---- repo pagination (max 6 pages = ~3 months on Edge, timeout is 30s) ----

interface RawRepo {
  fecha: string;
  plazo: string;
  tasaPP: number;
  volumen: number;
  cantOperaciones: number;
  [k: string]: unknown;
}

async function fetchAllRepos(key: string, months = 6): Promise<RawRepo[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - months);
  const hasta = new Date();

  const all: RawRepo[] = [];
  for (let page = 1; page <= 6; page++) {
    const batch = await maeGet(
      "/mercado/cotizaciones/repo",
      { fechaDesde: toISO(desde), fechaHasta: toISO(hasta), pageNumber: page },
      key,
    ) as RawRepo[];

    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 50) break;
  }
  return all;
}

function buildRepoSeries(records: RawRepo[]) {
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
    const on = day.get("001") ?? day.get("1");
    if (on) {
      overnight.push({ fecha, valor: on.tasaPP });
      volume.push({ fecha, valor: Math.round(on.volumen / 1e9) });
    }
    const td = day.get("003") ?? day.get("3");
    if (td) three_day.push({ fecha, valor: td.tasaPP });
    const sd = day.get("007") ?? day.get("7");
    if (sd) seven_day.push({ fecha, valor: sd.tasaPP });
  }

  const latestDate = dates[dates.length - 1];
  const latestDay  = byDatePlazo.get(latestDate) ?? new Map();
  const latestCurve: RepoTermPoint[] = Array.from(latestDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plazo, r]) => ({ plazo, tasa: r.tasaPP, vol: r.volumen, ops: r.cantOperaciones }));

  return { overnight, three_day, seven_day, volume, latestCurve };
}

// ---- main handler ----

export async function GET() {
  const key = getKey();
  if (!key) {
    return NextResponse.json(
      { data: null, error: "MAE_API_KEY not set in environment variables", diagnostics: null },
      { status: 500 },
    );
  }

  // Fetch repo history + today's snapshots in parallel
  const [repoResult, caucionesResult, rentafijaResult, forexResult] = await Promise.allSettled([
    fetchAllRepos(key, 6),
    maeGet("/mercado/cotizaciones/cauciones", { pageNumber: 1 }, key) as Promise<MAEQuote[]>,
    maeGet("/mercado/cotizaciones/rentafija", { pageNumber: 1 }, key) as Promise<MAEQuote[]>,
    maeGet("/mercado/cotizaciones/forex",     { pageNumber: 1 }, key) as Promise<MAEQuote[]>,
  ]);

  // Log errors for Vercel log tail
  if (repoResult.status      === "rejected") console.error("[MAE] repo:",      repoResult.reason);
  if (caucionesResult.status === "rejected") console.error("[MAE] cauciones:", caucionesResult.reason);
  if (rentafijaResult.status === "rejected") console.error("[MAE] rentafija:", rentafijaResult.reason);
  if (forexResult.status     === "rejected") console.error("[MAE] forex:",     forexResult.reason);

  const rawRepo   = repoResult.status       === "fulfilled" ? repoResult.value       : [];
  const cauciones = caucionesResult.status  === "fulfilled" ? (caucionesResult.value as MAEQuote[]) : [];
  const rentafija = rentafijaResult.status  === "fulfilled" ? (rentafijaResult.value as MAEQuote[]) : [];
  const forex     = forexResult.status      === "fulfilled" ? (forexResult.value     as MAEQuote[]) : [];

  // If repo is completely empty and all snapshots failed, return the error
  if (rawRepo.length === 0 && repoResult.status === "rejected") {
    const err = repoResult.reason instanceof Error ? repoResult.reason.message : String(repoResult.reason);
    return NextResponse.json(
      { data: null, error: err, diagnostics: { keyPresent: true, repoError: err } },
      { status: 502 },
    );
  }

  const { overnight, three_day, seven_day, volume, latestCurve } = buildRepoSeries(rawRepo);

  const data: MercadoData = {
    repoOvernight:   overnight,
    repo3d:          three_day,
    repo7d:          seven_day,
    repoVolume:      volume,
    repoLatestCurve: latestCurve,
    cauciones,
    rentafija,
    forex,
    lastRepoDate:    overnight.at(-1)?.fecha ?? null,
    marketOpen:      cauciones.length > 0 || rentafija.length > 0 || forex.length > 0,
  };

  return NextResponse.json({ data, error: null, diagnostics: null });
}
