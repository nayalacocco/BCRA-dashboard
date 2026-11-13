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
  /**
   * "pct" (default): variación absoluta + variación porcentual.
   * "pp": para tasas/porcentajes — muestra solo la diferencia en puntos porcentuales
   * (una variación % de una tasa, ej. 1,7%→1,9% = "+11,76%", es engañosa).
   */
  deltaMode?: "pct" | "pp";
  /**
   * Si la fecha del dato es más vieja que esto (días), la tarjeta se marca como
   * desactualizada. Atrapa series discontinuadas en la fuente (ej. datos.gob.ar
   * mantiene IDs vivos pero sin datos nuevos). Default 150 días ≈ rezago normal
   * de series mensuales de INDEC (~3 meses) + margen.
   */
  staleAfterDays?: number;
}

function daysSince(isoDate: string): number {
  const t = new Date(isoDate + "T12:00:00Z").getTime();
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
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
  deltaMode,
  staleAfterDays = 150,
}: DeltaKPICardProps) {
  // Por defecto, si la unidad es un porcentaje (tasa, inflación), el delta va en pp
  const mode = deltaMode ?? (suffix.trim().startsWith("%") ? "pp" : "pct");
  const isStale = value != null && !!date && daysSince(date) > staleAfterDays;
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

  // Absolute delta formatted — en la misma escala que el valor principal
  let absFormatted: string | null = null;
  if (hasAbsDelta && delta!.abs != null) {
    const sign = delta!.abs > 0 ? "+" : "";
    if (compact && value != null && Math.abs(value) >= 1_000) {
      // Misma escala que el valor principal (ej. valor "46,8B" → delta "-0,15B", no "-153.460")
      const div = Math.abs(value) >= 1_000_000 ? 1_000_000 : 1_000;
      const scale = div === 1_000_000 ? "B" : "K";
      absFormatted =
        sign +
        (delta!.abs / div).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        scale;
    } else {
      const d = decimals > 2 ? 2 : decimals;
      absFormatted =
        sign +
        delta!.abs.toLocaleString("es-AR", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        });
    }
    if (mode === "pp") absFormatted += " pp";
  }

  const pctFormatted =
    mode === "pct" && hasPctDelta && delta!.pct != null
      ? Math.abs(delta!.pct).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + "%"
      : null;

  return (
    <div className="card card-dark p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
      {/* Label */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
          {label}
        </p>
        {isStale && (
          <span
            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            title="La fuente dejó de publicar esta serie o tiene un rezago anormal"
          >
            ⚠ desactualizado
          </span>
        )}
      </div>

      {/* Main value */}
      <div className="flex items-baseline gap-1 flex-wrap">
        {prefix && (
          <span className="text-base font-semibold text-slate-500 dark:text-slate-400">
            {prefix}
          </span>
        )}
        <span
          className={`font-mono text-xl font-bold tracking-tight leading-none ${isStale ? "text-slate-400 dark:text-slate-500" : ""}`}
          style={{ color: isStale ? undefined : color }}
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
