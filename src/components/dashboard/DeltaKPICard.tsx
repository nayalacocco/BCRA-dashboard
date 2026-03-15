"use client";

import { formatDate } from "@/lib/bcra/format";

interface DeltaKPICardProps {
  label: string;
  value: number | null | undefined;
  date?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
  /** Delta calculado: { abs: variación absoluta, pct: variación % } */
  delta?: { abs: number | null; pct: number | null };
  /** Si true: verde=positivo, rojo=negativo (ej. reservas). Si false: al revés (ej. inflación). */
  positiveIsGood?: boolean;
  /** Muestra siempre signo +/- en el valor principal (para variaciones diarias) */
  showSign?: boolean;
  /** Muestra valor compacto (divide por 1000 y agrega "B") para M$ grandes */
  compact?: boolean;
}

function formatCompact(value: number, decimals: number): { display: string; scale: string } {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return {
      display: (value / 1_000_000).toLocaleString("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      scale: "B",
    };
  }
  if (abs >= 1_000) {
    return {
      display: (value / 1_000).toLocaleString("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      scale: "K",
    };
  }
  return {
    display: value.toLocaleString("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    scale: "",
  };
}

export function DeltaKPICard({
  label,
  value,
  date,
  prefix = "",
  suffix = "",
  decimals = 0,
  color = "#3b5bdb",
  delta,
  positiveIsGood = true,
  showSign = false,
  compact = false,
}: DeltaKPICardProps) {
  // Format main value
  let displayValue = "—";
  let scaleLabel = "";
  if (value != null) {
    if (compact) {
      const { display, scale } = formatCompact(value, decimals);
      displayValue = display;
      scaleLabel = scale;
    } else {
      displayValue =
        (showSign && value > 0 ? "+" : "") +
        value.toLocaleString("es-AR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
    }
  }

  // Delta direction and color
  const hasAbsDelta = delta?.abs != null;
  const hasPctDelta = delta?.pct != null;
  const isPositive = (delta?.abs ?? 0) > 0;
  const isNeutral = (delta?.abs ?? 0) === 0;

  const deltaIsGood = positiveIsGood ? isPositive : !isPositive;
  const deltaColor = isNeutral
    ? "text-slate-400 bg-slate-100 dark:bg-slate-800"
    : deltaIsGood
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
    : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30";

  const arrow = isNeutral ? "–" : isPositive ? "▲" : "▼";

  // Absolute delta formatted
  const absFormatted =
    hasAbsDelta && delta!.abs != null
      ? (delta!.abs > 0 ? "+" : "") +
        delta!.abs.toLocaleString("es-AR", {
          minimumFractionDigits: decimals > 2 ? 2 : decimals,
          maximumFractionDigits: decimals > 2 ? 2 : decimals,
        })
      : null;

  const pctFormatted =
    hasPctDelta && delta!.pct != null
      ? Math.abs(delta!.pct).toFixed(2) + "%"
      : null;

  return (
    <div className="card card-dark p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
      {/* Label */}
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
        {label}
      </p>

      {/* Main value */}
      <div className="flex items-baseline gap-1 flex-wrap">
        {prefix && (
          <span className="text-base font-semibold text-slate-500 dark:text-slate-400">
            {prefix}
          </span>
        )}
        <span
          className="font-mono text-xl font-bold tracking-tight leading-none"
          style={{ color }}
        >
          {displayValue}
          {scaleLabel && (
            <span className="text-sm ml-0.5 opacity-70">{scaleLabel}</span>
          )}
        </span>
        {suffix && (
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {suffix}
          </span>
        )}
      </div>

      {/* Delta badge */}
      {(hasAbsDelta || hasPctDelta) && (
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold w-fit ${deltaColor}`}>
          <span>{arrow}</span>
          {absFormatted && <span>{absFormatted}</span>}
          {pctFormatted && absFormatted && <span className="opacity-60">|</span>}
          {pctFormatted && <span>{pctFormatted}</span>}
        </div>
      )}

      {/* Date */}
      {date && (
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-auto">
          Al {formatDate(date)}
        </p>
      )}
    </div>
  );
}
