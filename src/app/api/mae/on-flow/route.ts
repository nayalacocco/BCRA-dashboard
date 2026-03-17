/**
 * GET /api/mae/on-flow?ticker=YM34O
 *
 * Proxy to api.marketdata.mae.com.ar (A3 Mercados public portal).
 * This domain is NOT protected by the Incapsula WAF that blocks api.mae.com.ar,
 * so it can be called directly from Vercel edge functions.
 *
 * Returns the full amortization + coupon schedule for a given MAE ticker.
 * Data is static (schedule rarely changes) — cached 1hr.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export interface ONFlowCupon {
  fechaPago: string;      // "2026-07-17T00:00:00"
  numeroCupon: string;    // "003"
  vr: number;             // valor residual % (100 = no amortization yet)
  renta: number;          // interest per 100 nominal
  amortizacion: number;   // principal repayment per 100 nominal
  amasR: number;          // renta + amortizacion
  cashFlow: number;       // total cash flow
  vrCartera: number;
}

export interface ONFlowData {
  especie: string;
  moneda: string;              // "USD" | "ARS"
  numeroCuponActual: string | null;
  tir: number;                 // always 0 from source (calculated client-side)
  md: number;                  // always 0 from source (calculated client-side)
  detalle: ONFlowCupon[];
}

const MAE_FLOW_BASE = "https://api.marketdata.mae.com.ar/api/emisiones/flujofondos";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase() ?? "";

  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${MAE_FLOW_BASE}/${encodeURIComponent(ticker)}`, {
      headers: { Accept: "application/json" },
      // Cache 1hr — schedules change only at coupon payment events
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`MAE marketdata responded HTTP ${res.status}`);
    }

    const data = (await res.json()) as ONFlowData;

    // Return empty as error so caller can handle it clearly
    if (!data.especie || !data.detalle?.length) {
      return NextResponse.json(
        { data: null, error: `No hay flujo de fondos para ${ticker}` },
        { status: 404 },
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
