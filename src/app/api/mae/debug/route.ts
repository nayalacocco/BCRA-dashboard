/**
 * GET /api/mae/debug
 * Temporary diagnostic endpoint — tests MAE API connectivity from Vercel.
 * Remove after debugging.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.MAE_API_KEY;

  if (!key) {
    return NextResponse.json({ error: "MAE_API_KEY not set" }, { status: 500 });
  }

  const results: Record<string, unknown> = {
    keyPresent: true,
    keyLength: key.length,
    keyPrefix: key.slice(0, 8) + "...",
  };

  // Test repo endpoint (the one that works outside market hours)
  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - 14); // last 2 weeks
    const url = `https://api.mae.com.ar/MarketData/v1/mercado/cotizaciones/repo?fechaDesde=${desde.toISOString().split("T")[0]}&fechaHasta=${new Date().toISOString().split("T")[0]}&pageNumber=1`;

    const res = await fetch(url, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });

    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 200); }

    results.repoStatus = res.status;
    results.repoHeaders = Object.fromEntries(res.headers.entries());
    results.repoRecords = Array.isArray(parsed) ? parsed.length : parsed;
    results.repoSample = Array.isArray(parsed) ? parsed[0] : null;
  } catch (err) {
    results.repoError = String(err);
  }

  return NextResponse.json(results);
}
