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
import type { DataPoint } from "@/lib/bcra/types";

const MONTH_NAMES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Colors for past years: most-recent first
const PAST_YEAR_COLORS = [
  "#f76707", // -1y orange
  "#ae3ec9", // -2y purple
  "#0ca678", // -3y teal
  "#3b5bdb", // -4y blue
  "#e03131", // -5y red
  "#20c997", // -6y
  "#fcc419", // -7y
  "#748ffc", // -8y
];

const AVG_COLOR = "#94a3b8";
const AVG_KEY = "Promedio";

interface SeasonalChartProps {
  data: DataPoint[];
  color?: string; // current year line color
  unit?: string;
  height?: number;
  maxPastYears?: number;
}

function buildSeasonalData(data: DataPoint[], maxPastYears: number) {
  const currentYear = new Date().getFullYear();

  // Aggregate by year-month: compute monthly average
  const agg = new Map<string, { sum: number; n: number }>();
  data.forEach((d) => {
    const parts = d.fecha.split("-");
    const key = `${parts[0]}-${parts[1]}`;
    const prev = agg.get(key) ?? { sum: 0, n: 0 };
    agg.set(key, { sum: prev.sum + d.valor, n: prev.n + 1 });
  });

  const byYearMonth = new Map<string, number>();
  agg.forEach(({ sum, n }, key) => byYearMonth.set(key, sum / n));

  // All years in the data
  const yearsSet = new Set<number>();
  byYearMonth.forEach((_, key) => yearsSet.add(Number(key.split("-")[0])));
  const allYears = Array.from(yearsSet).sort();

  // Past years to display: up to maxPastYears most recent
  const pastYears = allYears
    .filter((y) => y < currentYear)
    .slice(-maxPastYears);

  // Complete past years (at least 6 months of data) for average
  const completePastYears = pastYears.filter((year) => {
    let count = 0;
    for (let m = 1; m <= 12; m++) {
      if (byYearMonth.has(`${year}-${String(m).padStart(2, "0")}`)) count++;
    }
    return count >= 6;
  });

  // Build chart rows: one per month
  const chartData = MONTH_NAMES.map((name, i) => {
    const m = String(i + 1).padStart(2, "0");
    const row: Record<string, number | string> = { month: name };

    // Past years
    pastYears.forEach((year) => {
      const val = byYearMonth.get(`${year}-${m}`);
      if (val != null) row[String(year)] = val;
    });

    // Current year
    const curVal = byYearMonth.get(`${currentYear}-${m}`);
    if (curVal != null) row[String(currentYear)] = curVal;

    // Average across complete past years
    if (completePastYears.length > 0) {
      const vals: number[] = [];
      completePastYears.forEach((year) => {
        const val = byYearMonth.get(`${year}-${m}`);
        if (val != null) vals.push(val);
      });
      if (vals.length > 0) {
        row[AVG_KEY] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }

    return row;
  });

  return {
    chartData,
    pastYears,
    currentYear,
    completePastYears,
    hasCurrentYear: allYears.includes(currentYear),
  };
}

function SeasonalTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; stroke: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  // Sort: current year first, then average, then past years desc
  const sorted = [...payload].sort((a, b) => {
    const aIsAvg = a.name === AVG_KEY;
    const bIsAvg = b.name === AVG_KEY;
    if (!aIsAvg && !bIsAvg) return Number(b.name) - Number(a.name);
    if (aIsAvg) return 1;
    if (bIsAvg) return -1;
    return 0;
  });

  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm min-w-[170px]">
      <div className="text-slate-400 text-xs mb-2 font-medium capitalize">{label}</div>
      {sorted.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full inline-block shrink-0"
              style={{ backgroundColor: p.stroke }}
            />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-xs">
            {p.value?.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
            {unit && <span className="text-slate-400 ml-1 text-xs">{unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SeasonalChart({
  data,
  color = "#3b5bdb",
  unit = "",
  height = 380,
  maxPastYears = 8,
}: SeasonalChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-xl text-slate-400 dark:text-slate-500 text-sm"
        style={{ height }}
      >
        Sin datos para mostrar
      </div>
    );
  }

  const { chartData, pastYears, currentYear, completePastYears, hasCurrentYear } =
    buildSeasonalData(data, maxPastYears);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border, #e2e8f0)"
          vertical={false}
        />
        <XAxis
          dataKey="month"
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
        <Tooltip content={<SeasonalTooltip unit={unit} />} />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
        />

        {/* Average line: bold dashed, drawn first so it's behind other lines */}
        {completePastYears.length > 1 && (
          <Line
            type="monotone"
            dataKey={AVG_KEY}
            stroke={AVG_COLOR}
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}

        {/* Past years: light, thin, ordered oldest→newest */}
        {pastYears.map((year, i) => {
          // Most-recent past year gets PAST_YEAR_COLORS[0], oldest gets higher index
          const colorIndex = pastYears.length - 1 - i;
          const lineColor = PAST_YEAR_COLORS[colorIndex] ?? "#94a3b8";
          return (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              stroke={lineColor}
              strokeWidth={1.5}
              strokeOpacity={0.45}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          );
        })}

        {/* Current year: bold, bright, drawn last (on top) */}
        {hasCurrentYear && (
          <Line
            type="monotone"
            dataKey={String(currentYear)}
            stroke={color}
            strokeWidth={3}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
