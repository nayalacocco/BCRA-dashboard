"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SerieData } from "@/lib/bcra/types";
import { formatDate, formatDateShort } from "@/lib/bcra/format";
import { CHART_COLORS } from "@/lib/bcra/constants";

interface SeriesComparatorProps {
  series: SerieData[];
  normalized?: boolean;
  height?: number;
}

// Combinar múltiples series por fecha
function mergeSeries(series: SerieData[]): Record<string, number | string>[] {
  const fechaSet = new Set<string>();
  series.forEach((s) => s.datos.forEach((d) => fechaSet.add(d.fecha)));

  const sortedFechas = Array.from(fechaSet).sort();

  return sortedFechas.map((fecha) => {
    const row: Record<string, number | string> = { fecha };
    series.forEach((s) => {
      const point = s.datos.find((d) => d.fecha === fecha);
      if (point) row[s.label] = point.valor;
    });
    return row;
  });
}

// Tooltip custom
function MultiTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm min-w-[160px]">
      <div className="text-slate-400 text-xs mb-2">{formatDate(label ?? "")}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-xs">
            {p.value?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SeriesComparator({
  series,
  normalized = false,
  height = 360,
}: SeriesComparatorProps) {
  if (!series.length) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-xl text-slate-400 dark:text-slate-500 text-sm"
        style={{ height }}
      >
        Seleccioná al menos una variable para visualizar
      </div>
    );
  }

  // Normalizar a base 100 si corresponde
  const displaySeries = normalized
    ? series.map((s) => {
        if (!s.datos.length) return s;
        const base = s.datos[0].valor;
        if (base === 0) return s;
        return {
          ...s,
          datos: s.datos.map((d) => ({ ...d, valor: (d.valor / base) * 100 })),
        };
      })
    : series;

  const merged = mergeSeries(displaySeries);

  // Reducir ticks
  const tickCount = Math.min(merged.length, 8);
  const step = Math.floor(merged.length / tickCount);
  const ticks = merged
    .filter((_, i) => i % step === 0 || i === merged.length - 1)
    .map((d) => String(d.fecha));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border, #e2e8f0)"
          vertical={false}
        />
        <XAxis
          dataKey="fecha"
          ticks={ticks}
          tickFormatter={formatDateShort}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? (v / 1_000_000).toFixed(1) + "M"
              : v >= 1_000
              ? (v / 1_000).toFixed(0) + "K"
              : v.toLocaleString("es-AR", { maximumFractionDigits: 2 })
          }
        />
        <Tooltip content={<MultiTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
        />
        {displaySeries.map((s, i) => (
          <Line
            key={s.idVariable}
            type="monotone"
            dataKey={s.label}
            stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
