"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatDate, formatDateShort } from "@/lib/bcra/format";

interface RatioPoint {
  fecha: string;
  ratio: number;
  numerador: number;
  denominador: number;
}

interface RatioChartProps {
  data: RatioPoint[];
  numeradorLabel: string;
  denominadorLabel: string;
  height?: number;
}

function RatioTooltip({
  active,
  payload,
  label,
  numeradorLabel,
  denominadorLabel,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  numeradorLabel?: string;
  denominadorLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  // @ts-expect-error recharts payload shape
  const raw = point?.payload as RatioPoint;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
      <div className="text-slate-400 text-xs mb-2">{formatDate(label ?? "")}</div>
      <div className="font-mono font-bold text-base">
        Ratio: {raw?.ratio?.toLocaleString("es-AR", { maximumFractionDigits: 6 })}
      </div>
      <div className="text-xs text-slate-400 mt-1">
        {numeradorLabel}: {raw?.numerador?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
      </div>
      <div className="text-xs text-slate-400">
        {denominadorLabel}: {raw?.denominador?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
      </div>
    </div>
  );
}

export function RatioChart({
  data,
  numeradorLabel,
  denominadorLabel,
  height = 280,
}: RatioChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-xl text-slate-400 text-sm"
        style={{ height }}
      >
        Sin datos disponibles para el ratio seleccionado
      </div>
    );
  }

  const tickCount = Math.min(data.length, 8);
  const step = Math.floor(data.length / tickCount);
  const ticks = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => d.fecha);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="ratioGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b5bdb" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b5bdb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
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
          width={70}
          tickFormatter={(v: number) =>
            v.toLocaleString("es-AR", { maximumFractionDigits: 4 })
          }
        />
        <Tooltip
          content={
            <RatioTooltip
              numeradorLabel={numeradorLabel}
              denominadorLabel={denominadorLabel}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="ratio"
          stroke="#3b5bdb"
          strokeWidth={2}
          fill="url(#ratioGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: "#3b5bdb" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
