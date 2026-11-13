"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Customized,
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
import { getDateRange, type Period } from "@/components/dashboard/PeriodSelector";
import { ChartFrame, ChartTooltip, DirectLabels, useChartStyle, yAxisNice, type DirectLabelItem, type TipSerie } from "@/components/ds/Chart";
import { Control, ControlBar, Segmented } from "@/components/ds/Controls";
import { FreshnessLine } from "@/components/ds/Freshness";
import { Kpi, KpiStrip } from "@/components/ds/Kpi";
import { Eyebrow, Formula, Lede, PageTitle, Section } from "@/components/ds/Typography";
import { diverging, divergingSteps } from "@/design/tokens";
import { atrasado, fmtFecha, proximaPublicacion } from "@/lib/indec/calendario";
import { fmt, fmtMes, fmtSigno, mesLargo } from "@/lib/inflacion/formato";
import type { DifusionData, K, PondKey, SerieKey, UniversoKey, Variante } from "@/lib/inflacion/difusion-types";
import { Heatmap } from "./Heatmap";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MIN_MESES = 6;
const KS: K[] = ["3", "6", "12"];
/** Tramos de π_i − π_t (pp): los primeros N_DEBAJO no superan al nivel general. */
const N_DEBAJO = 4;
const FUENTE = "Fuente: INDEC (IPC base dic-2016), cálculo propio.";
const MARGEN = { top: 8, right: 108, left: 0, bottom: 4 };
const MARGEN_SIN_ETIQUETAS = { top: 8, right: 8, left: 0, bottom: 4 };

const PERIODOS: { key: Period; label: string; title?: string }[] = [
  { key: "1y", label: "1A" },
  { key: "2y", label: "2A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "Máx." },
  { key: "milei", label: "Milei", title: "Desde el 10/12/2023" },
  { key: "fernandez", label: "AF", title: "Alberto Fernández (2019–2023)" },
  { key: "macri", label: "MM", title: "Mauricio Macri (2015–2019)" },
];
const PERIODOS_URL: Period[] = ["1m", "3m", "6m", "1y", "2y", "5y", "max", "milei", "fernandez", "macri"];

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

type Row = Record<string, number | string | null>;
const num = (x: number | string | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// ---------------------------------------------------------------------------
// Lectura del régimen → bajada (reglas explícitas, mismas que la tarjeta)
// ---------------------------------------------------------------------------

function bajada(p: {
  mes: string;
  D: number | null;
  pi: number | null;
  se: boolean;
  amp: string | null;
  din: string | null;
  coincideAmp: number;
  coincideDin: number;
  total: number;
}) {
  const { mes, D, pi, se, amp, din, coincideAmp, coincideDin, total } = p;
  const amplitud =
    amp === "generalizada" ? (
      <>la suba fue <b>amplia</b></>
    ) : amp === "concentrada" ? (
      <>la suba estuvo <b>concentrada</b> en pocos rubros</>
    ) : amp === "intermedia" ? (
      <>la amplitud de la suba fue <b>intermedia</b></>
    ) : null;
  const dinamica =
    din === "persistencia" ? (
      <>y los <b>mismos rubros siguen liderando</b>: hay un cambio de precios relativos en curso</>
    ) : din === "rotacion" ? (
      <>y los rubros <b>se turnan</b>: patrón de inercia, sin un shock dominante</>
    ) : din === "ruido" ? (
      <>sin un patrón de rotación que se distinga del ruido</>
    ) : null;
  const robusta = coincideAmp > total / 2 && coincideDin > total / 2;
  return (
    <>
      En {mes}, <b>{fmt(D)} % de la canasta subió más que el nivel general</b> ({fmt(pi)} % m/m{se ? " s.e." : ""}).
      {amplitud && dinamica && (
        <>
          {" "}En el último trimestre {amplitud} {dinamica}.
        </>
      )}
      {amplitud && dinamica && !robusta && (
        <>
          {" "}La {coincideAmp <= total / 2 ? "amplitud" : "dinámica"} depende de cómo se mida: coincide en{" "}
          {coincideAmp <= total / 2 ? coincideAmp : coincideDin} de {total} variantes
          {coincideAmp <= total / 2 && coincideDin > total / 2 ? `; la dinámica, en ${coincideDin} de ${total}` : ""}.
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function DifusionClient({
  data,
  generado,
  reconciliacionMaxPp,
}: {
  data: DifusionData;
  generado: string;
  reconciliacionMaxPp: number | null;
}) {
  const S = useChartStyle();
  const { t: T } = S;

  const [period, setPeriod] = useState<Period>("2y");
  const [universo, setUniverso] = useState<UniversoKey>("todos");
  const [pond, setPond] = useState<PondKey>("pond");
  const [serie, setSerie] = useState<SerieKey>("orig");
  const [k, setK] = useState<K>("3");
  const [urlLeida, setUrlLeida] = useState(false);
  const [cal, setCal] = useState<{ prox: string | null; stale: boolean } | null>(null);

  // Estado inicial desde la URL (?periodo=max&universo=nacional27&pond=simple&serie=sa&k=12): vistas compartibles
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pick = <T extends string>(key: string, ok: readonly T[], set: (x: T) => void) => {
      const x = q.get(key) as T | null;
      if (x && ok.includes(x)) set(x);
    };
    pick<Period>("periodo", PERIODOS_URL, setPeriod);
    pick<UniversoKey>("universo", ["todos", "publicados", "nacional27"], setUniverso);
    pick<PondKey>("pond", ["pond", "simple"], setPond);
    pick<SerieKey>("serie", ["orig", "sa"], setSerie);
    pick<K>("k", KS, setK);
    setUrlLeida(true);
    // Calendario: se evalúa en el cliente (la página es estática)
    const p = proximaPublicacion();
    setCal({ prox: p ? `${fmtFecha(p.fecha)} (IPC ${fmtMes(p.periodo)})` : null, stale: atrasado(data.ultimo_periodo) });
  }, [data.ultimo_periodo]);

  // …y cada cambio de selector vuelve a la URL (sin recargar ni sumar entradas al historial)
  useEffect(() => {
    if (!urlLeida) return;
    const q = new URLSearchParams({ periodo: period, universo, pond, serie, k });
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [urlLeida, period, universo, pond, serie, k]);

  const v: Variante = data.variantes[`${universo}.${pond}.${serie}`];
  const se = serie === "sa";
  const SE = se ? " (s.e.)" : "";
  const [a, b] = useMemo(() => rango(data.fechas, period), [data.fechas, period]);
  const idx = useMemo(() => Array.from({ length: b - a + 1 }, (_, i) => a + i), [a, b]);
  const tickInterval = Math.max(0, Math.ceil(idx.length / 8) - 1);
  const bucketColors = useMemo(() => divergingSteps(T, N_DEBAJO, data.buckets_etiquetas.length - N_DEBAJO), [T, data.buckets_etiquetas.length]);

  const masDe1ppSerie = useMemo(
    () => data.fechas.map((_, i) => v.buckets.slice(N_DEBAJO + 2).reduce<number | null>((s, x) => (x[i] == null ? s : (s ?? 0) + (x[i] as number)), null)),
    [v, data.fechas]
  );
  const debajoSerie = useMemo(
    () => data.fechas.map((_, i) => v.buckets.slice(0, N_DEBAJO).reduce<number | null>((s, x) => (x[i] == null ? s : (s ?? 0) + (x[i] as number)), null)),
    [v, data.fechas]
  );

  const rows: Row[] = useMemo(
    () =>
      idx.map((i) => {
        const row: Row = {
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
  const col = (key: string) => rows.map((r) => num(r[key]));

  // Mes de referencia = último del período elegido
  const t = b;
  const tp = t - 1;
  const mes = fmtMes(data.fechas[t]);
  const mesAnt = tp >= 0 ? fmtMes(data.fechas[tp]) : null;
  const ultimo = fmtMes(data.fechas[t]);
  const pi = data.headline[serie][t];
  const [lo3, hi3] = v.VRbanda["3"];
  const [loK, hiK] = v.VRbanda[k];
  const reg = data.regimenes[v.regimen.codigo[t]];
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

  const u = data.universos[universo];
  const P = data.parametros;
  const ult12 = <T,>(s: T[]) => s.slice(Math.max(0, t - 11), t + 1);
  const delta = (s: (number | null)[], d = 1, unidad = " pp") =>
    mesAnt && s[t] != null && s[tp] != null ? `${fmtSigno((s[t] as number) - (s[tp] as number), d)}${unidad} vs. ${mesAnt}` : undefined;

  // Cuadrante: últimos 12 meses del período
  const quad = useMemo(() => {
    const pts: { x: number; y: number; mes: string; ultimo: boolean; etiqueta: boolean }[] = [];
    for (let i = Math.max(a, t - 11); i <= t; i++) {
      const x = v.regimen.D3[i];
      const y = v.VR["3"][i];
      if (x != null && y != null) pts.push({ x, y, mes: fmtMes(data.fechas[i]), ultimo: i === t, etiqueta: false });
    }
    pts.forEach((p, j) => (p.etiqueta = j === 0 || p.ultimo || (pts.length - 1 - j) % 3 === 0));
    return pts;
  }, [a, t, v, data.fechas]);
  const xMin = Math.floor(Math.min(30, ...quad.map((p) => p.x)) / 5) * 5;
  const xMax = Math.ceil(Math.max(55, ...quad.map((p) => p.x)) / 5) * 5;
  const yMax = Math.ceil(Math.max(2, ...quad.map((p) => p.y)) * 2) / 2;
  const mitadD = (P.umbral_D_concentrada + P.umbral_D_generalizada) / 2;
  const semiD = Math.max(5, (xMax - xMin) / 2);

  // Series de los gráficos
  const fmtPct = (x: number) => `${fmt(x)} %`;
  const fmt2 = (x: number) => fmt(x, 2);
  const kColor: Record<K, string> = { "3": T.s1, "6": T.s2, "12": T.s3 };
  const lastRow = rows[rows.length - 1] ?? {};
  const etiq = (key: string, name: string, color: string, f: (x: number) => string, muted = false): DirectLabelItem => ({
    value: num(lastRow[key]),
    name,
    color,
    fmt: f,
    muted,
  });
  const tabla = (cols: { key: string; name: string; f: (x: number) => string }[]) => ({
    columns: ["Mes", ...cols.map((c) => c.name)],
    rows: [...rows].reverse().map((r) => [fmtMes(String(r.fecha)), ...cols.map((c) => (num(r[c.key]) == null ? "—" : c.f(num(r[c.key]) as number)))]),
  });
  const tip = (series: TipSerie[]) => <ChartTooltip series={series} labelFormat={fmtMes} />;

  // Subtítulos con la conclusión
  const D3t = v.regimen.D3[t];
  const zonaD =
    D3t == null ? "sin dato" : D3t < P.umbral_D_concentrada ? "zona de suba concentrada" : D3t >= P.umbral_D_generalizada ? "zona de suba generalizada" : "zona intermedia";
  const Ct = v.C[k][t];
  const Creft = v.Cref[k][t];
  const VRk = v.VR[k][t];
  const At = v.A[k][t];
  const rho12t = v.rho12[t];

  const labelTop = (txt: string, pos: "insideTopLeft" | "insideTopRight" = "insideTopLeft") => S.bandLabel(txt, pos);

  return (
    <div>
      <FreshnessLine
        stale={cal?.stale ?? false}
        items={[
          `IPC al ${fmtMes(data.ultimo_periodo)}`,
          `calculado ${new Date(generado).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`,
          `próxima publicación: ${cal === null ? "…" : cal.prox ?? "sin dato"}`,
        ]}
      />

      <Eyebrow>Fundamentos · Inflación</Eyebrow>
      <PageTitle>Difusión y rotación de la inflación</PageTitle>
      <Lede>
        {bajada({ mes: mesLargo(data.fechas[t]), D: v.D[t], pi, se, amp, din, coincideAmp, coincideDin, total: todas.length })}
      </Lede>

      <ControlBar>
        <Control label="Período">
          <Segmented ariaLabel="Período" value={period} onChange={setPeriod} options={PERIODOS} />
        </Control>
        <Control label="Universo">
          <Segmented
            ariaLabel="Universo"
            value={universo}
            onChange={setUniverso}
            options={[
              { key: "todos", label: `Canasta completa (${data.universos.todos.n})`, title: data.universos.todos.descripcion },
              { key: "publicados", label: `Aperturas (${data.universos.publicados.n})`, title: data.universos.publicados.descripcion },
              { key: "nacional27", label: `Nacional (${data.universos.nacional27.n})`, title: data.universos.nacional27.descripcion },
            ]}
          />
        </Control>
        <Control label="Ponderación">
          <Segmented
            ariaLabel="Ponderación"
            value={pond}
            onChange={setPond}
            options={[
              { key: "pond", label: "Ponderado", title: "Cada ítem pesa su participación en la canasta" },
              { key: "simple", label: "Sin ponderar", title: "Cada ítem pesa 1/N" },
            ]}
          />
        </Control>
        <Control label="Serie">
          <Segmented
            ariaLabel="Serie"
            value={serie}
            onChange={setSerie}
            options={[
              { key: "orig", label: "Original" },
              { key: "sa", label: "Desestacionalizada", title: P.desest.metodo },
            ]}
          />
        </Control>
      </ControlBar>

      {/* ================= LECTURA DEL RÉGIMEN ================= */}
      <Section title={`Lectura del régimen, ${mes}${SE}`}>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-x-11 gap-y-6">
          <div className="border-t border-ds-head pt-3.5">
            <p className="font-serif text-[20px] font-semibold text-ds-head leading-snug">{reg?.titulo ?? "Sin dato"}</p>
            <p className="font-serif text-[16px] leading-relaxed text-ds-text mt-1.5">{reg?.texto}</p>
            <dl className="mt-4 space-y-2.5 text-[13.5px] text-ds-text-2">
              <div className="border-t border-ds-rule pt-2.5">
                <dt className="font-semibold text-ds-text inline">Amplitud. </dt>
                <dd className="inline">{amp ? data.amplitud_etiquetas[amp] : "Sin dato"}.</dd>
                <p className="tnum text-[12px] text-ds-muted mt-0.5">
                  D̄ (3 meses) = {fmt(v.regimen.D3[t])} % · umbrales {fmt(P.umbral_D_concentrada, 0)} y {fmt(P.umbral_D_generalizada, 0)} %
                </p>
              </div>
              <div className="border-t border-ds-rule pt-2.5">
                <dt className="font-semibold text-ds-text inline">Dinámica. </dt>
                <dd className="inline">{din ? data.dinamica_etiquetas[din] : "Sin dato"}.</dd>
                <p className="tnum text-[12px] text-ds-muted mt-0.5">
                  VR(3) = {fmt(v.VR["3"][t], 2)} · banda sin memoria {fmt(lo3, 2)}–{fmt(hi3, 2)} · C(3) = {fmt(v.C["3"][t])} % vs.{" "}
                  {fmt(v.Cref["3"][t])} % al azar
                </p>
              </div>
              {lectura12 && (
                <div className="border-t border-ds-rule pt-2.5">
                  <dt className="font-semibold text-ds-text inline">Horizonte largo. </dt>
                  <dd className="inline">
                    VR(12) = <span className="tnum">{fmt(vr12, 2)}</span>: {lectura12}.
                  </dd>
                </div>
              )}
              {amp && din && (
                <div className="border-t border-ds-rule pt-2.5">
                  <dt className="font-semibold text-ds-text inline">Robustez. </dt>
                  <dd className="inline">
                    La dinámica se repite en {coincideDin} de {todas.length} variantes (universo × ponderación × serie); la amplitud, en{" "}
                    {coincideAmp} de {todas.length}.
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-[11.5px] text-ds-muted mt-3">
              Clasificación por reglas explícitas (ver Metodología). Es una lectura descriptiva, no una proyección.
            </p>
          </div>

          <ChartFrame
            title="Cuadrante de régimen, últimos 12 meses"
            sub={
              quad.length
                ? `${mes}: amplitud ${fmt(D3t)} % y VR(3) ${fmt(v.VR["3"][t], 2)}${
                    lo3 != null && hi3 != null ? ((v.VR["3"][t] ?? 0) > hi3 ? ", por encima de la banda sin memoria" : (v.VR["3"][t] ?? 0) < lo3 ? ", por debajo de la banda sin memoria" : ", dentro de la banda sin memoria") : ""
                  }.`
                : undefined
            }
            source={FUENTE}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  Eje horizontal: amplitud, D̄ = promedio de 3 meses de la difusión. Eje vertical: variance ratio a 3 meses. El color de cada punto
                  va de azul (suba concentrada) a rojo (suba generalizada).
                </p>
                <Formula>VR_t(3) = Var(Σ_j r_i,t−j) / (3 · media_j Var(r_i,t−j))</Formula>
              </>
            }
          >
            {quad.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-ds-muted text-sm">Sin dato</div>
            ) : (
              <div className="relative">
                <div className="pointer-events-none absolute inset-0 z-[1] text-[10.5px] text-ds-muted">
                  <span className="absolute left-12 top-1">Concentrada y persistente</span>
                  <span className="absolute right-3 top-1">Generalizada y persistente</span>
                  <span className="absolute left-12 bottom-8">Concentrada que revierte</span>
                  <span className="absolute right-3 bottom-8">Generalizada y escalonada</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid {...S.grid} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[xMin, xMax]}
                      ticks={Array.from({ length: (xMax - xMin) / 5 + 1 }, (_, i) => xMin + 5 * i)}
                      {...S.xAxis}
                      tickFormatter={(x) => `${x} %`}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[0, yMax]}
                      ticks={Array.from({ length: yMax / 0.5 + 1 }, (_, i) => i * 0.5)}
                      {...S.yAxis}
                      tickFormatter={(y) => fmt(y, 1)}
                    />
                    <ReferenceArea x1={P.umbral_D_concentrada} x2={P.umbral_D_generalizada} {...S.band} label={S.bandLabel("zona intermedia", "insideBottomLeft")} />
                    {lo3 != null && hi3 != null && (
                      <ReferenceArea y1={lo3} y2={Math.min(hi3, yMax)} {...S.band} label={S.bandLabel("banda sin memoria", "insideTopRight")} />
                    )}
                    <ReferenceLine y={1} {...S.refLine} />
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        const p = payload?.[0]?.payload as (typeof quad)[number] | undefined;
                        if (!active || !p) return null;
                        return (
                          <div className="bg-ds-surface border border-ds-rule-strong rounded-[5px] px-2.5 py-2 text-[12px] text-ds-text shadow-[0_4px_14px_rgba(0,0,0,0.12)]">
                            <div className="text-ds-muted mb-1">{p.mes}</div>
                            <div className="flex justify-between gap-4">
                              <span className="text-ds-text-2">D̄ (3 meses)</span>
                              <b className="tnum">{fmt(p.x)} %</b>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-ds-text-2">VR(3)</span>
                              <b className="tnum">{fmt(p.y, 2)}</b>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={quad}
                      line={{ stroke: T.ruleStrong, strokeWidth: 1.5 }}
                      isAnimationActive={false}
                      shape={(p: { cx?: number; cy?: number; payload?: (typeof quad)[number] }) => {
                        const d = p.payload;
                        if (!d) return <g />;
                        const c = diverging(T, (d.x - mitadD) / semiD);
                        return (
                          <g>
                            <circle cx={p.cx} cy={p.cy} r={d.ultimo ? 6.5 : 4} fill={c} stroke={d.ultimo ? T.head : T.surface} strokeWidth={d.ultimo ? 2 : 1.5} />
                            {d.etiqueta && (
                              <text
                                x={p.cx}
                                y={(p.cy ?? 0) - (d.ultimo ? 12 : 8)}
                                textAnchor="middle"
                                fontSize={d.ultimo ? 11.5 : 10}
                                fontWeight={d.ultimo ? 600 : 400}
                                fill={d.ultimo ? T.text : T.muted}
                              >
                                {d.mes}
                              </text>
                            )}
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartFrame>
        </div>
      </Section>

      {/* ================= KPIs ================= */}
      <KpiStrip cols={5}>
        <Kpi
          label={`Nivel general, ${mes}${SE}`}
          value={fmt(pi)}
          unit="% m/m"
          delta={delta(data.headline[serie])}
          spark={ult12(data.headline[serie])}
          context={se ? "Agregado de ítems desestacionalizados" : "Publicado por INDEC"}
        />
        <Kpi
          label={`Difusión D${SE}`}
          value={fmt(v.D[t])}
          unit="%"
          delta={delta(v.D)}
          spark={ult12(v.D)}
          context={`Promedio 3 meses: ${fmt(D3t)} %`}
          hint="% de la canasta que sube más que el nivel general"
        />
        <Kpi
          label={`Suben más de 1 pp sobre el general${SE}`}
          value={fmt(masDe1ppSerie[t])}
          unit="%"
          delta={delta(masDe1ppSerie)}
          spark={ult12(masDe1ppSerie)}
          context={`De ${fmt(v.D[t])} % que supera al nivel general`}
        />
        <Kpi
          label={`Rotación C(3)${SE}`}
          value={fmt(v.C["3"][t])}
          unit="%"
          delta={delta(v.C["3"])}
          spark={ult12(v.C["3"])}
          context={`Esperable al azar: ${fmt(v.Cref["3"][t])} %`}
          hint="% de la canasta que superó al nivel general en al menos uno de los últimos 3 meses"
        />
        <Kpi
          label={`Variance ratio VR(3)${SE}`}
          value={fmt(v.VR["3"][t], 2)}
          delta={delta(v.VR["3"], 2, "")}
          spark={ult12(v.VR["3"])}
          context={`Banda sin memoria: ${fmt(lo3, 2)}–${fmt(hi3, 2)}`}
          hint="< 1: los precios relativos revierten · ≈ 1: ruido · > 1: cambio persistente"
        />
      </KpiStrip>
      <p className="text-[12px] text-ds-muted mt-2">
        {u.descripcion}. {u.n} ítems · {pond === "pond" ? "ponderado por participación en la canasta" : "cada ítem pesa 1/N"} ·{" "}
        {se ? "series desestacionalizadas (s.e.)" : "series originales"}.
      </p>

      {/* ================= DIFUSIÓN ================= */}
      <Section title="Difusión">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-11 gap-y-6">
          <ChartFrame
            title={`Distribución de las variaciones mensuales${SE}`}
            sub={`En ${mes}, ${fmt(debajoSerie[t])} % de la canasta subió menos que el nivel general y ${fmt(masDe1ppSerie[t])} % lo superó por más de 1 pp.`}
            legend={data.buckets_etiquetas.map((e, j) => ({ label: `${e} pp`, color: bucketColors[j], kind: "block" as const }))}
            table={tabla(data.buckets_etiquetas.map((e, j) => ({ key: `b${j}`, name: `${e} pp`, f: (x: number) => fmt(x) })))}
            source={`${FUENTE} % de ${pond === "pond" ? "la canasta" : "los ítems"}; pp de variación m/m respecto del nivel general.`}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  Cada ítem se ubica según la diferencia entre su variación mensual y la del nivel general de ese mes. Azules: subió menos que el
                  nivel general; rojos: subió más. Los tramos rojos suman la difusión D.
                </p>
                <Formula>tramo = π_i,t − π_t (puntos porcentuales)</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rows} margin={MARGEN_SIN_ETIQUETAS} barCategoryGap={idx.length > 40 ? 0 : "12%"}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(x) => `${x} %`} {...S.yAxis} allowDataOverflow />
                <Tooltip
                  cursor={S.cursorBar}
                  content={tip(
                    data.buckets_etiquetas
                      .map((e, j) => ({ key: `b${j}`, name: `${e} pp`, color: bucketColors[j], fmt: fmtPct }))
                      .reverse()
                  )}
                />
                {data.buckets_etiquetas.map((_, j) => (
                  <Bar key={j} dataKey={`b${j}`} stackId="b" fill={bucketColors[j]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame
            title={`Difusión puntual${SE}`}
            sub={`El promedio de 3 meses está en ${fmt(D3t)} %: ${zonaD}.`}
            legend={[
              { label: "D mensual", color: T.muted },
              { label: "Promedio 3 meses", color: T.s1 },
              { label: "Zona intermedia", color: T.band, kind: "band" },
            ]}
            table={tabla([
              { key: "D", name: "D mensual", f: fmtPct },
              { key: "D3", name: "Promedio 3 meses", f: fmtPct },
            ])}
            source={`${FUENTE} % por encima del nivel general.`}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  % de la canasta cuya variación mensual supera a la del nivel general. Por debajo de {fmt(P.umbral_D_concentrada, 0)} % la suba
                  es concentrada; desde {fmt(P.umbral_D_generalizada, 0)} %, generalizada. El punto neutro no es 50 %: la distribución de
                  variaciones es asimétrica a derecha.
                </p>
                <Formula>D_t = Σ ω_i · 1[π_i,t &gt; π_t]</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis {...yAxisNice([...col("D"), ...col("D3")], 5, [P.umbral_D_concentrada, 50])} tickFormatter={(x) => `${x} %`} {...S.yAxis} />
                <ReferenceArea y1={P.umbral_D_concentrada} y2={P.umbral_D_generalizada} {...S.band} label={labelTop("zona intermedia")} />
                <ReferenceLine y={50} {...S.refLine} />
                <Tooltip
                  cursor={S.cursorLine}
                  content={tip([
                    { key: "D", name: "D mensual", color: T.muted, fmt: fmtPct },
                    { key: "D3", name: "Promedio 3 meses", color: T.s1, fmt: fmtPct },
                  ])}
                />
                <Line dataKey="D" stroke={T.muted} {...S.line} />
                <Line dataKey="D3" stroke={T.s1} {...S.line} connectNulls />
                <Customized
                  component={(p: object) => (
                    <DirectLabels {...p} t={T} items={[etiq("D", "D mensual", T.muted, fmtPct), etiq("D3", "Prom. 3 meses", T.s1, fmtPct)]} />
                  )}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </Section>

      {/* ================= ROTACIÓN ================= */}
      <Section
        title="Rotación y persistencia de precios relativos"
        right={
          <Control label="Ventana">
            <Segmented ariaLabel="Ventana" value={k} onChange={setK} options={KS.map((x) => ({ key: x, label: `${x} meses` }))} />
          </Control>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-11 gap-y-6 mt-3">
          <ChartFrame
            title={`Cobertura de rotación C(${k})${SE}`}
            sub={
              Ct != null && Creft != null
                ? `${fmt(Ct)} % vs. ${fmt(Creft)} % esperable al azar: ${
                    Ct < Creft ? "lideran los mismos rubros más de lo que daría el azar" : "los rubros se turnan más que al azar"
                  }.`
                : undefined
            }
            legend={[
              { label: `C(${k}) observada`, color: T.s1 },
              { label: "Esperable al azar", color: T.muted, kind: "dash" },
            ]}
            table={tabla([
              { key: "C", name: `C(${k})`, f: fmtPct },
              { key: "Cref", name: "Al azar", f: fmtPct },
            ])}
            source={`${FUENTE} % de la canasta.`}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  % de la canasta que superó al nivel general en al menos uno de los últimos {k} meses. La referencia es lo que daría si cada mes
                  liderara un grupo de ítems al azar.
                </p>
                <Formula>C_t(k) = Σ ω_i · 1[π_i &gt; π en ≥ 1 mes de la ventana]   ·   C*_t(k) = 1 − Π_j (1 − D_t−j)</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis {...yAxisNice([...col("C"), ...col("Cref")], 5)} tickFormatter={(x) => `${x} %`} {...S.yAxis} />
                <Tooltip
                  cursor={S.cursorLine}
                  content={tip([
                    { key: "C", name: `C(${k})`, color: T.s1, fmt: fmtPct },
                    { key: "Cref", name: "Al azar", color: T.muted, fmt: fmtPct },
                  ])}
                />
                <Line dataKey="Cref" stroke={T.muted} strokeDasharray="5 4" {...S.line} />
                <Line dataKey="C" stroke={T.s1} {...S.line} />
                <Customized
                  component={(p: object) => (
                    <DirectLabels {...p} t={T} items={[etiq("C", `C(${k})`, T.s1, fmtPct), etiq("Cref", "Al azar", T.muted, fmtPct, true)]} />
                  )}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame
            title={`Variance ratio de precios relativos${SE}`}
            sub={
              VRk != null && loK != null && hiK != null
                ? `VR(${k}) = ${fmt(VRk, 2)}, ${VRk > hiK ? "por encima" : VRk < loK ? "por debajo" : "dentro"} de la banda sin memoria: ${
                    VRk > hiK ? "el cambio de precios relativos persiste" : VRk < loK ? "los precios relativos revierten" : "no se distingue del ruido"
                  }.`
                : undefined
            }
            legend={[
              ...KS.map((x) => ({ label: `k = ${x}`, color: kColor[x] })),
              { label: `Banda sin memoria (k = ${k})`, color: T.band, kind: "band" as const },
            ]}
            table={tabla(KS.map((x) => ({ key: `VR${x}`, name: `VR(${x})`, f: fmt2 })))}
            source={FUENTE}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  &lt; 1: los precios relativos revierten (los rubros se turnan) · ≈ 1: ruido · &gt; 1: cambio persistente. La banda son los
                  percentiles {P.banda_VR_percentiles[0]}–{P.banda_VR_percentiles[1]} de {P.replicas_banda_VR} réplicas sin memoria.
                </p>
                <Formula>VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j))</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis
                  {...yAxisNice([...col("VR3"), ...col("VR6"), ...col("VR12")], 0.5, [1, ...(loK != null ? [loK] : []), ...(hiK != null ? [hiK] : [])])}
                  tickFormatter={(x) => fmt(x, 1)}
                  {...S.yAxis}
                />
                {loK != null && hiK != null && <ReferenceArea y1={loK} y2={hiK} {...S.band} label={labelTop("banda sin memoria")} />}
                <ReferenceLine y={1} {...S.refLine} />
                <Tooltip cursor={S.cursorLine} content={tip(KS.map((x) => ({ key: `VR${x}`, name: `VR(${x})`, color: kColor[x], fmt: fmt2 })))} />
                {KS.map((x) => (
                  <Line key={x} dataKey={`VR${x}`} stroke={kColor[x]} strokeOpacity={x === k ? 1 : 0.45} {...S.line} />
                ))}
                <Customized component={(p: object) => <DirectLabels {...p} t={T} items={KS.map((x) => etiq(`VR${x}`, `VR(${x})`, kColor[x], fmt2))} />} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame
            title={`Difusión acumulada A(${k})${SE}`}
            sub={
              At != null
                ? `${fmt(At)} % de la canasta le ganó al nivel general en los últimos ${k} meses: ${
                    At > 50 ? "más" : "menos"
                  } de la mitad.`
                : undefined
            }
            legend={KS.map((x) => ({ label: `k = ${x}`, color: kColor[x] }))}
            table={tabla(KS.map((x) => ({ key: `A${x}`, name: `A(${x})`, f: fmtPct })))}
            source={`${FUENTE} % de la canasta.`}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  {pond === "pond"
                    ? "% de la canasta cuya inflación acumulada en k meses supera a la del nivel general. Ponderado, ronda el 50 % por construcción: lo informativo es el desvío y la tendencia."
                    : "% de ítems cuya inflación acumulada en k meses supera a la del nivel general. Sin ponderar puede alejarse del 50 % si los ítems de más peso se comportan distinto."}
                </p>
                <Formula>A_t(k) = Σ ω_i · 1[Π_i,t(k) &gt; Π_t(k)]</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis {...yAxisNice([...col("A3"), ...col("A6"), ...col("A12")], 5, [50])} tickFormatter={(x) => `${x} %`} {...S.yAxis} />
                <ReferenceLine y={50} {...S.refLine} />
                <Tooltip cursor={S.cursorLine} content={tip(KS.map((x) => ({ key: `A${x}`, name: `A(${x})`, color: kColor[x], fmt: fmtPct })))} />
                {KS.map((x) => (
                  <Line key={x} dataKey={`A${x}`} stroke={kColor[x]} strokeOpacity={x === k ? 1 : 0.45} {...S.line} />
                ))}
                <Customized component={(p: object) => <DirectLabels {...p} t={T} items={KS.map((x) => etiq(`A${x}`, `A(${x})`, kColor[x], fmtPct))} />} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame
            title={`Persistencia mes a mes${SE}`}
            sub={
              rho12t != null
                ? `Correlación media de 12 meses: ${fmt(rho12t, 2)}. ${
                    rho12t > 0 ? "El rubro que sube más que el promedio tiende a repetirlo al mes siguiente." : "Las subas relativas tienden a compensarse al mes siguiente."
                  }`
                : undefined
            }
            legend={[
              { label: "ρ mensual", color: T.neutralBar, kind: "block" },
              { label: "Media 6 meses", color: T.s1 },
              { label: "Media 12 meses", color: T.s2 },
            ]}
            table={tabla([
              { key: "rho", name: "ρ mensual", f: fmt2 },
              { key: "rho6", name: "Media 6 m", f: fmt2 },
              { key: "rho12", name: "Media 12 m", f: fmt2 },
            ])}
            source={FUENTE}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  Correlación, entre ítems, del cambio de precio relativo de cada uno este mes y el mes anterior. Positiva: el que subió más que el
                  promedio vuelve a hacerlo. Negativa: se compensa.
                </p>
                <Formula>ρ_t = corr_i(r_i,t , r_i,t−1)   ·   r_i,t = ln(1+π_i,t) − ln(1+π_t)</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis {...yAxisNice([...col("rho"), ...col("rho6"), ...col("rho12")], 0.1, [0])} tickFormatter={(x) => fmt(x, 1)} {...S.yAxis} />
                <ReferenceLine y={0} {...S.zeroLine} />
                <Tooltip
                  cursor={S.cursorLine}
                  content={tip([
                    { key: "rho", name: "ρ mensual", color: T.neutralBar, fmt: fmt2 },
                    { key: "rho6", name: "Media 6 meses", color: T.s1, fmt: fmt2 },
                    { key: "rho12", name: "Media 12 meses", color: T.s2, fmt: fmt2 },
                  ])}
                />
                <Bar dataKey="rho" fill={T.neutralBar} isAnimationActive={false} />
                <Line dataKey="rho6" stroke={T.s1} {...S.line} />
                <Line dataKey="rho12" stroke={T.s2} {...S.line} />
                <Customized
                  component={(p: object) => (
                    <DirectLabels {...p} t={T} items={[etiq("rho6", "Media 6 m", T.s1, fmt2), etiq("rho12", "Media 12 m", T.s2, fmt2)]} />
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </Section>

      {/* ================= MAPA ================= */}
      <Section title={`Mapa de precios relativos${SE}`}>
        <Heatmap serie={serie} a={a} b={b} fuente={FUENTE} />
      </Section>

      {/* ================= METODOLOGÍA ================= */}
      <Section title="Metodología, fuentes y limitaciones">
        <details className="border-t border-ds-head pt-3 text-[13.5px] text-ds-text-2">
          <summary className="cursor-pointer text-ds-text font-medium select-none">Ver detalle</summary>
          <div className="mt-4 space-y-5 max-w-[900px] leading-relaxed">
            <div>
              <p className="font-semibold text-ds-text">Datos</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  Fuente: INDEC, IPC base dic-2016 — <span className="font-mono text-[12px]">serie_ipc_aperturas.csv</span>,{" "}
                  <span className="font-mono text-[12px]">serie_ipc_divisiones.csv</span> y{" "}
                  <span className="font-mono text-[12px]">ponderadores_ipc.xls</span>. Último dato: {fmtMes(data.ultimo_periodo)}.
                </li>
                <li>
                  Ítem = apertura × región. Canasta completa: {data.universos.todos.n} ítems ({data.universos.publicados.n} aperturas publicadas +{" "}
                  {data.universos.todos.n - data.universos.publicados.n} «resto de división» derivados con los ponderadores para que la canasta
                  cierre).
                </li>
                <li>
                  Ponderador nacional = peso de la región × ponderador regional (dic-2016), actualizado cada mes por precios relativos: ω
                  <sub>i,t</sub> ∝ ω<sub>i</sub> · I<sub>i,t−1</sub>.
                  {reconciliacionMaxPp != null && (
                    <> El nivel general recomputado replica al publicado con un desvío máximo de {fmt(reconciliacionMaxPp, 3)} pp m/m.</>
                  )}
                </li>
                <li>
                  El nivel general de comparación es siempre el de la canasta completa (ponderado), en cualquier universo. En ventanas de k meses
                  se usan los ponderadores del inicio de la ventana.
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ds-text">Métricas</p>
              <div className="mt-1 space-y-0.5">
                <Formula>r_i,t = ln(1+π_i,t) − ln(1+π_t) — cambio de precio relativo</Formula>
                <Formula>D_t = Σ ω_i · 1[π_i,t &gt; π_t] — difusión puntual</Formula>
                <Formula>C_t(k) = Σ ω_i · 1[π_i,t−j &gt; π_t−j para algún j &lt; k] — cobertura de rotación</Formula>
                <Formula>C*_t(k) = 1 − Π_j (1 − D_t−j) — referencia: lideran ítems al azar</Formula>
                <Formula>A_t(k) = Σ ω_i · 1[Π_i,t(k) &gt; Π_t(k)] — difusión acumulada</Formula>
                <Formula>VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j)) — variance ratio (varianzas entre ítems)</Formula>
                <Formula>ρ_t = corr_i(r_i,t , r_i,t−1) — persistencia</Formula>
              </div>
              <p className="mt-2">
                VR − 1 equivale a la autocovarianza entre ítems de los precios relativos dentro de la ventana (normalizada). La banda de referencia
                son los percentiles {P.banda_VR_percentiles[0]}–{P.banda_VR_percentiles[1]} de VR con {P.replicas_banda_VR} réplicas de{" "}
                {P.metodo_banda_VR}.
              </p>
            </div>
            <div>
              <p className="font-semibold text-ds-text">Reglas del régimen</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  Amplitud, sobre D̄ (promedio de 3 meses de D): concentrada si D̄ &lt; {fmt(P.umbral_D_concentrada, 0)} %; generalizada si D̄ ≥{" "}
                  {fmt(P.umbral_D_generalizada, 0)} %; intermedia en el medio. El punto neutro no es 50 %: la distribución de variaciones de
                  precios es asimétrica a derecha y la mediana histórica de D ronda 44 %.
                </li>
                <li>
                  Dinámica: rotación si VR(3) cae debajo de la banda, o si VR(3) &lt; 1 y C(3) supera la referencia al azar; persistencia si VR(3)
                  supera la banda, o si VR(3) &gt; 1 y C(3) queda debajo de la referencia; si no, ruido.
                </li>
                <li>El régimen combina ambas; con amplitud intermedia o dinámica de ruido se informa «sin señal clara».</li>
                <li>La bajada de la página se arma con estas mismas reglas.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ds-text">Desestacionalización (s.e.)</p>
              <p className="mt-1">
                {P.desest.metodo}. Resultaron estacionales {P.desest.items_ajustados} de {P.desest.items_total} ítems; el resto queda sin ajustar.
                El nivel general desestacionalizado es la agregación de los ítems ajustados (método indirecto) y se revisa con cada dato nuevo.
              </p>
            </div>
            <div>
              <p className="font-semibold text-ds-text">Limitaciones</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>INDEC publica 27 aperturas por región: la difusión es más gruesa que la que se obtendría con el relevamiento completo de precios.</li>
                <li>Los ítems «resto de división» son residuos y pueden ser ruidosos; el universo «Aperturas» los excluye.</li>
                <li>
                  VR &lt; 1 puede reflejar estacionalidad o ruido de medición en los índices (que revierte por construcción), no solo que los rubros
                  «se turnan»: conviene mirar también la versión desestacionalizada.
                </li>
                <li>Los umbrales de amplitud son heurísticos y los ponderadores corresponden a la canasta ENGHo 2004/05.</li>
              </ul>
            </div>
          </div>
        </details>
      </Section>
    </div>
  );
}
