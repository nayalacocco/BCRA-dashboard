/**
 * Helpers de formato para valores y fechas del BCRA.
 */

import type { DataPoint } from "./types";

/** Formatea una fecha "YYYY-MM-DD" a "DD/MM/YYYY" */
export function formatDate(isoDate: string): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** Formatea un objeto Date a "DD/MM/YYYY HH:mm" en timezone de Argentina */
export function formatDateTime(date: Date): string {
  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formatea una fecha "YYYY-MM-DD" a "MMM YY" (para ejes de gráficos) */
export function formatDateShort(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

/** Formatea un valor numérico con opciones de display */
export function formatValue(
  value: number | null | undefined,
  options: {
    decimals?: number;
    prefix?: string;
    suffix?: string;
    compact?: boolean;
  } = {}
): string {
  if (value == null) return "—";

  const { decimals = 2, prefix = "", suffix = "", compact = false } = options;

  let formatted: string;

  if (compact && Math.abs(value) >= 1_000_000) {
    formatted = (value / 1_000_000).toLocaleString("es-AR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "M";
  } else if (compact && Math.abs(value) >= 1_000) {
    formatted = (value / 1_000).toLocaleString("es-AR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + "K";
  } else {
    formatted = value.toLocaleString("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return `${prefix}${formatted}${suffix ? " " + suffix : ""}`.trim();
}

/** Calcula variación porcentual entre dos valores */
export function calcChange(
  current: number | undefined,
  previous: number | undefined
): { pct: number | null; direction: "up" | "down" | "neutral" } {
  if (current == null || previous == null || previous === 0) {
    return { pct: null, direction: "neutral" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
  return { pct, direction };
}

/** Normaliza una serie de datos a base 100 en el primer punto */
export function normalizeToBase100(data: DataPoint[]): DataPoint[] {
  if (!data.length) return [];
  const base = data[0].valor;
  if (base === 0) return data;
  return data.map((d) => ({ ...d, valor: (d.valor / base) * 100 }));
}

/** Calcula el ratio entre dos arrays de DataPoints alineados por fecha */
export function calcRatioSeries(
  numeradorData: DataPoint[],
  denominadorData: DataPoint[]
): Array<{ fecha: string; ratio: number; numerador: number; denominador: number }> {
  const denomMap = new Map(denominadorData.map((d) => [d.fecha, d.valor]));

  return numeradorData
    .filter((d) => denomMap.has(d.fecha) && denomMap.get(d.fecha) !== 0)
    .map((d) => ({
      fecha: d.fecha,
      numerador: d.valor,
      denominador: denomMap.get(d.fecha)!,
      ratio: d.valor / denomMap.get(d.fecha)!,
    }));
}

/** Genera un CSV string a partir de datos tabulares */
export function generateCSV(
  rows: Record<string, string | number | null>[],
  columns: { key: string; label: string }[]
): string {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = row[c.key];
          if (val == null) return "";
          if (typeof val === "string") return `"${val.replace(/"/g, '""')}"`;
          return String(val);
        })
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

/** Descarga un string como archivo */
export function downloadFile(content: string, filename: string, type = "text/csv;charset=utf-8;") {
  const blob = new Blob(["\uFEFF" + content], { type }); // BOM para Excel en español
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
