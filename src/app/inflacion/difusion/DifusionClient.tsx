"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
} from "recharts";
import { BlockSection } from "@/components/dashboard/BlockSection";
import { PeriodSelector, getDateRange, type Period } from "@/components/dashboard/PeriodSelector";
import type { DifusionData, K, PondKey, SerieKey, UniversoKey, Variante } from "@/lib/inflacion/difusion-types";
import { Heatmap } from "./Heatmap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const fmtMes = (f: string) => `${MESES[parseInt(f.slice(5, 7), 10) - 1]} ${f.slice(2, 4)}`;
export const fmt = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

const MIN_MESES = 6;

/** Índices [a, b] de `fechas` ("YYYY-MM") dentro del período; nunca menos de MIN_MESES. */
export function rango(fechas: string[], period: Period): [number, number] {
  const { desde, hasta } = getDateRange(period);
  let a = 0;
  let b = fechas.length - 1;
  if (desde) {
    const i = fechas.findIndex((f) => f >= desde.slice(0, 7));
    a = i === -1 ? b : i;
  }
  if (hasta) {
    while (b > 0 && fechas[b] > hasta.slice(0, 7)) b--;
  }
  if (b - a + 1 < MIN_MESES) a = Math.max(0, b - MIN_MESES + 1);
  return [a, b];
}

/** Tramos de π_i − π_t: los primeros N_DEBAJO no superan al nivel general; solo se grafican los de arriba. */
const N_DEBAJO = 4;
const BUCKET_COLORS: Record<number, string> = { 4: "#f3d9a4", 5: "#e9b949", 6: "#e08e2b", 7: "#c2255c" };
const TRAMOS_ARRIBA = [4, 5, 6, 7];
const K_COLORS: Record<K, string> = { "3": "#fab005", "6": "#f76707", "12": "#e03131" };
const KS: K[] = ["3", "6", "12"];

const tooltipStyle = {
  contentStyle: { background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};
const axisTick = { fontSize: 10, fill: "#94a3b8" };
const GRID = "rgba(148,163,184,0.12)";

// ---------------------------------------------------------------------------
// UI básicos
// ---------------------------------------------------------------------------

function Seg<T extends string>({
  label, value, onChange, options,
}: { label: string; value: T; onChange: (v: T) => void; options: { key: T; label: string; title?: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {options.map((o) => (
          <button
            key={o.key}
            title={o.title}
            onClick={() => onChange(o.key)}
            data-active={value === o.key}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 data-[active=true]:bg-bcra-600 data-[active=true]:text-white"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label, value, unit = "%", sub, hint, color = "#f76707",
}: { label: string; value: string; unit?: string; sub?: string; hint: string; color?: string }) {
  return (
    <div className="card card-dark p-4 flex flex-col gap-1.5" title={hint}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
        {label} <span className="text-slate-400 dark:text-slate-600 cursor-help">ⓘ</span>
      </p>
      <p className="font-mono text-xl font-bold tracking-tight leading-none" style={{ color }}>
        {value}
        <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
      </p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title, badge, formula, nota, children, right,
}: { title: string; badge?: string; formula?: string; nota?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card card-dark p-5">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <div className="flex items-center gap-2">
          {right}
          {badge && (
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{badge}</span>
          )}
        </div>
      </div>
      {formula && <p className="text-xs font-mono text-slate-500 dark:text-slate-500 mb-1">{formula}</p>}
      {nota && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{nota}</p>}
      {children}
    </div>
  );
}

function Leyenda({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
      {items.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span
            className="w-4 inline-block"
            style={{ borderTop: `2px ${s.dashed ? "dashed" : "solid"} ${s.color}` }}
          />
          <span className="text-xs text-slate-400">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function DifusionClient({
  data, generado, reconciliacionMaxPp,
}: { data: DifusionData; generado: string; reconciliacionMaxPp: number | null }) {
  const [period, setPeriod] = useState<Period>("2y");
  const [universo, setUniverso] = useState<UniversoKey>("todos");
  const [pond, setPond] = useState<PondKey>("pond");
  const [serie, setSerie] = useState<SerieKey>("orig");
  const [k, setK] = useState<K>("3");
  const [urlLeida, setUrlLeida] = useState(false);

  // Estado inicial desde la URL (?periodo=max&universo=nacional27&pond=simple&serie=sa&k=12): vistas compartibles
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pick = <T extends string>(key: string, ok: readonly T[], set: (x: T) => void) => {
      const x = q.get(key) as T | null;
      if (x && ok.includes(x)) set(x);
    };
    pick<Period>("periodo", ["1m", "3m", "6m", "1y", "2y", "5y", "max", "milei", "fernandez", "macri"], setPeriod);
    pick<UniversoKey>("universo", ["todos", "publicados", "nacional27"], setUniverso);
    pick<PondKey>("pond", ["pond", "simple"], setPond);
    pick<SerieKey>("serie", ["orig", "sa"], setSerie);
    pick<K>("k", KS, setK);
    setUrlLeida(true);
  }, []);

  // …y cada cambio de selector vuelve a la URL (sin recargar ni sumar entradas al historial)
  useEffect(() => {
    if (!urlLeida) return;
    const q = new URLSearchParams({ periodo: period, universo, pond, serie, k });
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [urlLeida, period, universo, pond, serie, k]);

  const v: Variante = data.variantes[`${universo}.${pond}.${serie}`];
  const [a, b] = useMemo(() => rango(data.fechas, period), [data.fechas, period]);
  const idx = useMemo(() => Array.from({ length: b - a + 1 }, (_, i) => a + i), [a, b]);
  const tickInterval = Math.max(0, Math.floor(idx.length / 12));

  const rows = useMemo(
    () =>
      idx.map((i) => {
        const row: Record<string, number | string | null> = {
          fecha: data.fechas[i],
          D: v.D[i],
          D3: v.regimen.D3[i],
          rho: v.rho[i],
          rho6: v.rho6[i],
          rho12: v.rho12[i],
          C: v.C[k][i],
          Cref: v.Cref[k][i],
        };
        for (const kk of KS) {
          row[`A${kk}`] = v.A[kk][i];
          row[`VR${kk}`] = v.VR[kk][i];
        }
        data.buckets_etiquetas.forEach((_, j) => (row[`b${j}`] = v.buckets[j][i]));
        return row;
      }),
    [idx, v, k, data]
  );

  /** Dominio numérico [min, max] redondeado a múltiplos de `paso`, calculado sobre las series visibles. */
  const dominio = (keys: string[], paso: number): [number, number] => {
    const vals = rows.flatMap((r) => keys.map((key) => r[key])).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (!vals.length) return [0, 100];
    return [Math.floor((Math.min(...vals) - 2) / paso) * paso, Math.ceil((Math.max(...vals) + 2) / paso) * paso];
  };

  // Mes de referencia = último del período elegido
  const t = b;
  const mes = fmtMes(data.fechas[t]);
  const masDe1pp = v.buckets.slice(N_DEBAJO + 2).reduce((s, x) => s + (x[t] ?? 0), 0);
  const [lo3, hi3] = v.VRbanda["3"];
  const [loK, hiK] = v.VRbanda[k];
  const codigo = v.regimen.codigo[t];
  const reg = data.regimenes[codigo];
  const amp = v.regimen.amplitud[t];
  const din = v.regimen.dinamica[t];
  const vr12 = v.VR["12"][t];
  const [lo12, hi12] = v.VRbanda["12"];
  const lectura12 =
    vr12 == null || lo12 == null || hi12 == null
      ? null
      : vr12 > hi12
        ? "en 12 meses el cambio de precios relativos es persistente"
        : vr12 < lo12
          ? "en 12 meses los precios relativos revierten"
          : "en 12 meses no se distingue del ruido";

  // Robustez: en cuántas de las variantes (universo × ponderación × serie) se repite la lectura del mes
  const todas = Object.values(data.variantes);
  const coincideDin = todas.filter((x) => x.regimen.dinamica[t] === din).length;
  const coincideAmp = todas.filter((x) => x.regimen.amplitud[t] === amp).length;

  // Cuadrante: últimos 12 meses del período
  const quad = useMemo(() => {
    const pts = [];
    for (let i = Math.max(a, t - 11); i <= t; i++) {
      const x = v.regimen.D3[i];
      const y = v.VR["3"][i];
      if (x != null && y != null) pts.push({ x, y, mes: fmtMes(data.fechas[i]), ultimo: i === t, etiqueta: false });
    }
    // Se rotulan el primero, el último y uno de cada tres
    pts.forEach((p, j) => (p.etiqueta = j === 0 || p.ultimo || (pts.length - 1 - j) % 3 === 0));
    return pts;
  }, [a, t, v, data.fechas]);
  const qx = quad.map((p) => p.x);
  const qy = quad.map((p) => p.y);
  const xMin = Math.floor(Math.min(30, ...qx) / 5) * 5;
  const xMax = Math.ceil(Math.max(55, ...qx) / 5) * 5;
  const yMax = Math.ceil(Math.max(2, ...qy) * 2) / 2;

  const u = data.universos[universo];
  const P = data.parametros;

  return (
    <div className="space-y-10">
      {/* ---- HEADER ---- */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Difusión y rotación de la inflación</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            ¿Suben todos los precios o unos pocos? ¿Se turnan o lideran siempre los mismos? · IPC INDEC por aperturas y región
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            IPC al: {fmtMes(data.ultimo_periodo)}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-600">
            Calculado: {new Date(generado).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
          </div>
        </div>
      </div>

      {/* ---- CONTROLES ---- */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-3 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 space-y-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Seg
            label="Universo"
            value={universo}
            onChange={setUniverso}
            options={[
              { key: "todos", label: `Canasta completa (${data.universos.todos.n})`, title: data.universos.todos.descripcion },
              { key: "publicados", label: `Aperturas (${data.universos.publicados.n})`, title: data.universos.publicados.descripcion },
              { key: "nacional27", label: `Nacional (${data.universos.nacional27.n})`, title: data.universos.nacional27.descripcion },
            ]}
          />
          <Seg
            label="Ponderación"
            value={pond}
            onChange={setPond}
            options={[
              { key: "pond", label: "Ponderado", title: "Cada ítem pesa su participación en la canasta" },
              { key: "simple", label: "Sin ponderar", title: "Cada ítem pesa 1/N" },
            ]}
          />
          <Seg
            label="Serie"
            value={serie}
            onChange={setSerie}
            options={[
              { key: "orig", label: "Original" },
              { key: "sa", label: "Desestacionalizada", title: P.desest.metodo },
            ]}
          />
        </div>
      </div>

      {/* ================================================================
          RÉGIMEN
      ================================================================ */}
      <BlockSection title={`Lectura del régimen — ${mes}`} icon="🧭" color="violet">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="card card-dark p-5 lg:col-span-2 flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Régimen</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{reg?.titulo ?? "—"}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">{reg?.texto}</p>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Amplitud. </span>
                {amp ? data.amplitud_etiquetas[amp] : "Sin dato"}.{" "}
                <span className="font-mono text-xs text-slate-500">
                  D̄(3m) = {fmt(v.regimen.D3[t])} % · umbrales {fmt(P.umbral_D_concentrada, 0)} / {fmt(P.umbral_D_generalizada, 0)} %
                </span>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Dinámica. </span>
                {din ? data.dinamica_etiquetas[din] : "Sin dato"}.{" "}
                <span className="font-mono text-xs text-slate-500">
                  VR(3) = {fmt(v.VR["3"][t], 2)} · banda {fmt(lo3, 2)}–{fmt(hi3, 2)} · C(3) = {fmt(v.C["3"][t])} % vs. {fmt(v.Cref["3"][t])} % al azar
                </span>
              </p>
              {lectura12 && (
                <p className="text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Horizonte largo. </span>
                  VR(12) = {fmt(vr12, 2)}: {lectura12}.
                </p>
              )}
            </div>
            {amp && din && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Robustez. </span>
                La dinámica se repite en {coincideDin} de {todas.length} variantes (universo × ponderación × serie); la amplitud, en{" "}
                {coincideAmp} de {todas.length}.
              </p>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Clasificación por reglas explícitas (ver Metodología). Es una lectura descriptiva, no una proyección.
            </p>
          </div>

          <div className="lg:col-span-3">
            <ChartCard
              title="Cuadrante de régimen"
              badge="últimos 12 meses"
              nota="Eje horizontal: amplitud (D̄, promedio 3 meses de la difusión). Eje vertical: variance ratio a 3 meses. Franjas grises: zona sin señal."
            >
              {quad.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">Sin dato</div>
              ) : (
                <div className="relative">
                  <div className="pointer-events-none absolute inset-0 z-[1] text-[10px] font-semibold uppercase tracking-wide text-slate-400/80">
                    <span className="absolute left-14 top-1">Concentrada y persistente</span>
                    <span className="absolute right-4 top-1">Generalizada y persistente</span>
                    <span className="absolute left-14 bottom-9">Concentrada que revierte</span>
                    <span className="absolute right-4 bottom-9">Generalizada y escalonada</span>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={[xMin, xMax]}
                        ticks={Array.from({ length: (xMax - xMin) / 5 + 1 }, (_, i) => xMin + 5 * i)}
                        tick={axisTick}
                        tickFormatter={(x) => `${x}%`}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        domain={[0, yMax]}
                        ticks={Array.from({ length: yMax / 0.5 + 1 }, (_, i) => i * 0.5)}
                        tick={axisTick}
                        width={36}
                        tickFormatter={(y) => fmt(y, 1)}
                      />
                      <ReferenceArea x1={P.umbral_D_concentrada} x2={P.umbral_D_generalizada} fill="#64748b" fillOpacity={0.14} />
                      {lo3 != null && hi3 != null && <ReferenceArea y1={lo3} y2={Math.min(hi3, yMax)} fill="#64748b" fillOpacity={0.14} />}
                      <ReferenceLine y={1} stroke="#64748b" strokeDasharray="4 3" />
                      <Tooltip
                        cursor={false}
                        {...tooltipStyle}
                        formatter={(val: number, name: string) => [name === "x" ? `${fmt(val)} %` : fmt(val, 2), name === "x" ? "D̄ (3m)" : "VR(3)"]}
                        labelFormatter={() => ""}
                      />
                      <Scatter
                        data={quad}
                        line={{ stroke: "#7c3aed", strokeWidth: 1.5, strokeOpacity: 0.6 }}
                        isAnimationActive={false}
                        shape={(p: { cx?: number; cy?: number; payload?: { ultimo: boolean; etiqueta: boolean; mes: string } }) => (
                          <g>
                            <circle
                              cx={p.cx}
                              cy={p.cy}
                              r={p.payload?.ultimo ? 6 : 3}
                              fill={p.payload?.ultimo ? "#a78bfa" : "#7c3aed"}
                              stroke={p.payload?.ultimo ? "#fff" : "none"}
                              strokeWidth={1.5}
                            />
                            {p.payload?.etiqueta && (
                              <text
                                x={p.cx}
                                y={(p.cy ?? 0) - (p.payload.ultimo ? 11 : 7)}
                                textAnchor="middle"
                                fontSize={p.payload.ultimo ? 11 : 9}
                                fontWeight={p.payload.ultimo ? 700 : 400}
                                fill={p.payload.ultimo ? "#e2e8f0" : "#94a3b8"}
                              >
                                {p.payload.mes}
                              </text>
                            )}
                          </g>
                        )}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      </BlockSection>

      {/* ================================================================
          DIFUSIÓN
      ================================================================ */}
      <BlockSection title="Difusión" icon="🌊" color="orange">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {u.descripcion}. {u.n} ítems · {pond === "pond" ? "ponderado por participación en la canasta" : "cada ítem pesa 1/N"} ·{" "}
          {serie === "sa" ? "series desestacionalizadas" : "series originales"}. Fuente: INDEC, IPC base dic-2016.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Stat
            label={`Difusión D — ${mes}`}
            value={fmt(v.D[t])}
            sub={`Nivel general: ${fmt(data.headline[serie][t], 1)} % m/m`}
            hint="D_t = % de ítems con π_i,t > π_t (variación del ítem mayor que la del nivel general). Cerca de 50 %: distribución simétrica. Bajo: pocos ítems empujan el promedio."
          />
          <Stat
            label="Suben más de 1 pp sobre el general"
            value={fmt(masDe1pp)}
            sub={`De ${fmt(v.D[t])} % que supera al nivel general`}
            color="#c2255c"
            hint="% de la canasta con π_i,t − π_t > 1 pp: cuánto de la difusión corresponde a subas claramente por encima del promedio."
          />
          <Stat
            label="Rotación C(3)"
            value={fmt(v.C["3"][t])}
            sub={`Esperable al azar: ${fmt(v.Cref["3"][t])} %`}
            color="#fab005"
            hint="C_t(3) = % de ítems que superaron al nivel general en al menos uno de los últimos 3 meses. Referencia: 1 − Π(1 − D) si cada mes lideraran ítems al azar."
          />
          <Stat
            label="Variance ratio VR(3)"
            value={fmt(v.VR["3"][t], 2)}
            unit=""
            sub={`Banda sin memoria: ${fmt(lo3, 2)}–${fmt(hi3, 2)}`}
            color="#a78bfa"
            hint="VR < 1: los precios relativos revierten (se turnan). ≈ 1: ruido. > 1: cambio persistente de precios relativos."
          />
        </div>

        <div className="space-y-5">
          <ChartCard
            title="Ítems que suben más que el nivel general"
            badge={pond === "pond" ? "% de la canasta" : "% de los ítems"}
            formula="D_t = Σ ω_i · 1[π_i,t > π_t]"
            nota={`Cada barra es la difusión D del mes, abierta según cuánto supera cada ítem al nivel general (puntos porcentuales de variación m/m). Línea: promedio de 3 meses. Franja gris: zona intermedia (${fmt(P.umbral_D_concentrada, 0)}–${fmt(P.umbral_D_generalizada, 0)} %); por debajo la suba es concentrada, por encima generalizada.`}
          >
            <Leyenda
              items={[
                ...TRAMOS_ARRIBA.map((j) => ({ label: `${data.buckets_etiquetas[j]} pp`, color: BUCKET_COLORS[j] })),
                { label: "Promedio 3 meses", color: "#f76707" },
              ]}
            />
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap={idx.length > 40 ? 0 : "12%"}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} tick={axisTick} interval={tickInterval} />
                <YAxis
                  domain={[0, Math.max(60, dominio(["D", "D3"], 10)[1])]}
                  tickFormatter={(x) => `${x}%`}
                  tick={axisTick}
                  width={40}
                />
                <ReferenceArea y1={P.umbral_D_concentrada} y2={P.umbral_D_generalizada} fill="#64748b" fillOpacity={0.14} />
                <ReferenceLine y={50} stroke="#475569" strokeDasharray="4 3" />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={fmtMes}
                  formatter={(val: number, key: string) =>
                    key === "D3" ? [`${fmt(val)} %`, "Promedio 3 meses"] : [`${fmt(val)} %`, `${data.buckets_etiquetas[parseInt(key.slice(1), 10)]} pp`]
                  }
                  itemSorter={(it) => (it.dataKey === "D3" ? -99 : -parseInt(String(it.dataKey).slice(1), 10))}
                />
                {TRAMOS_ARRIBA.map((j) => (
                  <Bar key={j} dataKey={`b${j}`} stackId="b" fill={BUCKET_COLORS[j]} isAnimationActive={false} />
                ))}
                <Line type="linear" dataKey="D3" stroke="#f76707" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </BlockSection>

      {/* ================================================================
          ROTACIÓN
      ================================================================ */}
      <BlockSection title="Rotación y persistencia de precios relativos" icon="🔁" color="blue">
        <div className="mb-4">
          <Seg
            label="Ventana"
            value={k}
            onChange={setK}
            options={KS.map((x) => ({ key: x, label: `${x} meses` }))}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard
            title={`Cobertura de rotación C(${k})`}
            badge="%"
            formula={`C_t(${k}) = Σ ω_i · 1[π_i > π en ≥ 1 mes de la ventana]`}
            nota="Si la línea llena está por encima de la punteada, los rubros se turnan más que al azar; por debajo, lideran siempre los mismos."
          >
            <Leyenda items={[{ label: `C(${k}) observada`, color: "#fab005" }, { label: "Esperable al azar: 1 − Π(1 − D)", color: "#94a3b8", dashed: true }]} />
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} tick={axisTick} interval={tickInterval} />
                <YAxis domain={[dominio(["C", "Cref"], 10)[0], 100]} tickFormatter={(x) => `${x}%`} tick={axisTick} width={40} />
                <Tooltip {...tooltipStyle} labelFormatter={fmtMes} formatter={(val: number, key: string) => [`${fmt(val)} %`, key === "C" ? "Observada" : "Al azar"]} />
                <Line type="linear" dataKey="Cref" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="C" stroke="#fab005" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Variance ratio de precios relativos"
            badge="VR(k)"
            formula="VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j))"
            nota={`< 1: revierten (se turnan) · ≈ 1: ruido · > 1: cambio persistente. Franja gris: banda "sin memoria" (p5–p95) para k = ${k}.`}
          >
            <Leyenda items={KS.map((x) => ({ label: `k = ${x}`, color: K_COLORS[x] }))} />
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} tick={axisTick} interval={tickInterval} />
                <YAxis tickFormatter={(x) => fmt(x, 1)} tick={axisTick} width={36} domain={[0, Math.max(2, dominio(["VR3", "VR6", "VR12"], 1)[1])]} />
                {loK != null && hiK != null && <ReferenceArea y1={loK} y2={hiK} fill="#64748b" fillOpacity={0.16} />}
                <ReferenceLine y={1} stroke="#64748b" strokeDasharray="4 3" />
                <Tooltip {...tooltipStyle} labelFormatter={fmtMes} formatter={(val: number, key: string) => [fmt(val, 2), `VR(${key.slice(2)})`]} />
                {KS.map((x) => (
                  <Line key={x} type="linear" dataKey={`VR${x}`} stroke={K_COLORS[x]} strokeWidth={x === k ? 2.5 : 1} strokeOpacity={x === k ? 1 : 0.55} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Difusión acumulada A(k)"
            badge="%"
            formula="A_t(k) = Σ ω_i · 1[Π_i,t(k) > Π_t(k)]"
            nota={
              pond === "pond"
                ? "% de la canasta cuya inflación acumulada en k meses supera a la del nivel general. Por construcción ronda el 50 %: lo informativo es el desvío y la tendencia."
                : "% de ítems cuya inflación acumulada en k meses supera a la del nivel general. Sin ponderar puede alejarse del 50 % si los ítems de más peso se comportan distinto."
            }
          >
            <Leyenda items={KS.map((x) => ({ label: `k = ${x}`, color: K_COLORS[x] }))} />
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} tick={axisTick} interval={tickInterval} />
                <YAxis domain={dominio(["A3", "A6", "A12"], 10)} tickFormatter={(x) => `${x}%`} tick={axisTick} width={40} />
                <ReferenceLine y={50} stroke="#64748b" strokeDasharray="4 3" />
                <Tooltip {...tooltipStyle} labelFormatter={fmtMes} formatter={(val: number, key: string) => [`${fmt(val)} %`, `A(${key.slice(1)})`]} />
                {KS.map((x) => (
                  <Line key={x} type="linear" dataKey={`A${x}`} stroke={K_COLORS[x]} strokeWidth={x === k ? 2.5 : 1} strokeOpacity={x === k ? 1 : 0.55} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Persistencia mes a mes"
            badge="correlación"
            formula="ρ_t = corr_i(r_i,t , r_i,t−1)"
            nota="Correlación entre el cambio de precio relativo de cada ítem este mes y el mes anterior. Positiva: el que subió más que el promedio vuelve a hacerlo. Negativa: se compensa."
          >
            <Leyenda items={[{ label: "ρ mensual", color: "#475569" }, { label: "Media 6 meses", color: "#4dabf7" }, { label: "Media 12 meses", color: "#1c7ed6" }]} />
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} tick={axisTick} interval={tickInterval} />
                <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tickFormatter={(x) => fmt(x, 1)} tick={axisTick} width={36} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={fmtMes}
                  formatter={(val: number, key: string) => [fmt(val, 2), key === "rho" ? "ρ mensual" : key === "rho6" ? "Media 6 meses" : "Media 12 meses"]}
                />
                <Bar dataKey="rho" fill="#475569" isAnimationActive={false} />
                <Line type="linear" dataKey="rho6" stroke="#4dabf7" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="rho12" stroke="#1c7ed6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </BlockSection>

      {/* ================================================================
          HEATMAP
      ================================================================ */}
      <BlockSection title="Mapa de precios relativos" icon="🗺️" color="red">
        <Heatmap serie={serie} a={a} b={b} />
      </BlockSection>

      {/* ================================================================
          METODOLOGÍA
      ================================================================ */}
      <details className="card card-dark p-5 text-sm text-slate-600 dark:text-slate-300">
        <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-100">Metodología, fuentes y limitaciones</summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Datos</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>
                Fuente: INDEC, IPC base dic-2016 — <span className="font-mono text-xs">serie_ipc_aperturas.csv</span>,{" "}
                <span className="font-mono text-xs">serie_ipc_divisiones.csv</span> y{" "}
                <span className="font-mono text-xs">ponderadores_ipc.xls</span>. Último dato: {fmtMes(data.ultimo_periodo)}.
              </li>
              <li>
                Ítem = apertura × región. Canasta completa: {data.universos.todos.n} ítems ({data.universos.publicados.n} aperturas
                publicadas + {data.universos.todos.n - data.universos.publicados.n} «resto de división» derivados con los ponderadores
                para que la canasta cierre).
              </li>
              <li>
                Ponderador nacional = peso de la región × ponderador regional (dic-2016), actualizado cada mes por precios relativos:
                ω<sub>i,t</sub> ∝ ω<sub>i</sub> · I<sub>i,t−1</sub>.
                {reconciliacionMaxPp != null && (
                  <> El nivel general recomputado replica al publicado con un desvío máximo de {fmt(reconciliacionMaxPp, 3)} pp m/m.</>
                )}
              </li>
              <li>
                El nivel general de comparación es siempre el de la canasta completa (ponderado), en cualquier universo. En ventanas de k
                meses se usan los ponderadores del inicio de la ventana.
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Métricas</p>
            <div className="mt-1 font-mono text-xs space-y-1 text-slate-500 dark:text-slate-400">
              <p>r_i,t = ln(1+π_i,t) − ln(1+π_t)                      cambio de precio relativo</p>
              <p>D_t = Σ ω_i · 1[π_i,t &gt; π_t]                          difusión puntual</p>
              <p>C_t(k) = Σ ω_i · 1[π_i,t−j &gt; π_t−j para algún j &lt; k]    cobertura de rotación</p>
              <p>C*_t(k) = 1 − Π_j (1 − D_t−j)                        referencia: lideran ítems al azar</p>
              <p>A_t(k) = Σ ω_i · 1[Π_i,t(k) &gt; Π_t(k)]                  difusión acumulada</p>
              <p>VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j)) variance ratio (varianzas cross-section)</p>
              <p>ρ_t = corr_i(r_i,t , r_i,t−1)                         persistencia</p>
            </div>
            <p className="mt-2">
              VR − 1 equivale a la autocovarianza cross-section de los precios relativos dentro de la ventana (normalizada). La banda de
              referencia son los percentiles {P.banda_VR_percentiles[0]}–{P.banda_VR_percentiles[1]} de VR con {P.replicas_banda_VR} réplicas
              de {P.metodo_banda_VR}.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Reglas del régimen</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>
                Amplitud, sobre D̄ (promedio de 3 meses de D): concentrada si D̄ &lt; {fmt(P.umbral_D_concentrada, 0)} %; generalizada si D̄ ≥{" "}
                {fmt(P.umbral_D_generalizada, 0)} %; intermedia en el medio. El punto neutro no es 50 %: la distribución de variaciones de
                precios es asimétrica a derecha y la mediana histórica de D ronda 44 %.
              </li>
              <li>
                Dinámica: rotación si VR(3) cae debajo de la banda, o si VR(3) &lt; 1 y C(3) supera la referencia al azar; persistencia si
                VR(3) supera la banda, o si VR(3) &gt; 1 y C(3) queda debajo de la referencia; si no, ruido.
              </li>
              <li>El régimen combina ambas; con amplitud intermedia o dinámica de ruido se informa «sin señal clara».</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Desestacionalización</p>
            <p className="mt-1">
              {P.desest.metodo}. Resultaron estacionales {P.desest.items_ajustados} de {P.desest.items_total} ítems; el resto queda sin
              ajustar. El nivel general desestacionalizado es la agregación de los ítems ajustados (método indirecto) y se revisa con cada
              dato nuevo.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Limitaciones</p>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>INDEC publica 27 aperturas por región: la difusión es más gruesa que la que se obtendría con el relevamiento completo de precios.</li>
              <li>Los ítems «resto de división» son residuos y pueden ser ruidosos; el universo «Aperturas» los excluye.</li>
              <li>
                VR &lt; 1 puede reflejar estacionalidad o ruido de medición en los índices (que revierte por construcción), no solo que los
                rubros «se turnan»: conviene mirar también la versión desestacionalizada.
              </li>
              <li>Los umbrales de amplitud son heurísticos y los ponderadores corresponden a la canasta ENGHo 2004/05.</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
