/**
 * GET /api/mae/mercado
 *
 * Reads MAE market data from a pre-fetched GitHub raw snapshot.
 *
 * Architecture (why GitHub Actions instead of fetching MAE directly):
 *   MAE's api.mae.com.ar is protected by Incapsula WAF which blocks all
 *   cloud-provider IP ranges (Vercel/Cloudflare Edge, AWS Lambda).
 *   The API key works fine from residential / GitHub Actions IPs.
 *
 *   Solution: .github/workflows/mae-fetch.yml runs every 15 min during market
 *   hours on GitHub-hosted runners → commits public/data/mae-snapshot.json
 *   with "[skip vercel]" → this route reads the snapshot from GitHub raw.
 *
 * Returns { data: MercadoData, error: null, fetchedAt: string } on success
 *      or { data: null, error: string } on failure.
 */

import { NextResponse } from "next/server";
import type {
  MercadoData,
  SeriesPoint,
  RepoTermPoint,
  MAEQuote,
} from "@/lib/mae/mercado";

export const runtime = "edge";
export const dynamic  = "force-dynamic";

// ── Snapshot URL (GitHub raw, branch=main) ────────────────────────────────────
const SNAPSHOT_URL =
  "https://raw.githubusercontent.com/nayalacocco/BCRA-dashboard/main/public/data/mae-snapshot.json";

// ── Snapshot shape (as written by scripts/fetch-mae.py) ──────────────────────

interface PlazoData {
  tasa: number;
  vol:  number;
  ops:  number;
}

interface RepoDayEntry {
  fecha:  string;
  plazos: Record<string, PlazoData>;
}

interface MAESnapshot {
  fetchedAt:   string | null;
  repoHistory: RepoDayEntry[];
  cauciones:   MAEQuote[];
  rentafija:   MAEQuote[];
  forex:       MAEQuote[];
  latestCurve: RepoTermPoint[];
}

// ── Convert snapshot → MercadoData (the type the rest of the app uses) ────────

function snapshotToMercadoData(snap: MAESnapshot): MercadoData {
  const repoOvernight: SeriesPoint[] = [];
  const repo3d:        SeriesPoint[] = [];
  const repo7d:        SeriesPoint[] = [];
  const repoVolume:    SeriesPoint[] = [];

  for (const day of snap.repoHistory) {
    const on  = day.plazos["001"];
    const td  = day.plazos["003"];
    const sd  = day.plazos["007"];
    if (on) {
      repoOvernight.push({ fecha: day.fecha, valor: on.tasa });
      repoVolume.push({ fecha: day.fecha, valor: Math.round(on.vol / 1e9) }); // → ARS billions
    }
    if (td) repo3d.push({ fecha: day.fecha, valor: td.tasa });
    if (sd) repo7d.push({ fecha: day.fecha, valor: sd.tasa });
  }

  return {
    repoOvernight,
    repo3d,
    repo7d,
    repoVolume,
    repoLatestCurve: snap.latestCurve ?? [],
    cauciones:       snap.cauciones   ?? [],
    rentafija:       snap.rentafija   ?? [],
    forex:           snap.forex       ?? [],
    lastRepoDate:    repoOvernight.at(-1)?.fecha ?? null,
    marketOpen:      (snap.cauciones?.length ?? 0) > 0
                  || (snap.rentafija?.length ?? 0) > 0
                  || (snap.forex?.length     ?? 0) > 0,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  // Fetch pre-built snapshot from GitHub raw
  let snap: MAESnapshot | null = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(SNAPSHOT_URL, {
      // Edge runtime: no-store so we always get the latest committed file
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`GitHub raw responded with HTTP ${res.status}`);
    }

    snap = (await res.json()) as MAESnapshot;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    console.error("[MAE/mercado] snapshot fetch failed:", fetchError);
  }

  if (!snap) {
    return NextResponse.json(
      {
        data: null,
        error: `No se pudo obtener el snapshot MAE: ${fetchError}`,
        diagnostics: { snapshotUrl: SNAPSHOT_URL, fetchError },
      },
      { status: 502 },
    );
  }

  const data = snapshotToMercadoData(snap);

  return NextResponse.json({
    data,
    error:     null,
    fetchedAt: snap.fetchedAt ?? null,
  });
}
