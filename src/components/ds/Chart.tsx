"use client";

import { useState } from "react";
import { useTokens } from "@/components/theme/ThemeProvider";
import type { Tokens } from "@/design/tokens";
import { HowTo } from "./Typography";

/**
 * Sistema de diseño v5 — gráficos.
 *
 * Reglas: líneas de 2 px; grid solo horizontal, 1 px, color rule; etiqueta directa al final de cada
 * serie (valor + nombre) y leyenda arriba si hay 2+ series; tooltip con crosshair en líneas y por barra
 * en barras; eje Y ajustado a los datos salvo en barras (0 obligatorio); sin splines ni doble eje;
 * pie con fuente y último dato; "Ver tabla" en los gráficos principales.
 */

// ---------------------------------------------------------------------------
// Estilo base para Recharts
// ---------------------------------------------------------------------------

export function chartStyle(t: Tokens) {
  const tick = { fontSize: 11, fill: t.muted, fontFamily: "Inter, system-ui, sans-serif" };
  return {
    tick,
    grid: { vertical: false, stroke: t.rule, strokeWidth: 1, strokeDasharray: undefined },
    xAxis: { tick, tickLine: false, axisLine: { stroke: t.ruleStrong }, tickMargin: 6 },
    yAxis: { tick, tickLine: false, axisLine: false, width: 52 },
    /** Crosshair vertical para gráficos de líneas. */
    cursorLine: { stroke: t.text2, strokeWidth: 1 },
    /** Resaltado por barra. */
    cursorBar: { fill: t.text2, fillOpacity: 0.08 },
    line: { strokeWidth: 2, dot: false, isAnimationActive: false, type: "linear" as const },
    band: { fill: t.band, fillOpacity: t.bandOpacity, ifOverflow: "hidden" as const },
    bandLabel: (value: string, position: "insideTopLeft" | "insideTopRight" | "insideBottomLeft" | "insideBottomRight" = "insideTopLeft") => ({
      value,
      position,
      fill: t.muted,
      fontSize: 10.5,
    }),
    refLine: { stroke: t.text2, strokeDasharray: "4 4", strokeWidth: 1 },
    zeroLine: { stroke: t.text2, strokeWidth: 1 },
  };
}

export function useChartStyle() {
  const t = useTokens();
  return { t, ...chartStyle(t) };
}

/** Dominio del eje Y ajustado a los datos, redondeado a `paso` y con un margen chico. */
export function yDomain(values: (number | null | undefined)[], paso: number, incluir: number[] = []): [number, number] {
  return yAxisNice(values, paso, incluir).domain;
}

/**
 * Eje Y ajustado a los datos con ticks "redondos": múltiplos de `paso` (que se agranda ×2, ×5, ×10
 * si harían falta más de `maxTicks`). Devuelve dominio y ticks para pasar a <YAxis domain ticks>.
 */
export function yAxisNice(
  values: (number | null | undefined)[],
  paso: number,
  incluir: number[] = [],
  maxTicks = 6
): { domain: [number, number]; ticks: number[] } {
  const v = [...values, ...incluir].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return { domain: [0, paso], ticks: [0, paso] };
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const pad = (mx - mn || paso) * 0.04;
  let step = paso;
  let lo = 0;
  let hi = 0;
  for (const f of [1, 2, 5, 10, 20, 50, 100]) {
    step = paso * f;
    lo = Math.floor((mn - pad) / step) * step;
    hi = Math.ceil((mx + pad) / step) * step;
    if ((hi - lo) / step <= maxTicks - 1) break;
  }
  const n = Math.round((hi - lo) / step);
  const ticks = Array.from({ length: n + 1 }, (_, i) => +(lo + i * step).toFixed(10));
  return { domain: [lo, hi], ticks };
}

// ---------------------------------------------------------------------------
// Leyenda
// ---------------------------------------------------------------------------

export interface LegendItem {
  label: string;
  color: string;
  kind?: "line" | "dash" | "block" | "band";
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-ds-text-2 mt-0.5 mb-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === "block" || it.kind === "band" ? (
            <i className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: it.color, opacity: it.kind === "band" ? 0.35 : 1 }} />
          ) : (
            <i
              className="inline-block w-3.5"
              style={{ borderTop: `2px ${it.kind === "dash" ? "dashed" : "solid"} ${it.color}` }}
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export interface TipSerie {
  key: string;
  name: string;
  color: string;
  fmt: (v: number) => string;
}

interface TipPayload {
  dataKey?: string | number;
  value?: number | null;
}

/** Contenido del tooltip: fecha y una fila por serie, en el orden de `series`. */
export function ChartTooltip({
  active,
  payload,
  label,
  series,
  labelFormat,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  series: TipSerie[];
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const val = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const rows = series.filter((s) => {
    const v = val(s.key);
    return v != null && Number.isFinite(v);
  });
  if (!rows.length) return null;
  return (
    <div className="bg-ds-surface border border-ds-rule-strong rounded-[5px] px-2.5 py-2 text-[12px] shadow-[0_4px_14px_rgba(0,0,0,0.12)] min-w-[150px] text-ds-text">
      {label != null && <div className="text-ds-muted mb-1">{labelFormat ? labelFormat(String(label)) : label}</div>}
      {rows.map((s) => (
        <div key={s.key} className="flex justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-ds-text-2">
            <i className="inline-block w-2 h-2 rounded-[2px]" style={{ background: s.color }} />
            {s.name}
          </span>
          <b className="tnum font-semibold">{s.fmt(val(s.key) as number)}</b>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etiquetas directas al final de cada serie (con anti-superposición)
// ---------------------------------------------------------------------------

export interface DirectLabelItem {
  value: number | null | undefined;
  name: string;
  color: string;
  fmt: (v: number) => string;
  /** Rótulo de referencia (techo, banda): se dibuja en gris. */
  muted?: boolean;
}

interface AxisLike {
  scale: (v: number) => number;
}

/**
 * Se usa dentro de <Customized component={<DirectLabels items={…} />} />: Recharts le pasa la escala
 * del eje Y y el área del gráfico. Requiere margen derecho (~100 px) en el gráfico.
 */
export function DirectLabels({
  items,
  yAxisMap,
  offset,
  t,
}: {
  items: DirectLabelItem[];
  yAxisMap?: Record<string, AxisLike>;
  offset?: { left: number; width: number; top: number; height: number };
  t: Tokens;
}) {
  const axis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (!axis || !offset) return null;
  const SEP = 26;
  const labs = items
    .filter((it): it is DirectLabelItem & { value: number } => it.value != null && Number.isFinite(it.value))
    .map((it) => ({ ...it, y: axis.scale(it.value) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < SEP) labs[k].y = labs[k - 1].y + SEP;
  // Si la última quedó fuera del área, se corre todo hacia arriba
  const exceso = labs.length ? labs[labs.length - 1].y - (offset.top + offset.height) : 0;
  if (exceso > 0) labs.forEach((l) => (l.y -= exceso));
  const x = offset.left + offset.width + 8;
  return (
    <g>
      {labs.map((l) => (
        <g key={l.name}>
          <rect x={x} y={l.y - 9} width={8} height={8} rx={2} fill={l.color} opacity={l.muted ? 0.6 : 1} />
          <text x={x + 13} y={l.y - 1} fontSize={11.5} fontWeight={600} fill={t.text} style={{ fontVariantNumeric: "tabular-nums" }}>
            {l.fmt(l.value)}
          </text>
          <text x={x + 13} y={l.y + 12} fontSize={11} fill={l.muted ? t.muted : t.text2}>
            {l.name}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Marco de gráfico
// ---------------------------------------------------------------------------

export interface DataTableSpec {
  columns: string[];
  rows: (string | number)[][];
}

export function ChartFrame({
  title,
  sub,
  legend,
  howTo,
  table,
  source,
  lastData,
  children,
  right,
}: {
  title: string;
  /** Subtítulo que enuncia la conclusión. */
  sub?: React.ReactNode;
  legend?: LegendItem[];
  howTo?: React.ReactNode;
  table?: DataTableSpec;
  source: string;
  lastData: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className="border-t border-ds-head pt-3.5 pb-1 m-0 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="min-w-0">
          <p className="font-semibold text-[15px] text-ds-text">{title}</p>
          {sub && <p className="text-ds-text-2 text-[13px] mt-0.5 mb-1.5">{sub}</p>}
        </figcaption>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {table && (
            <button
              onClick={() => setVerTabla((v) => !v)}
              className="border border-ds-rule-strong text-ds-text-2 rounded-[5px] px-2 py-0.5 text-[11.5px] hover:bg-ds-soft"
              aria-expanded={verTabla}
            >
              {verTabla ? "Ocultar tabla" : "Ver tabla"}
            </button>
          )}
        </div>
      </div>
      {legend && legend.length > 0 && <Legend items={legend} />}
      {children}
      {table && verTabla && (
        <div className="max-h-[260px] overflow-auto mt-2 text-[12.5px] border-t border-ds-rule">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-ds-bg">
              <tr>
                {table.columns.map((c, i) => (
                  <th
                    key={c}
                    className={`smallcaps text-ds-text-2 px-2 py-1.5 border-b border-ds-rule-strong ${i ? "text-right" : "text-left"}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, i) => (
                    <td key={i} className={`px-2 py-1 border-b border-ds-rule ${i ? "text-right tnum" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between gap-2.5 flex-wrap text-[11.5px] text-ds-muted mt-1.5">
        <span>{source}</span>
        <span>Último dato: {lastData}</span>
      </div>
      {howTo && <HowTo>{howTo}</HowTo>}
    </figure>
  );
}
