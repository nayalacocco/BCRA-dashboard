/**
 * GET /api/mae/mercado
 * Server-side proxy for MAE MarketData API.
 * Called by MercadoClient (client component) so data is always fresh.
 * Returns { data, error, diagnostics } — error is null on success.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL = "https://api.mae.com.ar/MarketData/v1";

function getKey() {
  return process.env.MAE_API_KEY ?? null;
}

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

async function tryFetch(path: string, params: Record<string, string | number> = {}) {
  const key = getKey();
  if (!key) return { ok: false, status: null, error: "MAE_API_KEY not set", data: null, raw: null };

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* leave null */ }

    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status} ${res.statusText}`,
      data: parsed,
      raw: text.slice(0, 500),  // first 500 chars for debugging
    };
  } catch (err) {
    return { ok: false, status: null, error: String(err), data: null, raw: null };
  }
}

export async function GET() {
  const key = getKey();
  const keyInfo = key
    ? { present: true, length: key.length, prefix: key.slice(0, 6) + "..." }
    : { present: false, length: 0, prefix: null };

  const desde = new Date();
  desde.setMonth(desde.getMonth() - 1);
  const hasta = new Date();

  // Test all four endpoints in parallel
  const [repoResult, caucionesResult, rentafijaResult, forexResult] = await Promise.all([
    tryFetch("/mercado/cotizaciones/repo", {
      fechaDesde: toISO(desde),
      fechaHasta: toISO(hasta),
      pageNumber: 1,
    }),
    tryFetch("/mercado/cotizaciones/cauciones", { pageNumber: 1 }),
    tryFetch("/mercado/cotizaciones/rentafija", { pageNumber: 1 }),
    tryFetch("/mercado/cotizaciones/forex", { pageNumber: 1 }),
  ]);

  const diagnostics = {
    keyInfo,
    repo: {
      ok: repoResult.ok,
      status: repoResult.status,
      error: repoResult.error,
      recordCount: Array.isArray(repoResult.data) ? repoResult.data.length : null,
      sample: Array.isArray(repoResult.data) ? repoResult.data[0] : repoResult.raw,
    },
    cauciones: {
      ok: caucionesResult.ok,
      status: caucionesResult.status,
      error: caucionesResult.error,
      recordCount: Array.isArray(caucionesResult.data) ? caucionesResult.data.length : null,
    },
    rentafija: {
      ok: rentafijaResult.ok,
      status: rentafijaResult.status,
      error: rentafijaResult.error,
      recordCount: Array.isArray(rentafijaResult.data) ? rentafijaResult.data.length : null,
    },
    forex: {
      ok: forexResult.ok,
      status: forexResult.status,
      error: forexResult.error,
      recordCount: Array.isArray(forexResult.data) ? forexResult.data.length : null,
    },
  };

  // If we got repo data, return it normally with full data fetch
  if (repoResult.ok && Array.isArray(repoResult.data) && repoResult.data.length > 0) {
    // Import and use the real fetcher
    try {
      const { fetchMercadoData } = await import("@/lib/mae/mercado");
      const data = await fetchMercadoData();
      return NextResponse.json({ data, error: null, diagnostics });
    } catch (err) {
      return NextResponse.json(
        { data: null, error: String(err), diagnostics },
        { status: 500 }
      );
    }
  }

  // Otherwise return diagnostics so the client can show a useful error
  const mainError = repoResult.error ?? caucionesResult.error ?? "No data returned from MAE API";
  return NextResponse.json(
    { data: null, error: mainError, diagnostics },
    { status: repoResult.ok ? 200 : 502 }
  );
}
