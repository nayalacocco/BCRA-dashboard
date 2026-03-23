import { NextResponse } from "next/server";

export const revalidate = 3600;

export interface DxyPoint {
  fecha: string;  // "YYYY-MM-DD"
  valor: number;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=max",
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; ArgentinaDashboard/1.0)",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No result from Yahoo Finance");

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const points: DxyPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || isNaN(close)) continue;
      const d = new Date(timestamps[i] * 1000);
      points.push({
        fecha: d.toISOString().split("T")[0],
        valor: parseFloat(close.toFixed(3)),
      });
    }

    return NextResponse.json({ data: points });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
