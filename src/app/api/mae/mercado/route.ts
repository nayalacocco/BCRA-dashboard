/**
 * GET /api/mae/mercado
 * Server-side proxy for MAE MarketData API.
 * Called by MercadoClient (client component) so data is always fresh.
 * Returns { data, error } — error is null on success.
 */

import { NextResponse } from "next/server";
import { fetchMercadoData } from "@/lib/mae/mercado";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchMercadoData();
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/mae/mercado]", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
