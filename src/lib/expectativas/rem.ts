/**
 * REM (Relevamiento de Expectativas de Mercado) — directo del BCRA.
 *
 * Por qué: la réplica en datos.gob.ar dejó de actualizarse en dic-2025. El BCRA publica
 * un histórico completo en un .xlsx de URL fija, actualizado con cada relevamiento.
 *
 * Hoja "Base de Datos Completa" (fila 1 título, fila 2 encabezados):
 *   Fecha de pronóstico | Variable | Referencia | Período | Mediana | Promedio | Desvío | ...
 *   2026-10-30 | Precios minoristas (IPC nivel general; INDEC) | var. % mensual      | 2026-10-01 | 1.8
 *   2026-10-30 | Precios minoristas (IPC nivel general; INDEC) | var. % i.a.; dic-26 | 2026       | 30.36
 *   2026-10-30 | Precios minoristas (IPC nivel general; INDEC) | var. % i.a.; oct-27 | Próx. 12 meses | 21.8
 * Los valores ya vienen en porcentaje.
 */

import { readSheet } from "read-excel-file/node";
import type { SeriesPoint } from "@/lib/indec/client";

const REM_HISTORICO_URL =
  "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/informes/relevamiento-expectativas-mercado-historico.xlsx";

const SHEET = "Base de Datos Completa";
const VAR_IPC = "Precios minoristas (IPC nivel general; INDEC)";

export interface RemData {
  /** Mediana esperada para el mes del relevamiento (t), indexada por mes objetivo */
  mesCorriente: SeriesPoint[];
  /** Mediana esperada para el mes siguiente (t+1), indexada por mes objetivo */
  proximoMes: SeriesPoint[];
  /** Mediana esperada próximos 12 meses, indexada por mes del relevamiento */
  prox12m: SeriesPoint[];
  /** Proyección de inflación anual (dic/dic) del último relevamiento: [{ anio: 2026, valor: 30.36 }, ...] */
  anuales: { anio: number; valor: number }[];
  /** Mes del último relevamiento, "YYYY-MM-01" */
  ultimoRelevamiento: string | null;
}

/** Date | número serial de Excel | "YYYY-MM-DD" → "YYYY-MM-01" */
function toMonth(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && v > 20000 && v < 80000) d = new Date(Math.round((v - 25569) * 86_400_000));
  else if (typeof v === "string" && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 7) + "-01";
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) + "-01";
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function parseRemRows(rows: unknown[][]): RemData {
  const mesCorriente = new Map<string, number>();
  const proximoMes = new Map<string, number>();
  const prox12m = new Map<string, number>();
  const anualesPorRelev = new Map<string, Map<number, number>>();
  let ultimo: string | null = null;

  for (const r of rows) {
    if (!r || r[1] !== VAR_IPC) continue;
    const relev = toMonth(r[0]);
    const ref = String(r[2] ?? "");
    const mediana = typeof r[4] === "number" ? r[4] : Number(r[4]);
    if (!relev || !Number.isFinite(mediana)) continue;
    if (!ultimo || relev > ultimo) ultimo = relev;

    if (ref === "var. % mensual") {
      const periodo = toMonth(r[3]);
      if (!periodo) continue;
      if (periodo === relev) mesCorriente.set(periodo, mediana);
      else if (periodo === addMonths(relev, 1)) proximoMes.set(periodo, mediana);
    } else if (String(r[3]) === "Próx. 12 meses") {
      prox12m.set(relev, mediana);
    } else if (/^\d{4}$/.test(String(r[3]).trim())) {
      const anio = Number(String(r[3]).trim());
      const m = anualesPorRelev.get(relev) ?? new Map<number, number>();
      m.set(anio, mediana);
      anualesPorRelev.set(relev, m);
    }
  }

  const toSeries = (m: Map<string, number>): SeriesPoint[] =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, valor]) => ({ fecha, valor }));

  const anuales = ultimo
    ? [...(anualesPorRelev.get(ultimo) ?? new Map<number, number>()).entries()]
        .sort(([a], [b]) => a - b)
        .map(([anio, valor]) => ({ anio, valor }))
    : [];

  return {
    mesCorriente: toSeries(mesCorriente),
    proximoMes: toSeries(proximoMes),
    prox12m: toSeries(prox12m),
    anuales,
    ultimoRelevamiento: ultimo,
  };
}

/** Devuelve null si falla, para que el llamador use el respaldo. */
export async function fetchRem(): Promise<RemData | null> {
  try {
    const res = await fetch(REM_HISTORICO_URL, {
      next: { revalidate: 6 * 3600 },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`REM xlsx ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const rows = (await readSheet(buf, SHEET)) as unknown[][];
    const data = parseRemRows(rows);
    if (!data.mesCorriente.length) throw new Error("REM xlsx sin filas de IPC mensual");
    return data;
  } catch (err) {
    console.error("[REM] fallback a datos.gob.ar:", err);
    return null;
  }
}
