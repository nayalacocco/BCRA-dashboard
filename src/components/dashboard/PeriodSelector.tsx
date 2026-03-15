"use client";

import { GOVERNMENT_PERIODS } from "@/lib/bcra/constants";

export type Period =
  | "1m" | "3m" | "6m" | "1y" | "2y" | "5y" | "max"
  | "milei" | "fernandez" | "macri" | "cfk2";

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period) => void;
}

const timePeriods: { key: Period; label: string }[] = [
  { key: "1m",  label: "1M" },
  { key: "3m",  label: "3M" },
  { key: "6m",  label: "6M" },
  { key: "1y",  label: "1A" },
  { key: "2y",  label: "2A" },
  { key: "5y",  label: "5A" },
  { key: "max", label: "MAX" },
];

const govColors: Record<string, string> = {
  milei:     "data-[active=true]:bg-violet-600 data-[active=true]:text-white",
  fernandez: "data-[active=true]:bg-blue-600 data-[active=true]:text-white",
  macri:     "data-[active=true]:bg-amber-600 data-[active=true]:text-white",
  cfk2:      "data-[active=true]:bg-emerald-700 data-[active=true]:text-white",
};

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Time periods */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {timePeriods.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            data-active={value === p.key}
            className="
              px-2.5 py-1 text-xs font-semibold rounded-md transition-colors
              text-slate-600 dark:text-slate-400
              hover:bg-white dark:hover:bg-slate-700
              data-[active=true]:bg-bcra-600 data-[active=true]:text-white
              data-[active=true]:shadow-sm
            "
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />

      {/* Government periods */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-slate-400 dark:text-slate-600 font-medium mr-1 hidden sm:block">
          Gov:
        </span>
        {GOVERNMENT_PERIODS.map((gov) => (
          <button
            key={gov.key}
            onClick={() => onChange(gov.key as Period)}
            data-active={value === gov.key}
            title={`${gov.presidente} (${gov.desde}${gov.hasta ? " – " + gov.hasta : " – hoy"})`}
            className={`
              px-2.5 py-1 text-xs font-semibold rounded-md transition-colors
              text-slate-600 dark:text-slate-400
              hover:bg-slate-100 dark:hover:bg-slate-700
              ${govColors[gov.key] ?? ""}
            `}
          >
            {gov.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helpers exported for use in DashboardClient
export function getDateRange(period: Period): { desde?: string; hasta?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split("T")[0];

  const gov = GOVERNMENT_PERIODS.find((g) => g.key === period);
  if (gov) return { desde: gov.desde, hasta: gov.hasta };

  switch (period) {
    case "1m": { const d = new Date(today); d.setMonth(d.getMonth() - 1); return { desde: iso(d) }; }
    case "3m": { const d = new Date(today); d.setMonth(d.getMonth() - 3); return { desde: iso(d) }; }
    case "6m": { const d = new Date(today); d.setMonth(d.getMonth() - 6); return { desde: iso(d) }; }
    case "1y": { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); return { desde: iso(d) }; }
    case "2y": { const d = new Date(today); d.setFullYear(d.getFullYear() - 2); return { desde: iso(d) }; }
    case "5y": { const d = new Date(today); d.setFullYear(d.getFullYear() - 5); return { desde: iso(d) }; }
    case "max": return {};
    default: return {};
  }
}

export function filterByPeriod(
  data: Array<{ fecha: string; valor: number }>,
  period: Period
): Array<{ fecha: string; valor: number }> {
  const { desde, hasta } = getDateRange(period);
  return data.filter((d) => {
    if (desde && d.fecha < desde) return false;
    if (hasta && d.fecha > hasta) return false;
    return true;
  });
}
