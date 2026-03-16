/**
 * GET /api/byma/mercado
 *
 * Server-side proxy for BYMA's public API (open.bymadata.com.ar).
 * Uses ISR: revalidate=300 (5 min). Vercel caches the response — actual
 * BYMA fetches only happen when cache expires AND a user visits the page.
 *
 * Rate math (costo=0, frecuencia máxima):
 *   - 5-min revalidation × 7.5h market day = max 90 fetches/day to BYMA
 *   - BYMA's public API has no documented rate limit (it powers their website)
 *   - Cost: $0
 */

import { NextResponse } from "next/server";
import { fetchBymaData } from "@/lib/byma/client";

// ISR: revalidate every 5 minutes
export const revalidate = 300;

export async function GET() {
  try {
    const data = await fetchBymaData();
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/byma/mercado]", message);
    return NextResponse.json(
      { data: null, error: message },
      { status: 502 }
    );
  }
}
