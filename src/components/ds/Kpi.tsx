"use client";

import { useTokens } from "@/components/theme/ThemeProvider";

/**
 * Sistema de diseño v5 — KPIs en franja horizontal.
 * Cada KPI: rótulo, valor (cifras tabulares), delta neutro, sparkline de 12 meses y una línea de contexto.
 * El delta va en text-2: el color no se usa para "bueno/malo".
 */

export function Sparkline({ data, width = 96, height = 26 }: { data: (number | null)[]; width?: number; height?: number }) {
  const t = useTokens();
  const pts = data.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null && Number.isFinite(p[1]));
  if (pts.length < 2) return <div style={{ width, height }} aria-hidden />;
  const vals = pts.map((p) => p[1]);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const X = (i: number) => 2 + ((width - 6) * i) / (data.length - 1);
  const Y = (v: number) => 3 + (height - 6) * (1 - (v - mn) / (mx - mn || 1));
  const d = pts.map(([i, v], j) => `${j ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block mt-1.5">
      <path d={d} fill="none" stroke={t.text2} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={X(li)} cy={Y(lv)} r={2.5} fill={t.text} />
    </svg>
  );
}

export interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  /** Variación contra el período anterior, ya formateada (p. ej. "+0,3 pp vs. sep-26"). */
  delta?: string;
  spark?: (number | null)[];
  /** Línea de contexto: referencia para leer el valor ("Esperable al azar: 84,9 %"). */
  context?: React.ReactNode;
  /** Definición corta (tooltip nativo). */
  hint?: string;
}

export function Kpi({ label, value, unit, delta, spark, context, hint, onClick }: KpiProps & { onClick?: () => void }) {
  const cls = "px-4 py-3.5 border-r border-ds-rule last:border-r-0 [&:nth-child(2n)]:max-lg:border-r-0";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        className={`${cls} text-left hover:bg-ds-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-celeste`}
      >
        <KpiBody label={label} value={value} unit={unit} delta={delta} spark={spark} context={context} />
      </button>
    );
  }
  return (
    <div className={cls} title={hint}>
      <KpiBody label={label} value={value} unit={unit} delta={delta} spark={spark} context={context} />
    </div>
  );
}

function KpiBody({ label, value, unit, delta, spark, context }: KpiProps) {
  return (
    <>
      <p className="text-[12.5px] text-ds-text-2 leading-snug">{label}</p>
      <p className="tnum text-[26px] font-semibold tracking-[-0.01em] text-ds-head mt-1 leading-tight">
        {value}
        {unit && <span className="text-[13px] font-normal text-ds-muted ml-1">{unit}</span>}
      </p>
      {delta && <p className="tnum text-[12.5px] text-ds-text-2">{delta}</p>}
      {spark && <Sparkline data={spark} />}
      {context && <p className="tnum text-[11.5px] text-ds-muted mt-1">{context}</p>}
    </>
  );
}

export function KpiStrip({ children, cols = 5 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      className="grid grid-cols-2 lg:[grid-template-columns:var(--kpi-cols)] border-t-2 border-ds-head border-b border-b-ds-rule mt-6"
      style={{ ["--kpi-cols" as string]: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
