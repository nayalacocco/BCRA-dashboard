"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Customized,
  ErrorBar,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartFrame, ChartTooltip, DirectLabels, useChartStyle, yAxisNice } from "@/components/ds/Chart";
import { Control, Segmented } from "@/components/ds/Controls";
import { Formula } from "@/components/ds/Typography";
import { diverging } from "@/design/tokens";
import { GOVERNMENT_PERIODS } from "@/lib/bcra/constants";
import { fmt, fmtMes, fmtSigno } from "@/lib/inflacion/formato";
import type { PreciosRelativosData, PrecioRelativoItem } from "@/lib/inflacion/difusion-types";

export type KDir = "3" | "6" | "12";

/** Cuadrante de un ítem: nivel vs. su ancla (x) y dirección reciente (y). */
export function cuadrante(desvio: number | null, dir: number | null): string | null {
  if (desvio == null || dir == null) return null;
  if (desvio >= 0) return dir >= 0 ? "caro y encareciéndose" : "caro y corrigiendo";
  return dir >= 0 ? "barato y recuperando" : "barato y atrasándose";
}

/** Relevancia para rotular: ponderador × distancia al ancla. */
export function relevancia(it: PrecioRelativoItem, peso: number | null | undefined) {
  return (peso ?? 0) * Math.abs(it.desvio_filtrada ?? 0);
}

const FUENTE = "Fuente: INDEC (IPC base dic-2016), cálculo propio. Series desestacionalizadas.";

// Eventos con fecha oficial (anotaciones del gráfico de evolución)
const EVENTOS: { fecha: string; texto: string }[] = [
  { fecha: "2019-09", texto: "Cepo (Com. A 6770)" },
  { fecha: "2023-12", texto: "Devaluación" },
  { fecha: "2025-04", texto: "Fin del cepo" },
];

/**
 * Límite de escala robusto: si el valor más extremo es más del doble del segundo, la escala se corta
 * en 1,25 × el segundo y el extremo se dibuja en el borde (marcado como fuera de escala).
 */
function limite(vals: number[]): number {
  const a = vals.map(Math.abs).sort((x, y) => y - x);
  if (a.length < 2) return a[0] ?? 10;
  return a[0] > 2 * a[1] ? a[1] * 1.25 : a[0];
}
const recortar = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

// ---------------------------------------------------------------------------
// a) Nivel vs. dirección
// ---------------------------------------------------------------------------

export function NivelDireccion({ precios, ultimo }: { precios: PreciosRelativosData; ultimo: string }) {
  const S = useChartStyle();
  const { t: T } = S;
  const [k, setK] = useState<KDir>("6");
  const g = precios.grupos.Nacional;
  const bt = precios.backtest;

  const puntos = useMemo(() => {
    const ps = Object.entries(g.items)
      .filter(([, it]) => it.desvio_filtrada != null && it[`d${k}` as const] != null)
      .map(([id, it]) => {
        const x = it.desvio_filtrada as number;
        const s = it.desvio_simple ?? x;
        return {
          id,
          nombre: it.nombre,
          x,
          y: it[`d${k}` as const] as number,
          simple: it.desvio_simple,
          peso: g.peso?.[id] ?? 0,
          err: [Math.max(0, x - Math.min(x, s)), Math.max(0, Math.max(x, s) - x)] as [number, number],
          rel: relevancia(it, g.peso?.[id]),
          etiqueta: false,
        };
      });
    [...ps].sort((a, b) => b.rel - a.rel).slice(0, 8).forEach((p) => (p.etiqueta = true));
    // Escala robusta: los extremos aislados se dibujan en el borde (el tooltip y la tabla muestran el valor real)
    const limX = limite(ps.map((p) => p.x));
    const limY = limite(ps.map((p) => p.y));
    return ps.map((p) => {
      const xc = recortar(p.x, limX);
      const yc = recortar(p.y, limY);
      const lo = recortar(p.x - p.err[0], limX);
      const hi = recortar(p.x + p.err[1], limX);
      return { ...p, xReal: p.x, yReal: p.y, x: xc, y: yc, err: [xc - lo, hi - xc] as [number, number], fuera: xc !== p.x || yc !== p.y };
    });
  }, [g, k]);

  const xs = puntos.flatMap((p) => [p.x - p.err[0], p.x + p.err[1]]);
  const ys = puntos.map((p) => p.y);
  const xAx = yAxisNice(xs, 10, [0]);
  const yAx = yAxisNice(ys, 5, [0]);
  const maxAbs = Math.max(10, ...xs.map(Math.abs));

  const masLejos = [...puntos].filter((p) => p.peso >= 1).sort((a, b) => Math.abs(b.xReal) - Math.abs(a.xReal))[0];
  const f = bt.filtrada;

  return (
    <ChartFrame
      title={`Nivel vs. dirección: 27 aperturas nacionales (s.e.)`}
      sub={
        masLejos
          ? `El más alejado de su ancla (con ponderador ≥ 1 %) es ${masLejos.nombre.toLowerCase()}: ${fmtSigno(masLejos.xReal)} % y ${fmtSigno(masLejos.yReal)} % en ${k} meses (${cuadrante(masLejos.xReal, masLejos.yReal)}). En el backtest, el desvío no anticipó la corrección a ${bt.horizonte_meses} meses: es una lectura de nivel, no una señal de timing.`
          : undefined
      }
      right={
        <Control label="Dirección">
          <Segmented
            ariaLabel="Ventana de la dirección"
            value={k}
            onChange={setK}
            options={(["3", "6", "12"] as KDir[]).map((x) => ({ key: x, label: `${x} meses` }))}
          />
        </Control>
      }
      legend={[
        { label: "Por debajo de su ancla", color: diverging(T, -0.8), kind: "block" },
        { label: "Por encima de su ancla", color: diverging(T, 0.8), kind: "block" },
        { label: "Rango entre anclas (filtrada ↔ promedio simple)", color: T.text2 },
      ]}
      table={{
        columns: ["Ítem", "Desvío vs. ancla filtrada", "Desvío vs. promedio simple", `Δ ${k} meses`, "Ponderador", "Cuadrante"],
        rows: [...puntos]
          .sort((a, b) => a.xReal - b.xReal)
          .map((p) => [p.nombre, `${fmtSigno(p.xReal)} %`, p.simple == null ? "—" : `${fmtSigno(p.simple)} %`, `${fmtSigno(p.yReal)} %`, `${fmt(p.peso, 1)} %`, cuadrante(p.xReal, p.yReal) ?? "—"]),
      }}
      source={`${FUENTE} Tamaño = ponderador.`}
      lastData={ultimo}
      howTo={
        <>
          <p>
            Eje horizontal: cuánto está hoy el precio relativo del rubro por encima o por debajo de su ancla. El punto es el ancla de mayor
            jerarquía disponible (historia filtrada: promedio en los {precios.ancla.meses} meses sin cepo,{" "}
            {precios.ancla.periodos.map(([a, b]) => `${fmtMes(a)} a ${fmtMes(b)}`).join(" y ")}); la barra llega hasta el promedio simple de
            toda la muestra. Eje vertical: cambio del precio relativo en los últimos {k} meses; no depende de ningún ancla.
          </p>
          <p>
            Backtest ({bt.n_items} aperturas, orígenes semestrales {fmtMes(bt.origenes[0])}–{fmtMes(bt.origenes[bt.origenes.length - 1])}, anclas
            calculadas solo con datos pasados): cambio a {bt.horizonte_meses} meses contra desvío. β = {fmt(f.beta, 2)} (t = {fmt(f.t, 1)}), R² ={" "}
            {fmt(f.r2 * 100, 0)} %, acierto de signo {fmt(f.acierto_signo * 100, 0)} %. No es distinto de cero: el desvío no predijo la corrección
            en ese horizonte.
          </p>
          <Formula>L_i,t = ln(I_i,t / I_i,dic-16) − ln(H_t / H_dic-16)   ·   desvío = exp(L_i,T − ancla_i) − 1   ·   Δk = exp(L_i,T − L_i,T−k) − 1</Formula>
        </>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 z-[1] text-[10.5px] text-ds-muted">
          <span className="absolute left-14 top-1">Barato y recuperando</span>
          <span className="absolute right-3 top-1">Caro y encareciéndose</span>
          <span className="absolute left-14 bottom-8">Barato y atrasándose</span>
          <span className="absolute right-3 bottom-8">Caro y corrigiendo</span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 18, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid {...S.grid} />
            <XAxis type="number" dataKey="x" {...xAx} {...S.xAxis} tickFormatter={(x) => `${fmtSigno(x, 0)} %`} />
            <YAxis type="number" dataKey="y" {...yAx} {...S.yAxis} tickFormatter={(y) => `${fmtSigno(y, 0)} %`} />
            <ZAxis type="number" dataKey="peso" range={[40, 520]} />
            <ReferenceLine x={0} {...S.zeroLine} />
            <ReferenceLine y={0} {...S.zeroLine} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof puntos)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className="bg-ds-surface border border-ds-rule-strong rounded-[5px] px-2.5 py-2 text-[12px] text-ds-text shadow-[0_4px_14px_rgba(0,0,0,0.12)] min-w-[220px]">
                    <div className="font-semibold mb-1">{p.nombre}</div>
                    {[
                      ["Desvío vs. ancla filtrada", `${fmtSigno(p.xReal)} %`],
                      ["Desvío vs. promedio simple", p.simple == null ? "—" : `${fmtSigno(p.simple)} %`],
                      [`Δ ${k} meses`, `${fmtSigno(p.yReal)} %`],
                      ["Ponderador", `${fmt(p.peso, 1)} %`],
                    ].map(([a, b]) => (
                      <div key={a} className="flex justify-between gap-4">
                        <span className="text-ds-text-2">{a}</span>
                        <b className="tnum">{b}</b>
                      </div>
                    ))}
                    <div className="text-ds-muted mt-1">
                      {cuadrante(p.xReal, p.yReal)}
                      {p.fuera ? " · fuera de escala, dibujado en el borde" : ""}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              data={puntos}
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number; size?: number; payload?: (typeof puntos)[number] }) => {
                const d = props.payload;
                if (!d) return <g />;
                const r = Math.sqrt((props.size ?? 60) / Math.PI);
                return (
                  <g>
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={r}
                      fill={diverging(T, d.x / maxAbs)}
                      fillOpacity={0.85}
                      stroke={d.fuera ? T.text : T.surface}
                      strokeWidth={d.fuera ? 1.5 : 1}
                      strokeDasharray={d.fuera ? "2 2" : undefined}
                    />
                    {(d.etiqueta || d.fuera) && (
                      <text
                        x={(props.cx ?? 0) + (d.fuera && (props.cx ?? 0) > 300 ? -(r + 3) : r + 3)}
                        y={(props.cy ?? 0) + (d.fuera ? 14 + r : 3.5)}
                        textAnchor={d.fuera && (props.cx ?? 0) > 300 ? "end" : "start"}
                        fontSize={10.5}
                        fill={T.text2}
                      >
                        {d.nombre.length > 26 ? `${d.nombre.slice(0, 25)}…` : d.nombre}
                        {d.fuera ? ` (${fmtSigno(d.xReal, 0)} %; ${fmtSigno(d.yReal, 0)} %) ↗` : ""}
                      </text>
                    )}
                  </g>
                );
              }}
            >
              <ErrorBar dataKey="err" direction="x" width={0} stroke={T.text2} strokeWidth={1.25} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// b) Evolución de hasta 4 ítems, con su ancla
// ---------------------------------------------------------------------------

export function EvolucionRelativa({
  precios,
  desde,
  hasta,
  ultimo,
}: {
  precios: PreciosRelativosData;
  /** Rango visible en fechas "YYYY-MM" (lo fija el selector de período de la página). */
  desde: string;
  hasta: string;
  ultimo: string;
}) {
  const S = useChartStyle();
  const { t: T } = S;
  const g = precios.grupos.Nacional;
  const ids = Object.keys(g.items);
  const porRelevancia = [...ids].sort((a, b) => relevancia(g.items[b], g.peso?.[b]) - relevancia(g.items[a], g.peso?.[a]));
  const [sel, setSel] = useState<string[]>(porRelevancia.slice(0, 4));
  const colores = [T.s1, T.s2, T.s3, T.s4];

  const fechas = precios.fechas;
  const a = Math.max(0, fechas.indexOf(desde));
  const bIdx = fechas.indexOf(hasta);
  const b = bIdx === -1 ? fechas.length - 1 : bIdx;
  const rows = useMemo(
    () =>
      fechas.slice(a, b + 1).map((f, j) => {
        const r: Record<string, number | string | null> = { fecha: f };
        for (const id of sel) r[id] = g.serie?.[id]?.[a + j] ?? null;
        return r;
      }),
    [fechas, a, b, sel, g]
  );
  const vals = rows.flatMap((r) => sel.map((id) => r[id])).filter((x): x is number => typeof x === "number");
  const yAx = yAxisNice(vals, 10, [100]);
  const ult = rows[rows.length - 1] ?? {};
  const gobs = GOVERNMENT_PERIODS.map((gp) => ({ ...gp, d: gp.desde.slice(0, 7), h: (gp.hasta ?? "2099-12").slice(0, 7) })).filter(
    (gp) => gp.h >= fechas[a] && gp.d <= fechas[b]
  );
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? [...s.slice(1), id] : [...s, id]));

  const sub = sel
    .map((id) => {
      const v = g.serie?.[id]?.[b];
      return v == null ? null : `${g.items[id].nombre.toLowerCase()} ${fmtSigno(v - 100)} %`;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <ChartFrame
      title="Evolución del precio relativo frente a su ancla (s.e.)"
      sub={sub ? `Respecto de su ancla (= 100), en ${fmtMes(fechas[b])}: ${sub}.` : undefined}
      legend={[
        ...sel.map((id, i) => ({ label: g.items[id].nombre, color: colores[i] })),
        { label: "Ancla (historia filtrada)", color: T.text2, kind: "dash" as const },
      ]}
      table={{
        columns: ["Mes", ...sel.map((id) => g.items[id].nombre)],
        rows: [...rows].reverse().map((r) => [fmtMes(String(r.fecha)), ...sel.map((id) => (r[id] == null ? "—" : fmt(r[id] as number)))]),
      }}
      source={`${FUENTE} Índice: ancla = 100. Sombreado: gobiernos.`}
      lastData={ultimo}
      howTo={
        <>
          <p>
            Cada línea es el precio relativo del rubro (su índice dividido por el nivel general) llevado a base ancla = 100. Por encima de 100,
            el rubro está más caro que en su historia sin cepo; por debajo, más barato. Elegí hasta 4 rubros.
          </p>
          <Formula>índice_i,t = 100 · exp(L_i,t − ancla_i)</Formula>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5 my-2">
        {porRelevancia.map((id) => {
          const i = sel.indexOf(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              aria-pressed={i >= 0}
              className={`px-2 py-0.5 text-[11.5px] rounded-[5px] border transition-colors ${
                i >= 0 ? "border-ds-head text-ds-head font-medium" : "border-ds-rule text-ds-text-2 hover:bg-ds-soft"
              }`}
              style={i >= 0 ? { boxShadow: `inset 3px 0 0 ${colores[i]}` } : undefined}
            >
              {g.items[id].nombre}
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 18, right: 108, left: 0, bottom: 4 }}>
          <CartesianGrid {...S.grid} />
          {gobs.map((gp, i) => (
            <ReferenceArea
              key={gp.key}
              x1={gp.d < fechas[a] ? fechas[a] : gp.d}
              x2={gp.h > fechas[b] ? fechas[b] : gp.h}
              fill={T.band}
              fillOpacity={i % 2 ? T.bandOpacity * 0.5 : 0}
              ifOverflow="hidden"
              label={{ value: gp.label, position: "insideTopLeft", fill: T.muted, fontSize: 10.5 }}
            />
          ))}
          {EVENTOS.filter((e) => e.fecha >= fechas[a] && e.fecha <= fechas[b]).map((e) => (
            <ReferenceLine
              key={e.fecha}
              x={e.fecha}
              stroke={T.ruleStrong}
              strokeDasharray="2 3"
              label={{ value: e.texto, position: "insideBottomLeft", fill: T.text2, fontSize: 10.5 }}
            />
          ))}
          <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={Math.max(0, Math.ceil(rows.length / 8) - 1)} {...S.xAxis} />
          <YAxis {...yAx} tickFormatter={(x) => fmt(x, 0)} {...S.yAxis} />
          <ReferenceLine y={100} {...S.refLine} />
          <Tooltip
            cursor={S.cursorLine}
            content={
              <ChartTooltip
                series={sel.map((id, i) => ({ key: id, name: g.items[id].nombre, color: colores[i], fmt: (x: number) => fmt(x) }))}
                labelFormat={fmtMes}
              />
            }
          />
          {sel.map((id, i) => (
            <Line key={id} dataKey={id} stroke={colores[i]} {...S.line} />
          ))}
          <Customized
            component={(p: object) => (
              <DirectLabels
                {...p}
                t={T}
                items={sel.map((id, i) => ({
                  value: typeof ult[id] === "number" ? (ult[id] as number) : null,
                  name: g.items[id].nombre.length > 14 ? `${g.items[id].nombre.slice(0, 13)}…` : g.items[id].nombre,
                  color: colores[i],
                  fmt: (x: number) => fmt(x),
                }))}
              />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
