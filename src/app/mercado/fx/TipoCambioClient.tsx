"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Customized,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { ChartFrame, ChartTooltip, DirectLabels, useChartStyle, yAxisNice, type TipSerie } from "@/components/ds/Chart";
import { Control, ControlBar, Segmented } from "@/components/ds/Controls";
import { FreshnessLine } from "@/components/ds/Freshness";
import { Kpi, KpiStrip } from "@/components/ds/Kpi";
import { Eyebrow, Lede, Note, PageTitle, Section } from "@/components/ds/Typography";
import { fmtFecha } from "@/lib/indec/calendario";
import { fmt, fmtMes, fmtSigno } from "@/lib/inflacion/formato";
import type { Perimetro } from "@/lib/fx/reservas";
import type { ComprasData, CotizacionesData, FxManifest, Punto, ReservasData } from "@/lib/fx/types";
import { CalendarioVencimientos, PanelReservas, SerieReservas, usd, type Seleccion, type Vista } from "./Reservas";

// ---------------------------------------------------------------------------
// Constantes y utilidades
// ---------------------------------------------------------------------------

const INICIO_BANDA = "2025-04-14";
const MARGEN = { top: 8, right: 108, left: 0, bottom: 4 };
const FUENTE_COT = "Fuente: BCRA (A3500, banda: API v4 · variables 5, 1187, 1188); MEP, CCL, blue y cripto: argentinadatos.com.";

type Periodo = "banda" | "6m" | "1y" | "2y" | "5y";
const PERIODOS: { key: Periodo; label: string; title?: string }[] = [
  { key: "banda", label: "Banda", title: "Desde el inicio del régimen de bandas (14/04/2025)" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1A" },
  { key: "2y", label: "2A" },
  { key: "5y", label: "5A" },
];

function desdeDe(p: Periodo, ultima: string): string {
  if (p === "banda") return INICIO_BANDA;
  const d = new Date(ultima + "T12:00:00Z");
  const meses = { "6m": 6, "1y": 12, "2y": 24, "5y": 60 }[p];
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

const pesos = (v: number | null | undefined, d = 2) => (v == null ? "sin dato" : `$${fmt(v, d)}`);
const pct = (v: number | null | undefined, d = 1) => (v == null ? "sin dato" : `${fmt(v, d)} %`);

/** Valor de una serie [fecha, valor] a una fecha (último ≤ fecha). */
function valorEn(s: Punto[], f: string): number | null {
  let lo = 0;
  let hi = s.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (s[m][0] <= f) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r >= 0 ? s[r][1] : null;
}

function menosDias(f: string, n: number): string {
  const d = new Date(f + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Muestra de fin de mes de los últimos 12 meses (para sparklines). */
function spark12(s: Punto[]): (number | null)[] {
  if (!s.length) return [];
  const ult = s[s.length - 1][0];
  return Array.from({ length: 13 }, (_, i) => valorEn(s, menosDias(ult, (12 - i) * 30.4375)));
}

// ---------------------------------------------------------------------------
// Lectura por reglas (bajada y conclusiones de sección)
// ---------------------------------------------------------------------------

export interface Lectura {
  posicion: string;
  ritmo: string;
  reservas: string;
  compras: string;
}

/**
 * Reglas (documentadas en Metodología):
 * R1 Posición: tercio de la banda según (oficial − piso)/(techo − piso): < 33 % inferior, 33–67 % medio, > 67 % superior.
 * R2 Ritmo: con las tasas mensuales de los últimos 3 meses del oficial y del techo (piso), si el oficial sube más rápido
 *    que el techo se informa en cuántos meses lo alcanzaría; si no, que la distancia se amplía. Simétrico para el piso.
 * R3 Reservas: nivel de netas BCRA y consolidadas y variación de netas BCRA en 30 días corridos.
 * R4 Compras: suma de compras netas del BCRA en 30 y 90 días corridos y en el año.
 */
export function lectura(c: CotizacionesData, k: ComprasData, r: ReservasData): Lectura {
  const b = c.banda;
  const tercio = b.posicion_pct < 33 ? "el tercio inferior" : b.posicion_pct > 67 ? "el tercio superior" : "el tercio medio";
  const posicion = `El dólar oficial (A3500) está en ${pesos(b.oficial)}, en ${tercio} de la banda: el techo (${pesos(b.techo)}) queda ${fmt(
    b.dist_techo_pct,
    1
  )} % arriba y el piso, ${fmt(b.dist_piso_pct, 1)} % abajo.`;
  let ritmo: string;
  if (b.ritmo_techo_3m == null) ritmo = "";
  else if (b.meses_al_techo != null)
    ritmo = `Al ritmo de los últimos tres meses (oficial ${fmtSigno(b.ritmo_oficial_3m, 2)} % mensual, techo ${fmtSigno(b.ritmo_techo_3m, 2)} %), alcanzaría el techo en ${fmt(b.meses_al_techo, 0)} meses.`;
  else if (b.meses_al_piso != null)
    ritmo = `Al ritmo de los últimos tres meses (oficial ${fmtSigno(b.ritmo_oficial_3m, 2)} % mensual, piso ${fmtSigno(b.ritmo_piso_3m, 2)} %), tocaría el piso en ${fmt(b.meses_al_piso, 0)} meses.`;
  else
    ritmo = `Al ritmo de los últimos tres meses (oficial ${fmtSigno(b.ritmo_oficial_3m, 2)} % mensual, techo ${fmtSigno(b.ritmo_techo_3m, 2)} %), la distancia al techo se amplía.`;
  const u = r.ultimo;
  const hace30 = [...r.diaria].reverse().find((d) => d.f <= menosDias(u.f, 30));
  const dA = hace30 ? u.netas_a - hace30.netas_a : null;
  const reservas = `Las reservas netas del BCRA suman USD ${usd(u.netas_a)} M (${dA == null ? "sin dato a 30 días" : `${fmtSigno(dA, 0)} M en 30 días`}); en el perímetro consolidado con el Tesoro, USD ${usd(u.netas_b)} M.`;
  const compras = `El BCRA compró USD ${usd(k.ultimo.d30)} M en los últimos 30 días y USD ${usd(k.ultimo.anio)} M en ${k.ultimo.anio_ref}.`;
  return { posicion, ritmo, reservas, compras };
}

// ---------------------------------------------------------------------------
// Gráficos de cotizaciones
// ---------------------------------------------------------------------------

function useFilas(c: CotizacionesData, desde: string, claves: (keyof CotizacionesData["series"])[]) {
  return useMemo(() => {
    const m = new Map<string, Record<string, number | string | null>>();
    for (const k of claves)
      for (const [f, v] of c.series[k]) {
        if (f < desde) continue;
        const row = m.get(f) ?? { f };
        row[k] = v;
        m.set(f, row);
      }
    return [...m.values()].sort((a, b) => String(a.f).localeCompare(String(b.f)));
  }, [c, desde, claves]);
}

const CLAVES_BANDA: (keyof CotizacionesData["series"])[] = ["a3500", "piso", "techo"];
const CLAVES_PAR: (keyof CotizacionesData["series"])[] = ["a3500", "mep", "ccl", "blue", "cripto"];

function BandaChart({ c, periodo }: { c: CotizacionesData; periodo: Periodo }) {
  const { t, grid, xAxis, yAxis, line, cursorLine, band } = useChartStyle();
  const ultima = c.banda.fecha;
  const filas = useFilas(c, desdeDe(periodo, ultima), CLAVES_BANDA);
  type FilaB = { f: string; a3500: number; piso: number | null; techo: number | null; rango: [number, number] | null };
  const rows: FilaB[] = filas
    .filter((r) => r.a3500 != null)
    .map((r) => {
      const piso = (r.piso as number | null) ?? null;
      const techo = (r.techo as number | null) ?? null;
      return { f: String(r.f), a3500: r.a3500 as number, piso, techo, rango: piso != null && techo != null ? [piso, techo] : null };
    });
  const series: TipSerie[] = [
    { key: "a3500", name: "Oficial (A3500)", color: t.s1, fmt: (v) => pesos(v) },
    { key: "techo", name: "Techo", color: t.text2, fmt: (v) => pesos(v) },
    { key: "piso", name: "Piso", color: t.text2, fmt: (v) => pesos(v) },
  ];
  const ax = yAxisNice(rows.flatMap((r) => [r.a3500, r.piso, r.techo]), 100);
  const b = c.banda;
  return (
    <ChartFrame
      title="Dólar oficial (A3500) dentro de la banda cambiaria ($ por USD)"
      sub={`Posición en la banda: ${fmt(b.posicion_pct, 0)} % del ancho (0 % = piso, 100 % = techo).`}
      legend={[
        { label: "Oficial (A3500)", color: t.s1 },
        { label: "Piso y techo", color: t.text2, kind: "dash" },
        { label: "Banda", color: t.band, kind: "band" },
      ]}
      table={{
        columns: ["Fecha", "A3500", "Piso", "Techo"],
        rows: [...rows].reverse().map((r) => [fmtFecha(r.f), pesos(r.a3500), pesos(r.piso), pesos(r.techo)]),
      }}
      source={FUENTE_COT}
      lastData={fmtFecha(b.fecha)}
      howTo={
        <>
          <p>{c.regla_banda.texto}</p>
          <p>
            Valores diarios oficiales de piso y techo: {c.regla_banda.serie}.{" "}
            <a href={c.regla_banda.url} target="_blank" rel="noopener noreferrer" className="underline">
              {c.regla_banda.fuente}
            </a>
            .
          </p>
        </>
      }
    >
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={MARGEN}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="f" {...xAxis} tickFormatter={(f: string) => fmtMes(f)} minTickGap={40} />
            <YAxis {...yAxis} domain={ax.domain} ticks={ax.ticks} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip cursor={cursorLine} content={<ChartTooltip series={series} labelFormat={fmtFecha} />} />
            <Area dataKey="rango" fill={band.fill} fillOpacity={band.fillOpacity} stroke="none" isAnimationActive={false} connectNulls={false} />
            <Line dataKey="techo" stroke={t.text2} {...line} strokeWidth={1} strokeDasharray="4 3" />
            <Line dataKey="piso" stroke={t.text2} {...line} strokeWidth={1} strokeDasharray="4 3" />
            <Line dataKey="a3500" stroke={t.s1} {...line} />
            <Customized
              component={
                <DirectLabels
                  t={t}
                  items={[
                    { value: b.techo, name: "Techo", color: t.text2, fmt: (v) => fmt(v, 0), muted: true },
                    { value: b.oficial, name: "A3500", color: t.s1, fmt: (v) => fmt(v, 0) },
                    { value: b.piso, name: "Piso", color: t.text2, fmt: (v) => fmt(v, 0), muted: true },
                  ]}
                />
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function ParalelosChart({ c, periodo }: { c: CotizacionesData; periodo: Periodo }) {
  const { t, grid, xAxis, yAxis, line, cursorLine } = useChartStyle();
  const filas = useFilas(c, desdeDe(periodo, c.banda.fecha), CLAVES_PAR);
  const series: TipSerie[] = [
    { key: "a3500", name: "Oficial (A3500)", color: t.s1, fmt: (v) => pesos(v) },
    { key: "mep", name: "MEP", color: t.s3, fmt: (v) => pesos(v) },
    { key: "ccl", name: "CCL", color: t.s2, fmt: (v) => pesos(v) },
    { key: "blue", name: "Blue", color: t.muted, fmt: (v) => pesos(v) },
    { key: "cripto", name: "Cripto (USDT)", color: t.muted, fmt: (v) => pesos(v) },
  ];
  const ax = yAxisNice(filas.flatMap((r) => series.map((s) => r[s.key] as number | null)), 100);
  const ult = (k: keyof CotizacionesData["series"]) => c.ultimos[k]?.[1] ?? null;
  return (
    <ChartFrame
      title="Oficial, financieros y paralelos ($ por USD)"
      sub="Blue y cripto como referencia secundaria: no son mercados regulados y cotizan también los fines de semana (cripto)."
      legend={[
        { label: "Oficial (A3500)", color: t.s1 },
        { label: "MEP", color: t.s3 },
        { label: "CCL", color: t.s2 },
        { label: "Blue", color: t.muted },
        { label: "Cripto (USDT)", color: t.muted, kind: "dash" },
      ]}
      table={{
        columns: ["Fecha", "A3500", "MEP", "CCL", "Blue", "Cripto"],
        rows: [...filas].reverse().map((r) => [fmtFecha(String(r.f)), ...series.map((s) => (r[s.key] == null ? "—" : fmt(r[s.key] as number, 2)))]),
      }}
      source={FUENTE_COT}
      lastData={fmtFecha(c.banda.fecha)}
      howTo={<p>Precio de venta. MEP = dólar bolsa (AL30/GD30); CCL = contado con liquidación; cripto = USDT/ARS, cotización indicativa de exchanges.</p>}
    >
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={MARGEN}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="f" {...xAxis} tickFormatter={(f: string) => fmtMes(f)} minTickGap={40} />
            <YAxis {...yAxis} domain={ax.domain} ticks={ax.ticks} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip cursor={cursorLine} content={<ChartTooltip series={series} labelFormat={fmtFecha} />} />
            <Line dataKey="cripto" stroke={t.muted} {...line} strokeWidth={1} strokeDasharray="3 3" connectNulls />
            <Line dataKey="blue" stroke={t.muted} {...line} strokeWidth={1} connectNulls />
            <Line dataKey="ccl" stroke={t.s2} {...line} connectNulls />
            <Line dataKey="mep" stroke={t.s3} {...line} connectNulls />
            <Line dataKey="a3500" stroke={t.s1} {...line} connectNulls />
            <Customized
              component={
                <DirectLabels
                  t={t}
                  items={[
                    { value: ult("ccl"), name: "CCL", color: t.s2, fmt: (v) => fmt(v, 0) },
                    { value: ult("mep"), name: "MEP", color: t.s3, fmt: (v) => fmt(v, 0) },
                    { value: ult("a3500"), name: "A3500", color: t.s1, fmt: (v) => fmt(v, 0) },
                  ]}
                />
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

function ComprasCharts({ k, periodo, ultimaFx }: { k: ComprasData; periodo: Periodo; ultimaFx: string }) {
  const { t, grid, xAxis, yAxis, line, cursorLine, cursorBar } = useChartStyle();
  const desde = desdeDe(periodo, ultimaFx);
  const diarias = k.diarias.filter(([f]) => f >= desde).map(([f, v]) => ({ f, v }));
  const acum = k.acum.filter(([f]) => f >= desde).map(([f, a, b]) => ({ f, d30: a, d90: b }));
  const axD = yAxisNice(diarias.map((d) => d.v), 50, [0]);
  const axA = yAxisNice(acum.flatMap((d) => [d.d30, d.d90]), 500, [0]);
  const sD: TipSerie[] = [{ key: "v", name: "Compra neta del día", color: t.s1, fmt: (v) => `USD ${fmt(v, 0)} M` }];
  const sA: TipSerie[] = [
    { key: "d30", name: "Acumulado 30 días", color: t.s1, fmt: (v) => `USD ${fmt(v, 0)} M` },
    { key: "d90", name: "Acumulado 90 días", color: t.s2, fmt: (v) => `USD ${fmt(v, 0)} M` },
  ];
  const u = k.ultimo;
  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2 mt-5">
      <ChartFrame
        title="Compras netas del BCRA en el mercado de cambios, diarias (USD M)"
        sub={`Último dato: USD ${fmt(u.dia, 0)} M el ${fmtFecha(u.fecha)}. Negativo = venta.`}
        source={`Fuente: ${k.fuente}.`}
        lastData={fmtFecha(u.fecha)}
        table={{ columns: ["Fecha", "USD M"], rows: [...diarias].reverse().map((d) => [fmtFecha(d.f), fmt(d.v, 1)]) }}
      >
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={diarias} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="f" {...xAxis} tickFormatter={(f: string) => fmtMes(f)} minTickGap={40} />
              <YAxis {...yAxis} domain={axD.domain} ticks={axD.ticks} tickFormatter={(v) => fmt(v, 0)} />
              <ReferenceLine y={0} stroke={t.text2} />
              <Tooltip cursor={cursorBar} content={<ChartTooltip series={sD} labelFormat={fmtFecha} />} />
              <Bar dataKey="v" isAnimationActive={false}>
                {diarias.map((d) => (
                  <Cell key={d.f} fill={(d.v ?? 0) < 0 ? t.s4 : t.s1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
      <ChartFrame
        title="Compras netas acumuladas en 30 y 90 días corridos (USD M)"
        sub={`USD ${fmt(u.d30, 0)} M en 30 días y USD ${fmt(u.d90, 0)} M en 90 días.`}
        legend={sA.map((s) => ({ label: s.name, color: s.color }))}
        source={`Fuente: ${k.fuente}, cálculo propio.`}
        lastData={fmtFecha(u.fecha)}
      >
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={acum} margin={{ ...MARGEN, right: 96 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="f" {...xAxis} tickFormatter={(f: string) => fmtMes(f)} minTickGap={40} />
              <YAxis {...yAxis} domain={axA.domain} ticks={axA.ticks} tickFormatter={(v) => fmt(v, 0)} />
              <ReferenceLine y={0} stroke={t.text2} />
              <Tooltip cursor={cursorLine} content={<ChartTooltip series={sA} labelFormat={fmtFecha} />} />
              {sA.map((s) => (
                <Line key={s.key} dataKey={s.key} stroke={s.color} {...line} />
              ))}
              <Customized
                component={<DirectLabels t={t} items={sA.map((s) => ({ value: u[s.key as "d30" | "d90"], name: s.key === "d30" ? "30 días" : "90 días", color: s.color, fmt: (v) => fmt(v, 0) }))} />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function TipoCambioClient({
  cot,
  compras,
  reservas,
  manifest,
}: {
  cot: CotizacionesData;
  compras: ComprasData;
  reservas: ReservasData;
  manifest: FxManifest;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("banda");
  const [perimetro, setPerimetro] = useState<Perimetro>("A");
  const [vista, setVista] = useState<Vista>("diaria");
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [hoy, setHoy] = useState<string>(manifest.generado.slice(0, 10));
  useEffect(() => setHoy(new Date().toISOString().slice(0, 10)), []);

  const L = lectura(cot, compras, reservas);
  const b = cot.banda;
  const s = cot.series;
  const u = reservas.ultimo;
  const ult = (k: keyof typeof s) => s[k][s[k].length - 1]?.[1] ?? null;
  const o30 = valorEn(s.a3500, menosDias(b.fecha, 30));
  const brecha = (k: "mep" | "ccl") => {
    const v = ult(k);
    return v != null ? (v / b.oficial - 1) * 100 : null;
  };
  const hace30 = [...reservas.diaria].reverse().find((d) => d.f <= menosDias(u.f, 30));
  const stale = Object.values(manifest.fuentes).some((x) => x.desactualizado);
  const nombresStale = Object.entries(manifest.fuentes).filter(([, x]) => x.desactualizado).map(([k]) => k);

  return (
    <div className="max-w-[1180px]">
      <FreshnessLine
        stale={stale}
        items={[
          `A3500 y banda al ${fmtFecha(b.fecha)}`,
          `reservas al ${fmtFecha(u.f)}`,
          `planilla NEDD-FMI al ${fmtFecha(reservas.calendario.planilla)}`,
          `calculado ${fmtFecha(manifest.generado.slice(0, 10))}`,
        ]}
      />
      <Eyebrow>Mercados · Tipo de cambio</Eyebrow>
      <PageTitle>Tipo de cambio</PageTitle>
      <Lede>
        {L.posicion} {L.ritmo} {L.reservas}
      </Lede>
      {stale && (
        <Note>
          Fuentes atrasadas respecto de su frecuencia esperada: {nombresStale.join(", ")}. Los valores se muestran con su fecha.
        </Note>
      )}

      <KpiStrip cols={6}>
        <Kpi
          label="Oficial (A3500)"
          value={fmt(b.oficial, 2)}
          unit="$/USD"
          delta={o30 ? `${fmtSigno((b.oficial / o30 - 1) * 100, 1)} % en 30 días` : undefined}
          spark={spark12(s.a3500)}
          context={`al ${fmtFecha(b.fecha)}`}
        />
        <Kpi
          label="MEP"
          value={fmt(ult("mep"), 2)}
          unit="$/USD"
          delta={`brecha ${fmtSigno(brecha("mep"), 1)} %`}
          spark={spark12(s.mep)}
          context="vs. oficial"
        />
        <Kpi
          label="CCL"
          value={fmt(ult("ccl"), 2)}
          unit="$/USD"
          delta={`brecha ${fmtSigno(brecha("ccl"), 1)} %`}
          spark={spark12(s.ccl)}
          context="vs. oficial"
        />
        <Kpi
          label="Distancia al techo"
          value={fmt(b.dist_techo_pct, 1)}
          unit="%"
          delta={`techo ${pesos(b.techo)}`}
          context={b.meses_al_techo != null ? `al ritmo de 3 m: ${fmt(b.meses_al_techo, 0)} meses` : "al ritmo de 3 m no lo alcanza"}
        />
        <Kpi
          label="Devaluación implícita 12 m"
          value="sin dato"
          context="Futuros A3: se incorpora con la sección «Qué descuenta el mercado»"
        />
        <Kpi
          label="Reservas netas BCRA"
          value={usd(u.netas_a)}
          unit="USD M"
          delta={hace30 ? `${fmtSigno(u.netas_a - hace30.netas_a, 0)} M en 30 días` : undefined}
          spark={reservas.mensual.slice(-13).map((m) => m.netas_a)}
          context="Ver composición ›"
          hint="Abrir el detalle por componente"
          onClick={() => setSel({ f: u.f, vista: "diaria" })}
        />
      </KpiStrip>

      <ControlBar>
        <Control label="Período">
          <Segmented<Periodo> value={periodo} onChange={setPeriodo} options={PERIODOS} ariaLabel="Período" />
        </Control>
        <Control label="Perímetro de reservas">
          <Segmented<Perimetro>
            value={perimetro}
            onChange={setPerimetro}
            ariaLabel="Perímetro de reservas"
            options={[
              { key: "A", label: "BCRA" },
              { key: "B", label: "Consolidado" },
            ]}
          />
        </Control>
      </ControlBar>

      <Section id="donde-esta" title="1. Dónde está y bajo qué reglas" sub={`${L.posicion} ${L.ritmo}`}>
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          <BandaChart c={cot} periodo={periodo} />
          <ParalelosChart c={cot} periodo={periodo} />
        </div>
        <DistanciasTabla c={cot} />
      </Section>

      <Section id="compras" title="Compras de divisas" sub={L.compras}>
        <ComprasCharts k={compras} periodo={periodo} ultimaFx={b.fecha} />
        <Note>
          Tesoro: sin dato. {compras.tesoro.nota}
        </Note>
      </Section>

      <Section id="reservas" title="Reservas netas" sub={L.reservas}>
        <SerieReservas data={reservas} perimetro={perimetro} vista={vista} onVista={setVista} onSelect={setSel} />
        <div className="mt-6">
          <CalendarioVencimientos data={reservas} />
        </div>
        <Note>
          La RIN con la metodología del programa con el FMI no se publica: con datos públicos la réplica difiere hasta{" "}
          USD{" "}
          {usd(Math.max(...reservas.rin_fmi.anclas.filter((a) => a.error != null).map((a) => Math.abs(a.error as number))))} M del
          dato del staff. Detalle en el panel de composición.
        </Note>
      </Section>

      <Metodologia reservas={reservas} cot={cot} />

      <p className="mt-8 text-[12.5px] text-ds-muted">
        La vista anterior con series históricas de todas las cotizaciones sigue disponible en{" "}
        <Link href="/mercado/fx/series" className="underline">
          Tipo de cambio · series
        </Link>{" "}
        hasta que las secciones siguientes (valuación, mercado, flujos, stress y escenarios) la reemplacen.
      </p>

      {sel && (
        <PanelReservas data={reservas} sel={sel} perimetro={perimetro} onPerimetro={setPerimetro} onClose={() => setSel(null)} hoy={hoy} />
      )}
    </div>
  );
}

function DistanciasTabla({ c }: { c: CotizacionesData }) {
  const b = c.banda;
  const filas = [
    {
      lim: "Techo",
      valor: b.techo,
      dist: b.dist_techo_pct,
      ritmo: b.ritmo_techo_3m,
      meses: b.meses_al_techo,
      txt: b.meses_al_techo == null ? "No lo alcanza: el techo sube más rápido" : `${fmt(b.meses_al_techo, 1)} meses`,
    },
    {
      lim: "Piso",
      valor: b.piso,
      dist: -b.dist_piso_pct,
      ritmo: b.ritmo_piso_3m,
      meses: b.meses_al_piso,
      txt: b.meses_al_piso == null ? "No lo alcanza: el oficial no baja más rápido que el piso" : `${fmt(b.meses_al_piso, 1)} meses`,
    },
  ];
  return (
    <div className="mt-6 border-t border-ds-head pt-3.5">
      <p className="font-semibold text-[15px] text-ds-text">Distancia a los límites de la banda</p>
      <p className="text-ds-text-2 text-[13px] mt-0.5 mb-2">
        En % y en meses, si el oficial y los límites siguen al ritmo de los últimos {b.ventana_dias} días (oficial {fmtSigno(b.ritmo_oficial_3m, 2)} %
        mensual).
      </p>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] max-w-[820px] min-w-[600px]">
        <thead>
          <tr>
            {["Límite", "Nivel", "Distancia", "Ritmo mensual del límite", "Tiempo hasta tocarlo"].map((h, i) => (
              <th key={h} className={`smallcaps text-ds-text-2 px-2 py-1.5 border-b border-ds-rule-strong ${i ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.lim}>
              <td className="px-2 py-1.5 border-b border-ds-rule">{f.lim}</td>
              <td className="px-2 py-1.5 border-b border-ds-rule text-right tnum">{pesos(f.valor)}</td>
              <td className="px-2 py-1.5 border-b border-ds-rule text-right tnum">{fmtSigno(f.dist, 1)} %</td>
              <td className="px-2 py-1.5 border-b border-ds-rule text-right tnum">{f.ritmo == null ? "sin dato" : `${fmtSigno(f.ritmo, 2)} %`}</td>
              <td className="px-2 py-1.5 border-b border-ds-rule text-right">{f.txt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="text-[11.5px] text-ds-muted mt-1.5">
        Es una extrapolación mecánica, no una proyección: el ritmo futuro de la banda depende de la inflación que publique el
        INDEC (T-2) y el del oficial, del mercado.
      </p>
    </div>
  );
}

function Metodologia({ reservas, cot }: { reservas: ReservasData; cot: CotizacionesData }) {
  const v = reservas.validacion;
  return (
    <Section id="metodologia" title="Metodología y limitaciones">
      <div className="border-t border-ds-head pt-3.5 text-[13.5px] text-ds-text-2 leading-relaxed space-y-3 max-w-[900px]">
        <p>
          <b className="text-ds-text">Reglas de la bajada.</b> (R1) Posición: tercio de la banda según (oficial − piso) / (techo −
          piso): menos de 33 %, inferior; más de 67 %, superior. (R2) Ritmo: tasas mensuales equivalentes de los últimos 91 días del
          A3500 y de cada límite; si el oficial sube más rápido que el techo se informa en cuántos meses lo alcanzaría, si no, que
          la distancia se amplía (simétrico para el piso). (R3) Reservas: nivel de netas BCRA y consolidadas, y variación de netas
          BCRA en 30 días corridos. (R4) Compras: suma de compras netas del BCRA en 30 y 90 días corridos y en el año. Son
          descripciones, no proyecciones.
        </p>
        <p>
          <b className="text-ds-text">Banda.</b> {cot.regla_banda.texto} Se usan los valores diarios oficiales publicados por el
          BCRA ({cot.regla_banda.serie}); no se reconstruye la fórmula.
        </p>
        <p>
          <b className="text-ds-text">Regla de reservas netas.</b> A las brutas se les resta lo que suma a las brutas y es un pasivo.
          El swap con China suma completo a las brutas, así que se resta completo; un swap no activado (por ejemplo, con el Tesoro de
          EE.UU.) no suma a las brutas y solo se resta lo usado. La planilla del BCRA registra ambos casos como posición corta a
          término (II.2): se resta ese total. Corto plazo = vencimiento residual ≤ 12 meses en todos los componentes.
        </p>
        <p>
          <b className="text-ds-text">Fuentes y frecuencia.</b> Diarias (API v4 del BCRA): brutas, encajes en USD y depósitos del
          Tesoro en ME (desde ene-2024). Mensuales (planilla de Reservas Internacionales y Liquidez en ME que el BCRA publica para el
          FMI, NEDD): swaps, pases, vencimientos ≤ 12 meses del BCRA y del Gobierno Central. La serie diaria combina los datos del
          día con la última planilla publicada. Validación: las brutas de la planilla coinciden con la API en todos los cierres de
          mes ({v.brutas_vs_api.length === 0 ? "sin diferencias mayores a USD 2 M" : `${v.brutas_vs_api.length} diferencias`}); los
          encajes y depósitos del Tesoro de la nota de la planilla coinciden con la API al centavo.
        </p>
        <p>
          <b className="text-ds-text">Validaciones automáticas.</b> El waterfall suma el total en cada fecha y perímetro (
          {v.waterfall_ok ? "OK" : "con errores"}). No doble conteo: un desembolso del FMI de USD{" "}
          {fmt(v.no_doble_conteo.desembolso, 0)} M depositado por el Tesoro en el BCRA deja igual las super netas BCRA (
          {fmtSigno(v.no_doble_conteo.delta_super_a, 0)}) y sube las netas consolidadas en lo mismo (
          {fmtSigno(v.no_doble_conteo.delta_netas_b, 0)}): en ninguna variante se resta dos veces ({v.no_doble_conteo_ok ? "OK" : "falla"}).
        </p>
        <p>
          <b className="text-ds-text">Limitaciones.</b>
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Los componentes mensuales tienen rezago: la planilla del mes M se publica semanas después. Entre planillas, las netas
            diarias usan swaps, pases y vencimientos del último cierre.
          </li>
          <li>
            BOPREAL, organismos e intereses del BCRA a 12 meses vienen en una sola línea: la planilla no los separa. Por eso BOPREAL
            no se distingue de otros pasivos y se resta junto con ellos.
          </li>
          <li>
            Hasta nov-2022 la planilla agrupa el swap con China y los pases en una sola partida. El BCRA no tiene publicadas las
            planillas de {fmtMes(v.planillas_faltantes[0] ?? "2023-07")} a{" "}
            {fmtMes(v.planillas_faltantes[v.planillas_faltantes.length - 1] ?? "2024-05")}: hay un hueco en la serie mensual.
          </li>
          <li>
            Los depósitos del Tesoro en ME tienen serie diaria desde ene-2024; antes, el perímetro consolidado solo se calcula en los
            meses en que la planilla los informa (desde jun-2023).
          </li>
          <li>Compras del Tesoro: no hay serie oficial pública y diaria. No se estima.</li>
          <li>Calendario de vencimientos: 12 meses en tres tramos (lo que publica la planilla), no 18 meses mes a mes.</li>
          <li>
            RIN con metodología FMI: no se publica porque la réplica con datos públicos no alcanza la tolerancia de USD{" "}
            {fmt(reservas.rin_fmi.tolerancia, 0)} M frente a los valores del staff.
          </li>
        </ul>
      </div>
    </Section>
  );
}
