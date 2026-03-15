"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { DataPoint } from "@/lib/bcra/types";
import { formatDate, formatDateShort } from "@/lib/bcra/format";

interface HistoricalChartProps {
  data: DataPoint[];
  color?: string;
  label?: string;
  unit?: string;
  height?: number;
  showGrid?: boolean;
}

// Tooltip custom
function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
      <div className="text-slate-400 text-xs mb-1">{formatDate(label ?? "")}</div>
      <div className="font-mono font-semibold">
        {value?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
        {unit && <span className="text-slate-400 ml-1 text-xs">{unit}</span>}
      </div>
    </div>
  );
}

export function HistoricalChart({
  data,
  color = "#3b5bdb",
  unit = "",
  height = 300,
  showGrid = true,
}: HistoricalChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-xl text-slate-400 dark:text-slate-600 text-sm"
        style={{ height }}
      >
        Sin datos para mostrar
      </div>
    );
  }

  // Reducir puntos para ejes si hay muchos
  const tickCount = Math.min(data.length, 8);
  const step = Math.floor(data.length / tickCount);
  const ticks = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => d.fecha);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border, #e2e8f0)"
            vertical={false}
          />
        )}
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
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Line
          type="monotone"
          dataKey="valor"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
