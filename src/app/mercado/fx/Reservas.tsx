"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Customized,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTooltip, DirectLabels, useChartStyle, yAxisNice, type TipSerie } from "@/components/ds/Chart";
import { Segmented } from "@/components/ds/Controls";
import { fmtFecha } from "@/lib/indec/calendario";
import { fmt, fmtMes } from "@/lib/inflacion/formato";
import { ROTULO, TOTAL_PERIMETRO, componentesDe, waterfall, type Linea, type Perimetro } from "@/lib/fx/reservas";
import type { FilaDiaria, FilaMensual, ReservasData } from "@/lib/fx/types";

export const usd = (v: number | null | undefined) => (v == null ? "sin dato" : `${v < 0 ? "−" : ""}${fmt(Math.abs(v), 0)}`);
const MARGEN = { top: 8, right: 118, left: 0, bottom: 4 };
const FUENTE = "Fuente: BCRA (API v4 y planilla de Reservas Internacionales y Liquidez en ME, NEDD-FMI), cálculo propio.";

export type Vista = "diaria" | "mensual";

/** Punto seleccionable de la serie: fecha + insumos del waterfall. */
export interface Seleccion {
  f: string;
  vista: Vista;
}

export function filaDe(data: ReservasData, sel: Seleccion): { fila: FilaDiaria | FilaMensual; comp: FilaMensual } | null {
  if (sel.vista === "mensual") {
    const m = data.mensual.find((x) => x.f === sel.f);
    return m ? { fila: m, comp: m } : null;
  }
  const d = data.diaria.find((x) => x.f === sel.f);
  if (!d) return null;
  const c = componentesDe(d, data.mensual);
  return c ? { fila: d, comp: c } : null;
}

// ---------------------------------------------------------------------------
// Serie histórica
// ---------------------------------------------------------------------------

export function SerieReservas({
  data,
  perimetro,
  vista,
  onVista,
  onSelect,
}: {
  data: ReservasData;
  perimetro: Perimetro;
  vista: Vista;
  onVista: (v: Vista) => void;
  onSelect: (s: Seleccion) => void;
}) {
  const { t, grid, xAxis, yAxis, line, cursorLine, zeroLine } = useChartStyle();
  const filas = (vista === "diaria" ? data.diaria : data.mensual) as (FilaDiaria | FilaMensual)[];
  const rows = filas.map((r) => ({ f: r.f, brutas: r.brutas, netas_a: r.netas_a, super_a: r.super_a, netas_b: r.netas_b }));
  const series: TipSerie[] =
    perimetro === "A"
      ? [
          { key: "brutas", name: "Brutas", color: t.neutralBar, fmt: usd },
          { key: "netas_a", name: "Netas BCRA", color: t.s1, fmt: usd },
          { key: "super_a", name: "Super netas BCRA", color: t.s3, fmt: usd },
        ]
      : [
          { key: "brutas", name: "Brutas", color: t.neutralBar, fmt: usd },
          { key: "netas_a", name: "Netas BCRA", color: t.s1, fmt: usd },
          { key: "netas_b", name: "Netas consolidadas", color: t.s2, fmt: usd },
        ];
  const vals = rows.flatMap((r) => series.map((s) => r[s.key as keyof typeof r] as number | null));
  const ax = yAxisNice(vals, 5000, [0]);
  const ult = rows[rows.length - 1];
  const huecos = data.validacion.planillas_faltantes;
  const fmtX = (f: string) => (vista === "diaria" ? fmtMes(f) : f.slice(0, 4));
  const tablaRows = [...rows].reverse().map((r) => [
    vista === "diaria" ? fmtFecha(r.f) : fmtMes(r.f),
    usd(r.brutas),
    usd(r.netas_a),
    usd(perimetro === "A" ? r.super_a : r.netas_b),
  ]);
  return (
    <ChartFrame
      title={`Reservas: brutas y netas — perímetro ${perimetro === "A" ? "BCRA" : "sector público consolidado"} (USD M)`}
      sub="Hacé clic en cualquier punto para ver la composición a esa fecha."
      legend={series.map((s) => ({ label: s.name, color: s.color }))}
      right={
        <Segmented<Vista>
          value={vista}
          onChange={onVista}
          ariaLabel="Frecuencia"
          options={[
            { key: "diaria", label: "Diaria", title: "Desde jul-2024: brutas, encajes y depósitos del Tesoro diarios" },
            { key: "mensual", label: "Mensual", title: "Fin de mes, desde 2016 (planilla NEDD-FMI)" },
          ]}
        />
      }
      table={{ columns: ["Fecha", "Brutas", "Netas BCRA", perimetro === "A" ? "Super netas" : "Netas consolidadas"], rows: tablaRows }}
      source={FUENTE}
      lastData={vista === "diaria" ? fmtFecha(ult.f) : fmtMes(ult.f)}
      howTo={
        <>
          <p>
            Diaria: brutas, encajes y depósitos del Tesoro del día, combinados con los componentes mensuales (swaps, pases,
            vencimientos ≤ 12 meses) de la última planilla publicada a esa fecha.
          </p>
          {vista === "mensual" && huecos.length > 0 && (
            <p>
              El BCRA no tiene publicadas las planillas de {fmtMes(huecos[0])} a {fmtMes(huecos[huecos.length - 1])}: la serie
              mensual tiene un hueco en ese tramo.
            </p>
          )}
        </>
      }
    >
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={MARGEN}
            onClick={(e: { activeLabel?: string } | null) => {
              if (e?.activeLabel) onSelect({ f: String(e.activeLabel), vista });
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid {...grid} />
            <XAxis dataKey="f" {...xAxis} tickFormatter={fmtX} minTickGap={40} />
            <YAxis {...yAxis} domain={ax.domain} ticks={ax.ticks} tickFormatter={(v) => fmt(v / 1000, 0) + " mil"} />
            <ReferenceLine y={0} {...zeroLine} />
            <Tooltip
              cursor={cursorLine}
              content={<ChartTooltip series={series} labelFormat={(l) => (vista === "diaria" ? fmtFecha(l) : fmtMes(l))} />}
            />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} {...line} strokeWidth={s.key === "brutas" ? 1.5 : 2} connectNulls={false} />
            ))}
            <Customized
              component={
                <DirectLabels t={t} items={series.map((s) => ({ value: ult[s.key as keyof typeof ult] as number | null, name: s.name, color: s.color, fmt: usd, muted: s.key === "brutas" }))} />
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

function WaterfallChart({ lineas }: { lineas: Linea[] }) {
  const { t, grid, xAxis, yAxis, cursorBar } = useChartStyle();
  let acum = 0;
  const rows = lineas.map((l) => {
    let lo: number;
    let hi: number;
    if (l.tipo === "base") {
      acum = l.monto;
      lo = 0;
      hi = l.monto;
    } else if (l.tipo === "resta") {
      hi = acum;
      acum -= l.monto;
      lo = acum;
    } else {
      lo = Math.min(0, l.monto);
      hi = Math.max(0, l.monto);
    }
    return { id: l.id, nombre: ROTULO[l.id]?.corto ?? l.id, rango: [lo, hi] as [number, number], monto: l.monto, tipo: l.tipo };
  });
  const ax = yAxisNice(rows.flatMap((r) => r.rango), 5000, [0]);
  if (Math.min(...rows.flatMap((r) => r.rango)) >= 0) {
    ax.domain = [0, ax.domain[1]];
    ax.ticks = ax.ticks.filter((x) => x >= 0);
  }
  const color = (tipo: string) => (tipo === "resta" ? t.neutralBar : t.s1);
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="nombre" {...xAxis} interval={0} tick={{ ...xAxis.tick, fontSize: 10.5 }} height={28} />
          <YAxis {...yAxis} domain={ax.domain} ticks={ax.ticks} tickFormatter={(v) => fmt(v / 1000, 0) + " mil"} />
          <ReferenceLine y={0} stroke={t.text2} />
          <Tooltip
            cursor={cursorBar}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <div className="bg-ds-surface border border-ds-rule-strong rounded-[5px] px-2.5 py-2 text-[12px] text-ds-text">
                  <div className="text-ds-muted">{ROTULO[r.id]?.largo}</div>
                  <b className="tnum">
                    {r.tipo === "resta" ? "−" : ""}USD {usd(r.monto)} M
                  </b>
                </div>
              );
            }}
          />
          <Bar dataKey="rango" isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.id} fill={color(r.tipo)} />
            ))}
            <LabelList
              dataKey="monto"
              position="top"
              formatter={(v: number) => fmt(v / 1000, 1)}
              style={{ fontSize: 10.5, fill: t.text2, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel lateral
// ---------------------------------------------------------------------------

const MAX_DIAS = { diaria: 7, mensual: 75 };

function dias(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function PanelReservas({
  data,
  sel,
  perimetro,
  onPerimetro,
  onClose,
  hoy,
}: {
  data: ReservasData;
  sel: Seleccion;
  perimetro: Perimetro;
  onPerimetro: (p: Perimetro) => void;
  onClose: () => void;
  hoy: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const base = filaDe(data, sel);
  const lineas = useMemo(() => (base ? waterfall(base.fila, base.comp, perimetro) : null), [base, perimetro]);
  const esUltimo = sel.vista === "diaria" && sel.f === data.ultimo.f;
  const total = lineas?.find((l) => l.id === TOTAL_PERIMETRO[perimetro]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle de reservas netas">
      <button className="absolute inset-0 bg-black/30" aria-label="Cerrar" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className="relative h-full w-full max-w-[640px] bg-ds-bg border-l border-ds-rule-strong overflow-y-auto px-6 py-5 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] uppercase tracking-[0.16em] font-semibold text-ds-text-2">Reservas netas</p>
            <h3 className="font-serif font-semibold text-[22px] text-ds-head mt-1">
              {perimetro === "A" ? "Perímetro BCRA" : "Sector público consolidado"}
            </h3>
            <p className="text-ds-text-2 text-[13px]">
              Al {sel.vista === "diaria" ? fmtFecha(sel.f) : `cierre de ${fmtMes(sel.f)}`}
              {total && (
                <>
                  {" "}
                  · <b className="tnum text-ds-text">USD {usd(total.monto)} M</b>
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-ds-muted hover:text-ds-text text-[13px] border border-ds-rule-strong rounded px-2 py-0.5">
            Cerrar
          </button>
        </div>
        <div className="mt-3">
          <Segmented<Perimetro>
            value={perimetro}
            onChange={onPerimetro}
            ariaLabel="Perímetro"
            options={[
              { key: "A", label: "BCRA" },
              { key: "B", label: "Consolidado BCRA + Tesoro" },
            ]}
          />
        </div>

        {!lineas ? (
          <p className="mt-6 text-[13px] text-ds-text-2">
            Sin dato: a esta fecha no se puede calcular el perímetro {perimetro === "A" ? "BCRA" : "consolidado"} (falta el dato de
            depósitos del Tesoro en ME, necesario para no restarlos dos veces).
          </p>
        ) : (
          <>
            <div className="mt-4 border-t border-ds-head pt-3">
              <WaterfallChart lineas={lineas} />
              <p className="text-[11.5px] text-ds-muted">USD miles de millones. Barras grises: deducciones; azules: brutas y subtotales.</p>
            </div>
            <table className="w-full border-collapse mt-4 text-[12.5px]">
              <thead>
                <tr>
                  {["Componente", "USD M", "Dato al"].map((c, i) => (
                    <th key={c} className={`smallcaps text-ds-text-2 px-1.5 py-1.5 border-b border-ds-rule-strong ${i ? "text-right" : "text-left"}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const meta = data.meta[l.id];
                  const frec = meta?.frecuencia as "diaria" | "mensual" | null | undefined;
                  const atraso = esUltimo && frec ? dias(l.fecha, hoy) > MAX_DIAS[frec] : false;
                  const esTotal = l.tipo === "total";
                  return (
                    <tr key={l.id} className={esTotal ? "font-semibold" : ""}>
                      <td className={`px-1.5 py-1.5 border-b border-ds-rule align-top ${esTotal ? "text-ds-head" : ""}`}>
                        <span>
                          {l.tipo === "resta" ? "− " : esTotal ? "= " : ""}
                          {ROTULO[l.id]?.largo ?? l.id}
                        </span>
                        {meta && !esTotal && (
                          <span className="block font-normal text-[11.5px] text-ds-muted mt-0.5">
                            {meta.criterio} <span className="italic">{meta.fuente}.</span>
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 border-b border-ds-rule text-right tnum align-top">{usd(l.monto)}</td>
                      <td className="px-1.5 py-1.5 border-b border-ds-rule text-right tnum align-top whitespace-nowrap">
                        {fmtFecha(l.fecha)}
                        {atraso && <span className="block text-[11px] font-semibold text-ds-text-2">desactualizado</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <div className="mt-5 space-y-2.5 text-[13px] text-ds-text-2 leading-relaxed">
          <p>
            <b className="text-ds-text">Qué mide cada perímetro.</b> El perímetro BCRA resta a las brutas lo que suma a las brutas
            y no es del BCRA o vence en 12 meses: encajes, swaps (la línea completa con China; otros swaps solo si se activaron),
            pases, BOPREAL y otros pasivos de corto plazo, y los depósitos del Tesoro. La deuda con el FMI no se resta: es del
            Tesoro, y lo desembolsado que sigue depositado ya sale al restar los depósitos del Tesoro.
          </p>
          <p>
            El consolidado (BCRA + Tesoro) parte de las netas BCRA y resta todos los vencimientos en ME de 12 meses, del BCRA y
            del Tesoro (FMI, organismos, bonos, repos). Los depósitos del Tesoro no se restan: dentro del consolidado son una
            operación interna, y restarlos además de la deuda contaría dos veces el mismo dinero.
          </p>
          <p>
            <b className="text-ds-text">Por qué difieren.</b> El BCRA puede tener reservas netas positivas mientras el
            consolidado es negativo: los servicios de deuda del Tesoro a 12 meses son mayores que el colchón propio del BCRA.
          </p>
        </div>

        <RinFmi data={data} />
      </div>
    </div>
  );
}

function RinFmi({ data }: { data: ReservasData }) {
  const r = data.rin_fmi;
  const maxErr = Math.max(...r.anclas.filter((a) => a.error != null).map((a) => Math.abs(a.error as number)));
  return (
    <div className="mt-6 border-t border-ds-head pt-3">
      <p className="font-semibold text-[14px] text-ds-text">RIN con la metodología del programa con el FMI</p>
      {r.publicable ? (
        <p className="text-[13px] text-ds-text-2 mt-1">
          Réplica validada contra el staff (error máximo USD {usd(maxErr)} M): USD {usd(data.ultimo.rin_fmi)} M al{" "}
          {fmtFecha(data.ultimo.f)}.
        </p>
      ) : (
        <p className="text-[13px] text-ds-text-2 mt-1">
          <b className="text-ds-text">No se publica.</b> Con datos públicos no se reproduce el número del staff dentro de USD{" "}
          {usd(r.tolerancia)} M: la planilla no separa los pases por plazo original ni informa SEDESA y ALADI. Error máximo de
          la réplica: USD {usd(maxErr)} M.
        </p>
      )}
      <table className="w-full border-collapse mt-2 text-[12px]">
        <thead>
          <tr>
            {["Fecha", "Staff FMI", "Réplica", "Diferencia"].map((c, i) => (
              <th key={c} className={`smallcaps text-ds-text-2 px-1.5 py-1 border-b border-ds-rule-strong ${i ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.anclas.map((a) => (
            <tr key={a.fecha}>
              <td className="px-1.5 py-1 border-b border-ds-rule">{fmtFecha(a.fecha)}</td>
              <td className="px-1.5 py-1 border-b border-ds-rule text-right tnum">{usd(a.rin)}</td>
              <td className="px-1.5 py-1 border-b border-ds-rule text-right tnum">{usd(a.replica)}</td>
              <td className="px-1.5 py-1 border-b border-ds-rule text-right tnum">{usd(a.error)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11.5px] text-ds-muted mt-1.5">{r.definicion} Valores del staff: IMF Country Reports 25/219 y 26/1.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendario de vencimientos ≤ 12 meses
// ---------------------------------------------------------------------------

export function CalendarioVencimientos({ data }: { data: ReservasData }) {
  const { t, grid, xAxis, yAxis, cursorBar } = useChartStyle();
  const c = data.calendario;
  const colores: Record<string, { color: string; op: number }> = {
    bcra_pases: { color: t.s1, op: 1 },
    bcra_otros: { color: t.s1, op: 0.6 },
    bcra_intereses: { color: t.s1, op: 0.32 },
    gob_capital: { color: t.s2, op: 1 },
    gob_intereses: { color: t.s2, op: 0.5 },
  };
  const rows = c.tramos.map((tr, i) => {
    const r: Record<string, number | string | null> = { tramo: tr };
    for (const s of c.series) r[s.id] = s.valores[i];
    return r;
  });
  const totales = c.tramos.map((_, i) => c.series.reduce((s, x) => s + (x.valores[i] ?? 0), 0));
  const tesoro12 = c.series.filter((s) => s.deudor === "Tesoro").reduce((s, x) => s + x.valores.reduce<number>((a, b) => a + (b ?? 0), 0), 0);
  const bcra12 = c.series.filter((s) => s.deudor === "BCRA").reduce((s, x) => s + x.valores.reduce<number>((a, b) => a + (b ?? 0), 0), 0);
  const ax = yAxisNice(totales.map((_, i) => Math.max(
    c.series.filter((s) => s.deudor === "BCRA").reduce((a, s) => a + (s.valores[i] ?? 0), 0),
    c.series.filter((s) => s.deudor === "Tesoro").reduce((a, s) => a + (s.valores[i] ?? 0), 0)
  )), 1000, [0]);
  ax.domain = [0, ax.domain[1]];
  ax.ticks = ax.ticks.filter((x) => x >= 0);
  const series: TipSerie[] = c.series.map((s) => ({ key: s.id, name: `${s.deudor}: ${s.concepto}`, color: colores[s.id]?.color ?? t.neutralBar, fmt: usd }));
  return (
    <ChartFrame
      title="Vencimientos en moneda extranjera de los próximos 12 meses, por deudor (USD M)"
      sub={`En 12 meses vencen USD ${usd(tesoro12)} M del Tesoro y USD ${usd(bcra12)} M del BCRA (sin contar la renovación del swap con China).`}
      legend={c.series.map((s) => ({ label: `${s.deudor}: ${s.concepto}`, color: colores[s.id]?.color ?? t.neutralBar, kind: "block" as const }))}
      table={{
        columns: ["Deudor y concepto", ...c.tramos],
        rows: [
          ...c.series.map((s) => [`${s.deudor}: ${s.concepto}`, ...s.valores.map((v) => usd(v))]),
          ["BCRA: swap con China (renovable)", ...c.swaps.map((v) => usd(v))],
        ],
      }}
      source="Fuente: BCRA, planilla de Reservas Internacionales y Liquidez en ME (NEDD-FMI), sección II."
      lastData={fmtFecha(c.planilla)}
      howTo={
        <>
          <p>{c.nota}</p>
          <p>
            Capital del BCRA a ≤ 1 mes: se excluyen los depósitos (encajes y Tesoro), que la planilla registra como pasivos a la
            vista pero no son vencimientos. El horizonte de 18 meses del pedido original no está disponible en fuentes públicas
            automatizables con apertura mensual: se muestra el máximo publicado (12 meses, en tres tramos).
          </p>
        </>
      }
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={6}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="tramo" {...xAxis} />
            <YAxis {...yAxis} domain={ax.domain} ticks={ax.ticks} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip cursor={cursorBar} content={<ChartTooltip series={series} />} />
            {c.series.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId={s.deudor}
                fill={colores[s.id]?.color}
                fillOpacity={colores[s.id]?.op}
                isAnimationActive={false}
                maxBarSize={56}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
