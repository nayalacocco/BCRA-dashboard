"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
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
import type { DifusionData, K, PondKey, PreciosRelativosData, SerieKey, UniversoKey, Validacion, Variante } from "@/lib/inflacion/difusion-types";
import { Heatmap } from "./Heatmap";
import { EvolucionRelativa, NivelDireccion, cuadrante, relevancia } from "./PreciosRelativos";

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
  precios,
  validacion: VAL,
  generado,
}: {
  data: DifusionData;
  precios: PreciosRelativosData;
  validacion: Validacion;
  generado: string;
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
          Cmed: v.Cnull[k][1][i],
          // Recharts dibuja un área de rango con [bajo, alto]
          Cband: v.Cnull[k][0][i] != null && v.Cnull[k][2][i] != null ? ([v.Cnull[k][0][i], v.Cnull[k][2][i]] as unknown as number) : null,
          VRmed: v.VRnull[k][1][i],
          VRband: v.VRnull[k][0][i] != null && v.VRnull[k][2][i] != null ? ([v.VRnull[k][0][i], v.VRnull[k][2][i]] as unknown as number) : null,
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
  // Null por permutación del mes t: [p5, p95]
  const lo3 = v.VRnull["3"][0][t];
  const hi3 = v.VRnull["3"][2][t];
  const loK = v.VRnull[k][0][t];
  const hiK = v.VRnull[k][2][t];
  const [umbLo, umbHi] = v.umbrales_D;
  const reg = data.regimenes[v.regimen.codigo[t]];
  const amp = v.regimen.amplitud[t];
  const din = v.regimen.dinamica[t];
  const vr12 = v.VR["12"][t];
  const lo12 = v.VRnull["12"][0][t];
  const hi12 = v.VRnull["12"][2][t];
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
  const mitadD = umbLo != null && umbHi != null ? (umbLo + umbHi) / 2 : 44;
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
    D3t == null || umbLo == null || umbHi == null
      ? "sin dato"
      : D3t < umbLo
        ? "tercio inferior de su historia (suba concentrada)"
        : D3t >= umbHi
          ? "tercio superior de su historia (suba generalizada)"
          : "tercio central de su historia (amplitud intermedia)";
  const Ct = v.C[k][t];
  const CmedT = v.Cnull[k][1][t];
  const CloT = v.Cnull[k][0][t];
  const ChiT = v.Cnull[k][2][t];

  // Precios relativos para la lectura: los más alejados de su ancla (ponderador ≥ 1 %), con su cuadrante
  const PRN = precios.grupos.Nacional;
  const extremosPR = Object.entries(PRN.items)
    .filter(([id, it]) => (PRN.peso?.[id] ?? 0) >= 1 && it.desvio_filtrada != null)
    .sort((x, y) => Math.abs(y[1].desvio_filtrada as number) - Math.abs(x[1].desvio_filtrada as number))
    .slice(0, 3);
  void relevancia;
  // Sesgo de la aproximación descartada 1 − Π(1 − D) frente a la mediana del null, C(3), en esta variante
  const difsCref = v.Cref["3"].map((x, i) => (x != null && v.Cnull["3"][1][i] != null ? x - (v.Cnull["3"][1][i] as number) : null)).filter((x): x is number => x != null);
  const sesgoCref = difsCref.length ? difsCref.reduce((s2, x) => s2 + x, 0) / difsCref.length : null;
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
                  D̄ (3 meses) = {fmt(v.regimen.D3[t])} % · terciles históricos {fmt(umbLo)} y {fmt(umbHi)} %
                </p>
              </div>
              <div className="border-t border-ds-rule pt-2.5">
                <dt className="font-semibold text-ds-text inline">Dinámica. </dt>
                <dd className="inline">{din ? data.dinamica_etiquetas[din] : "Sin dato"}.</dd>
                <p className="tnum text-[12px] text-ds-muted mt-0.5">
                  VR(3) = {fmt(v.VR["3"][t], 2)} vs. banda del azar {fmt(lo3, 2)}–{fmt(hi3, 2)} · C(3) = {fmt(v.C["3"][t])} % vs. banda{" "}
                  {fmt(v.Cnull["3"][0][t])}–{fmt(v.Cnull["3"][2][t])} %
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
              {extremosPR.length > 0 && (
                <div className="border-t border-ds-rule pt-2.5">
                  <dt className="font-semibold text-ds-text inline">Precios relativos. </dt>
                  <dd className="inline">
                    {extremosPR.map(([id, it], j) => (
                      <span key={id}>
                        {j > 0 && "; "}
                        {it.nombre}: <span className="tnum">{fmtSigno(it.desvio_filtrada)} %</span> vs. su ancla y {cuadrante(it.desvio_filtrada, it.d6)?.split(" y ")[1]} (
                        <span className="tnum">{fmtSigno(it.d6)} %</span> en 6 meses)
                      </span>
                    ))}
                    .
                  </dd>
                  <p className="text-[12px] text-ds-muted mt-0.5">Ancla: historia sin cepo (s.e.). Es nivel, no timing: ver el backtest en Precios relativos.</p>
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
                    lo3 != null && hi3 != null ? ((v.VR["3"][t] ?? 0) > hi3 ? ", por encima de la banda del azar" : (v.VR["3"][t] ?? 0) < lo3 ? ", por debajo de la banda del azar" : ", dentro de la banda del azar") : ""
                  }.`
                : undefined
            }
            source={FUENTE}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  Eje horizontal: amplitud, D̄ = promedio de 3 meses de la difusión; franja: tercio central de su historia. Eje vertical: variance
                  ratio a 3 meses; franja: p5–p95 del null por permutación en {mes}. El color de cada punto va de azul (suba concentrada) a rojo
                  (suba generalizada).
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
                    {umbLo != null && umbHi != null && (
                      <ReferenceArea x1={umbLo} x2={umbHi} {...S.band} label={S.bandLabel("tercio central", "insideBottomLeft")} />
                    )}
                    {lo3 != null && hi3 != null && (
                      <ReferenceArea y1={lo3} y2={Math.min(hi3, yMax)} {...S.band} label={S.bandLabel(`banda del azar (${mes})`, "insideTopRight")} />
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
          context={`Promedio 3 meses: ${fmt(D3t)} % (terciles ${fmt(umbLo, 0)}–${fmt(umbHi, 0)})`}
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
          context={`Esperable al azar: ${fmt(v.Cnull["3"][1][t])} % (${fmt(v.Cnull["3"][0][t])}–${fmt(v.Cnull["3"][2][t])})`}
          hint="% de la canasta que superó al nivel general en al menos uno de los últimos 3 meses"
        />
        <Kpi
          label={`Variance ratio VR(3)${SE}`}
          value={fmt(v.VR["3"][t], 2)}
          delta={delta(v.VR["3"], 2, "")}
          spark={ult12(v.VR["3"])}
          context={`Banda del azar: ${fmt(lo3, 2)}–${fmt(hi3, 2)}`}
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
              { label: "Tercio central de su historia", color: T.band, kind: "band" },
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
                  % de la canasta cuya variación mensual supera a la del nivel general. Umbrales: terciles de la distribución histórica de D̄ de
                  esta variante ({fmt(umbLo)} y {fmt(umbHi)} %). Por debajo del primero la suba es concentrada; desde el segundo, generalizada. No se
                  usa 50 % como punto neutro: la distribución de variaciones es asimétrica a la derecha (pocos rubros con subas grandes tiran el
                  promedio para arriba) y D queda estructuralmente por debajo de 50 %.
                </p>
                <Formula>D_t = Σ ω_i · 1[π_i,t &gt; π_t]</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis {...yAxisNice([...col("D"), ...col("D3")], 5, [umbLo ?? 40, 50])} tickFormatter={(x) => `${x} %`} {...S.yAxis} />
                {umbLo != null && umbHi != null && <ReferenceArea y1={umbLo} y2={umbHi} {...S.band} label={labelTop("tercio central")} />}
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
              Ct != null && CloT != null && ChiT != null
                ? `${fmt(Ct)} % vs. ${fmt(CmedT)} % esperable al azar (banda ${fmt(CloT)}–${fmt(ChiT)} %): ${
                    Ct < CloT
                      ? "lideran los mismos rubros más de lo que daría el azar"
                      : Ct > ChiT
                        ? "los rubros se turnan más de lo que daría el azar"
                        : "no se distingue del azar"
                  }.`
                : undefined
            }
            legend={[
              { label: `C(${k}) observada`, color: T.s1 },
              { label: "Mediana del azar", color: T.text2, kind: "dash" },
              { label: "Banda del azar (p5–p95)", color: T.band, kind: "band" },
            ]}
            table={tabla([
              { key: "C", name: `C(${k})`, f: fmtPct },
              { key: "Cmed", name: "Mediana del azar", f: fmtPct },
            ])}
            source={`${FUENTE} % de la canasta.`}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  % de la canasta que superó al nivel general en al menos uno de los últimos {k} meses. La banda es el p5–p95 de {fmt(P.replicas_null, 0)}{" "}
                  réplicas que permutan los años dentro de cada mes calendario, ítem por ítem: cada rubro conserva su estacionalidad y su deriva
                  media, pero se rompe la dependencia entre meses.
                </p>
                <Formula>C_t(k) = Σ ω_i · 1[π_i &gt; π en ≥ 1 mes de la ventana]</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis
                  {...yAxisNice([...col("C"), ...rows.flatMap((r) => (Array.isArray(r.Cband) ? (r.Cband as number[]) : []))], 5)}
                  tickFormatter={(x) => `${x} %`}
                  {...S.yAxis}
                />
                <Tooltip
                  cursor={S.cursorLine}
                  content={tip([
                    { key: "C", name: `C(${k})`, color: T.s1, fmt: fmtPct },
                    { key: "Cmed", name: "Mediana del azar", color: T.text2, fmt: fmtPct },
                  ])}
                />
                <Area dataKey="Cband" stroke="none" fill={T.band} fillOpacity={T.bandOpacity * 1.6} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="Cmed" stroke={T.text2} strokeDasharray="4 4" strokeWidth={1.25} dot={false} isAnimationActive={false} />
                <Line dataKey="C" stroke={T.s1} {...S.line} />
                <Customized
                  component={(p: object) => (
                    <DirectLabels {...p} t={T} items={[etiq("C", `C(${k})`, T.s1, fmtPct), etiq("Cmed", "Mediana azar", T.text2, fmtPct, true)]} />
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame
            title={`Variance ratio de precios relativos${SE}`}
            sub={
              VRk != null && loK != null && hiK != null
                ? `VR(${k}) = ${fmt(VRk, 2)}, ${VRk > hiK ? "por encima" : VRk < loK ? "por debajo" : "dentro"} de la banda del azar (${fmt(loK, 2)}–${fmt(hiK, 2)}): ${
                    VRk > hiK ? "el cambio de precios relativos persiste" : VRk < loK ? "los precios relativos revierten" : "no se distingue del azar"
                  }.`
                : undefined
            }
            legend={[
              ...KS.map((x) => ({ label: `k = ${x}`, color: kColor[x] })),
              { label: `Banda del azar, k = ${k}`, color: T.band, kind: "band" as const },
              { label: "Mediana del azar", color: T.text2, kind: "dash" as const },
            ]}
            table={tabla(KS.map((x) => ({ key: `VR${x}`, name: `VR(${x})`, f: fmt2 })))}
            source={FUENTE}
            lastData={ultimo}
            howTo={
              <>
                <p>
                  Por debajo de la banda: los precios relativos revierten (los rubros se turnan) · dentro: no se distingue del azar · por encima:
                  cambio persistente. La banda es el p5–p95 de {fmt(P.replicas_null, 0)} réplicas con los años permutados dentro de cada mes
                  calendario, ítem por ítem; varía mes a mes porque cada ventana tiene su propia dispersión.
                </p>
                <Formula>VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j))</Formula>
              </>
            }
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={MARGEN}>
                <CartesianGrid {...S.grid} />
                <XAxis dataKey="fecha" tickFormatter={fmtMes} interval={tickInterval} {...S.xAxis} />
                <YAxis
                  {...yAxisNice([...col("VR3"), ...col("VR6"), ...col("VR12"), ...rows.flatMap((r) => (Array.isArray(r.VRband) ? (r.VRband as number[]) : []))], 0.5, [1])}
                  tickFormatter={(x) => fmt(x, 1)}
                  {...S.yAxis}
                />
                <Area dataKey="VRband" stroke="none" fill={T.band} fillOpacity={T.bandOpacity * 1.6} isAnimationActive={false} />
                <Line dataKey="VRmed" stroke={T.text2} strokeDasharray="4 4" strokeWidth={1.25} dot={false} isAnimationActive={false} />
                <Tooltip cursor={S.cursorLine} content={tip(KS.map((x) => ({ key: `VR${x}`, name: `VR(${x})`, color: kColor[x], fmt: fmt2 })))} />
                {KS.map((x) => (
                  <Line key={x} dataKey={`VR${x}`} stroke={kColor[x]} strokeOpacity={x === k ? 1 : 0.45} {...S.line} />
                ))}
                <Customized component={(p: object) => <DirectLabels {...p} t={T} items={KS.map((x) => etiq(`VR${x}`, `VR(${x})`, kColor[x], fmt2))} />} />
              </ComposedChart>
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

      {/* ================= PRECIOS RELATIVOS ================= */}
      <Section
        title="Precios relativos: nivel vs. dirección"
        sub={`Cada rubro frente a su ancla (su precio relativo promedio en los ${precios.ancla.meses} meses sin cepo) y su dirección reciente. Sirve para ubicar el nivel; en el backtest no anticipó la corrección a ${precios.backtest.horizonte_meses} meses.`}
      >
        <div className="space-y-8">
          <NivelDireccion precios={precios} ultimo={fmtMes(precios.fechas[precios.fechas.length - 1])} />
          <EvolucionRelativa
            precios={precios}
            desde={data.fechas[a]}
            hasta={data.fechas[b]}
            ultimo={fmtMes(precios.fechas[precios.fechas.length - 1])}
          />
        </div>
      </Section>

      {/* ================= MAPA ================= */}
      <Section title={`Mapa de precios relativos${SE}`}>
        <Heatmap serie={serie} a={a} b={b} fuente={FUENTE} precios={precios} />
      </Section>

      {/* ================= METODOLOGÍA ================= */}
      <Section title="Metodología, fuentes y limitaciones">
        <details className="border-t border-ds-head pt-3 text-[13.5px] text-ds-text-2">
          <summary className="cursor-pointer text-ds-text font-medium select-none">Ver detalle</summary>
          <div className="mt-4 space-y-6 max-w-[900px] leading-relaxed">
            <div>
              <p className="font-semibold text-ds-text">Datos y validación del universo</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  Fuente: INDEC, IPC base dic-2016 — <span className="font-mono text-[12px]">serie_ipc_aperturas.csv</span>,{" "}
                  <span className="font-mono text-[12px]">serie_ipc_divisiones.csv</span> y{" "}
                  <span className="font-mono text-[12px]">ponderadores_ipc.xls</span>. La serie nacional arranca en dic-2016; último dato:{" "}
                  {fmtMes(data.ultimo_periodo)}.
                </li>
                <li>
                  Canasta completa: {VAL.items} ítems = {VAL.publicados} aperturas × región publicadas + {VAL.restos} «resto de división» (lo que
                  la división pesa y sus aperturas publicadas no cubren). En cada región solo entran hojas del árbol de aperturas y a lo sumo un
                  resto por división: no hay superposición. Los ponderadores suman {fmt(VAL.sumaPesos, 9)} (tolerancia 1e-6). INDEC los publica
                  con 4 decimales y en dos regiones las divisiones sumaban 0,9999 y 1,0001, así que se reescalan dentro de cada región.
                </li>
                <li>
                  Ponderador nacional = peso de la región × ponderador regional (dic-2016), actualizado cada mes por precios relativos: ω
                  <sub>i,t</sub> ∝ ω<sub>i</sub> · I<sub>i,t−1</sub>. En ventanas de k meses se usan los ponderadores del inicio de la ventana.
                </li>
              </ul>
              <p className="mt-2">
                Reconciliación del nivel general recomputado con el publicado por INDEC, {VAL.reconciliacion.meses} meses: error máximo{" "}
                {fmt(VAL.reconciliacion.maxPp, 3)} pp, error medio absoluto {fmt(VAL.reconciliacion.maePp, 4)} pp,{" "}
                {VAL.reconciliacion.fueraDeTolerancia === 0
                  ? "ningún mes por encima de 0,05 pp"
                  : `${VAL.reconciliacion.fueraDeTolerancia} meses por encima de 0,05 pp`}
                . Los mayores desvíos ({VAL.reconciliacion.peores.map((x) => `${fmtMes(x.fecha)}: ${fmtSigno(x.desvio, 3)} pp`).join("; ")}) caen en
                los meses de inflación más alta y vienen del redondeo de los índices publicados (un decimal sobre bases de cuatro cifras). Por
                región, el máximo es {fmt(Math.max(...Object.values(VAL.reconciliacion.regionMaxPp)), 3)} pp.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Métricas</p>
              <div className="mt-1 space-y-0.5">
                <Formula>r_i,t = ln(1+π_i,t) − ln(1+π_t) — cambio de precio relativo</Formula>
                <Formula>D_t = Σ ω_i · 1[π_i,t &gt; π_t] — difusión puntual</Formula>
                <Formula>C_t(k) = Σ ω_i · 1[π_i,t−j &gt; π_t−j para algún j &lt; k] — cobertura de rotación</Formula>
                <Formula>A_t(k) = Σ ω_i · 1[Π_i,t(k) &gt; Π_t(k)] — difusión acumulada</Formula>
                <Formula>VR_t(k) = Var(Σ_j r_i,t−j) / (k · media_j Var(r_i,t−j)) — variance ratio (varianzas entre ítems)</Formula>
                <Formula>ρ_t = corr_i(r_i,t , r_i,t−1) — persistencia</Formula>
              </div>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Referencia del azar: null por permutación</p>
              <p className="mt-1">
                Para C(k) y VR(k), {fmt(P.replicas_null, 0)} réplicas en las que, dentro de cada ítem, se permutan los años de r<sub>i,t</sub>{" "}
                dentro de cada mes calendario. Cada rubro conserva su estacionalidad, su deriva media 2017–2026 y su volatilidad; se rompe la
                dependencia entre meses consecutivos, que es lo que miden C y VR. Se informa la banda p5–p95 y la mediana para cada mes.
              </p>
              <p className="mt-2">
                <span className="font-medium text-ds-text">Alternativas descartadas.</span> 1 − Π(1 − D) supone que cualquier ítem tiene la misma
                probabilidad de superar al nivel general cada mes. Con ítems heterogéneos la cobertura esperada es menor, así que la fórmula la
                sobreestima y sesga la lectura hacia «persistencia»: en esta variante la diferencia con la mediana del null es{" "}
                {fmt(sesgoCref, 1)} pp en promedio y {fmt((v.Cref["3"][t] ?? NaN) - (v.Cnull["3"][1][t] ?? NaN), 1)} pp en {mes}. El bootstrap por
                bloques de 12 meses también se descartó: conserva la autocorrelación dentro del bloque, que es justamente lo que mide VR(3–12), y
                el null reproduciría el valor observado.
              </p>
              <p className="mt-2">
                <span className="font-medium text-ds-text">Cómo leerlo.</span> «Persistencia» significa persistencia más allá de la deriva media de
                cada rubro en toda la muestra: una deriva constante de diez años no cuenta como señal; un episodio (congelamiento y después
                recomposición) sí. Con 10 años por mes calendario el null queda algo angosto: en paneles de ruido puro, el valor observado cae
                dentro de la banda p5–p95 en torno al 84 % de los meses (90 % nominal).
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Reglas del régimen</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  Amplitud, sobre D̄ (promedio de 3 meses de D): concentrada si está en el tercio inferior de su historia, generalizada si está en el
                  superior, intermedia en el medio. Terciles de esta variante: {fmt(umbLo)} y {fmt(umbHi)} %. Se calibra contra la historia
                  porque D cae estructuralmente bajo 50 % (la distribución de variaciones es asimétrica a la derecha) y un umbral fijo no es
                  neutro. Los umbrales anteriores (40 y 45 %) eran heurísticos.
                </li>
                <li>
                  Dinámica, contra el null del mes: persistencia si VR(3) supera el p95 o C(3) queda bajo el p5; rotación si VR(3) cae bajo el p5
                  o C(3) supera el p95; si no sale de ninguna banda, o las dos señales se contradicen, «sin patrón distinguible del azar».
                </li>
                <li>El régimen combina ambas; con amplitud intermedia o sin patrón se informa «sin señal clara». La bajada se arma con estas reglas.</li>
                <li>Robustez: cuántas de las 12 variantes (universo × ponderación × serie) repiten la lectura, cada una con sus propios umbrales.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Precios relativos y anclas</p>
              <p className="mt-1">
                Nivel relativo L<sub>i,t</sub> = ln(I<sub>i,t</sub>/I<sub>i,dic-16</sub>) − ln(H<sub>t</sub>/H<sub>dic-16</sub>), con series
                desestacionalizadas. El desvío se mide contra un ancla, no contra una fecha base: con base 2021 la ropa parece atrasada cuando
                corrige un nivel alto, y con base en dic-2023 la electricidad parece normalizada.
              </p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  <span className="font-medium text-ds-text">Ancla externa o de costo: no se usa.</span> Las candidatas no son confiables o no
                  corresponden al ítem: INDEC publica electricidad y gas en una sola apertura; la cobertura del costo de generación (CAMMESA) no tiene
                  una serie oficial descargable; la paridad del gas no tiene una serie pública sin registro; los niveles de precios del ICP 2021
                  están medidos al tipo de cambio oficial en pleno cepo; los alquileres por m² son solo de CABA, trimestrales y en PDF.
                </li>
                <li>
                  <span className="font-medium text-ds-text">Historia filtrada por régimen (la que se usa).</span> Promedio de L en los{" "}
                  {precios.ancla.meses} meses sin cepo cambiario ({precios.ancla.periodos.map(([x, y]) => `${fmtMes(x)} a ${fmtMes(y)}`).join(" y ")};{" "}
                  {precios.ancla.fuentes}). Se usa el criterio legal del cepo y no una brecha medida porque es oficial y verificable; los
                  congelamientos tarifarios y los controles de precios generalizados de 2019–2023 quedan dentro del período excluido.
                </li>
                <li>
                  <span className="font-medium text-ds-text">Promedio simple de toda la muestra:</span> solo como referencia; la distancia entre
                  ambas anclas es la barra horizontal del gráfico.
                </li>
              </ul>
              <p className="mt-2">
                <span className="font-medium text-ds-text">¿Sirve para estimar?</span> Backtest con {precios.backtest.n_items} aperturas nacionales,
                orígenes cada {precios.backtest.horizonte_meses} meses desde {fmtMes(precios.backtest.origenes[0])} y anclas calculadas solo con datos
                pasados: el cambio del precio relativo en los {precios.backtest.horizonte_meses} meses siguientes contra el desvío da β ={" "}
                {fmt(precios.backtest.filtrada.beta, 2)} (t = {fmt(precios.backtest.filtrada.t, 1)}, R² = {fmt(precios.backtest.filtrada.r2 * 100, 0)} %,
                acierto de signo {fmt(precios.backtest.filtrada.acierto_signo * 100, 0)} %). Con el promedio simple: β ={" "}
                {fmt(precios.backtest.simple.beta, 2)} (t = {fmt(precios.backtest.simple.t, 1)}). Con la dirección pasada (momentum): β ={" "}
                {fmt(precios.backtest.momentum.beta, 2)} (t = {fmt(precios.backtest.momentum.t, 1)}). Ninguno es distinto de cero: en esta muestra
                el desvío no predijo la corrección en ese horizonte. Se muestra como lectura de nivel, no como señal de timing.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Desestacionalización (s.e.)</p>
              <p className="mt-1">
                {P.desest.metodo}. Resultaron estacionales {P.desest.items_ajustados} de {P.desest.items_total} ítems; el resto queda sin ajustar.
                Se trabaja sobre Δln, donde los cambios de nivel (dic-2023) son outliers de pocos meses que la versión robusta pondera a cero, y la
                ventana de 7 años deja que el patrón estacional cambie. Se descartó X-13 con regresores de cambio de nivel: agrega un binario
                externo y una especificación por serie para un beneficio que no se puede validar con menos de tres años del régimen actual. El
                nivel general s.e. es la agregación de los ítems ajustados y se revisa con cada dato nuevo.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ds-text">Limitaciones</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>La serie nacional arranca en dic-2016: el ancla filtrada se apoya en {precios.ancla.meses} meses y en dos regímenes distintos.</li>
                <li>Las anclas tienen error propio: el período sin cepo 2017–2019 incluye tarifas todavía en recomposición, y desde 2024 hay cambios estructurales (apertura importadora).</li>
                <li>El nivel se muestra como rango entre anclas, no como un número exacto.</li>
                <li>INDEC publica 27 aperturas por región: la difusión es más gruesa que con el relevamiento completo; los «resto de división» pueden ser ruidosos.</li>
                <li>Los ponderadores corresponden a la canasta ENGHo 2004/05.</li>
                <li>Es una lectura descriptiva, no una proyección.</li>
              </ul>
            </div>
          </div>
        </details>
      </Section>
    </div>
  );
}
