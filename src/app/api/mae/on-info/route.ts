/**
 * GET /api/mae/on-info?ticker=BACGO
 *
 * Proxy to api.marketdata.mae.com.ar — fetches bond metadata from the ON
 * emissions listing endpoint. Returns maturity date, issuer, applicable law,
 * currency, and MAE internal IDs for a given MAE ticker.
 *
 * Source: api.marketdata.mae.com.ar/api/emisiones/on/Todos (public, no auth)
 * Cache: 24hr — bond metadata (maturity, law, issuer) rarely changes.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export interface ONInfoData {
  especie: string;
  titulo: string;
  emisor: string;
  fechaVencimiento: string;   // "YYYY-MM-DD"
  fechaAlta: string;          // "YYYY-MM-DD"
  moneda: string;             // "Dólares estadounidenses (U$S)" | "Pesos argentinos (S)" | etc.
  leyAplicable: string;       // "Argentina" | "Extranjera"
  jurisdiccion: string;
  negociacion: string;        // "A3/BYMA"
  id: string;
  codigo: string;
}

const MAE_LISTING_BASE =
  "https://api.marketdata.mae.com.ar/api/emisiones/on/Todos";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase() ?? "";

  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  const query = JSON.stringify({
    fechaDesde: "2010-01-01",
    fechaHasta: "2035-12-31",
    ticker,
    buscar: "SI",
    emisor: "",
  });

  try {
    const res = await fetch(
      `${MAE_LISTING_BASE}?oTitulo=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 }, // 24hr cache
      },
    );

    if (!res.ok) {
      throw new Error(`MAE marketdata responded HTTP ${res.status}`);
    }

    const data = await res.json() as Array<Record<string, string>>;

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { data: null, error: `No se encontró información para ${ticker}` },
        { status: 404 },
      );
    }

    const item = data[0];
    const info: ONInfoData = {
      especie: item.especies?.trim() ?? ticker,
      titulo: item.titulo ?? "",
      emisor: item.emisores ?? "",
      fechaVencimiento: item.fechaVencimiento
        ? item.fechaVencimiento.slice(0, 10)
        : "",
      fechaAlta: item.fechaAlta ? item.fechaAlta.slice(0, 10) : "",
      moneda: item.moneda ?? "",
      leyAplicable: item.leyAplicable ?? "",
      jurisdiccion: item.jurisdiccionAplicable ?? "",
      negociacion: item.negociacion ?? "",
      id: item.id ?? "",
      codigo: item.codigo ?? "",
    };

    return NextResponse.json({ data: info, error: null });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
