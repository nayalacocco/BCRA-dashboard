"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { DataPoint } from "@/lib/bcra/types";

interface SparklineChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
}

export function SparklineChart({
  data,
  color = "#3b5bdb",
  height = 52,
}: SparklineChartProps) {
  if (!data.length) return null;

  // Media para referencia
  const avg = data.reduce((s, d) => s + d.valor, 0) / data.length;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <ReferenceLine y={avg} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth={1} />
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "none",
            borderRadius: "8px",
            padding: "6px 10px",
            fontSize: "11px",
            color: "#f1f5f9",
          }}
          itemStyle={{ color: "#f1f5f9" }}
          labelFormatter={(label) => String(label)}
          formatter={(value: number) => [
            value.toLocaleString("es-AR", { maximumFractionDigits: 4 }),
            "",
          ]}
          separator=""
        />
        <Line
          type="monotone"
          dataKey="valor"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
