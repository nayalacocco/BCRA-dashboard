"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { DeltaKPICard } from "@/components/dashboard/DeltaKPICard";
import { BlockSection } from "@/components/dashboard/BlockSection";
import {
  PeriodSelector,
  filterByPeriod,
  type Period,
} from "@/components/dashboard/PeriodSelector";
import type { InflacionData, SeriesPoint } from "@/lib/indec/inflacion";

// ---- Helpers ----

function getDelta(data: SeriesPoint[]) {
  if (data.length < 2) return { abs: null, pct: null };
  const last = data[data.length - 1].valor;
  const prev = data[data.length - 2].valor;
  if (prev === 0) return { abs: last - prev, pct: null };
  return { abs: last - prev, pct: ((last - prev) / Math.abs(prev)) * 100 };
}

function lastVal(data: SeriesPoint[]) {
  return data.at(-1)?.valor ?? undefined;
}

function lastDate(data: SeriesPoint[]) {
  return data.at(-1)?.fecha ?? undefined;
}

/** Compute year-over-year % change from index levels */
function computeInteranual(index: SeriesPoint[]): SeriesPoint[] {
  if (index.length < 13) return [];
  return index.slice(12).map((pt, i) => {
    const base = index[i].valor;
    return { fecha: pt.fecha, valor: base > 0 ? ((pt.valor / base) - 1) * 100 : 0 };
  });
}

// ---- Chart helpers ----

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatMonthTick(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

function fmtPct(v: number, decimals = 1) {
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: decimals })}%`;
}

function fmtNum(v: number) {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(1);
}

// ---- Multi-series line chart (reused from sector-externo pattern) ----

interface MultiSeriesLine {
  key: string;
  label: string;
  data: SeriesPoint[];
  color: string;
}

function MultiSeriesChart({
  series,
  height = 260,
  unit = "%",
  showZeroLine = false,
  formatY = fmtNum,
}: {
  series: MultiSeriesLine[];
  height?: number;
  unit?: string;
  showZeroLine?: boolean;
  formatY?: (v: number) => string;
}) {
  const combined = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const { key, data } of series) {
      for (const { fecha, valor } of data) {
        if (!map.has(fecha)) map.set(fecha, { fecha });
        map.get(fecha)![key] = valor;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.fecha as string).localeCompare(b.fecha as string)
    );
  }, [series]);

  if (combined.length === 0) {
    return (
      <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height }}>
        Sin datos
      </div>
    );
  }

  const tickInterval = Math.max(1, Math.floor(combined.length / 10));

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={combined} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatMonthTick}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            interval={tickInterval}
          />
          <YAxis
            tickFormatter={formatY}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            width={46}
          />
          <Tooltip
            formatter={(value: number, key: string) => {
              const s = series.find((s) => s.key === key);
              return [`${fmtNum(value)} ${unit}`, s?.label ?? key];
            }}
            labelFormatter={formatMonthTick}
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "#94a3b8" }}
          />
          {showZeroLine && <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 3" />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Bar chart for monthly inflation ----

function MonthlyInflaChart({ data, height = 280 }: { data: SeriesPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height }}>
        Sin datos
      </div>
    );
  }

  const tickInterval = Math.max(1, Math.floor(data.length / 10));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
        <XAxis
          dataKey="fecha"
          tickFormatter={formatMonthTick}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          interval={tickInterval}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          width={40}
        />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}%`, "Var. mensual"]}
          labelFormatter={formatMonthTick}
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Bar
          dataKey="valor"
          fill="#e03131"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Stat chip ----

function StatChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
      <span className="text-slate-400">{label}:</span> {value}
    </span>
  );
}

// ---- Main component ----

export function InflacionClient({ data }: { data: InflacionData }) {
  const [period, setPeriod] = useState<Period>("2y");

  // Compute interanual from index level
  const ipcInteranual = useMemo(() => computeInteranual(data.ipcNivel), [data.ipcNivel]);

  const f = useMemo(
    () => ({
      ipcMensual:    filterByPeriod(data.ipcMensual,   period),
      ipcNucleo:     filterByPeriod(data.ipcNucleo,    period),
      ipcRegulados:  filterByPeriod(data.ipcRegulados, period),
      ipcEstacional: filterByPeriod(data.ipcEstacional, period),
      ipcInteranual: filterByPeriod(ipcInteranual,     period),
      remT:          filterByPeriod(data.remT,         period),
      remT1:         filterByPeriod(data.remT1,        period),
      remT6:         filterByPeriod(data.remT6,        period),
      utdt12m:       filterByPeriod(data.utdt12m,      period),
      politicaMon:   filterByPeriod(data.politicaMon,  period),
      badlar:        filterByPeriod(data.badlar,        period),
      call:          filterByPeriod(data.call,          period),
      pf30:          filterByPeriod(data.pf30,          period),
      pf60:          filterByPeriod(data.pf60,          period),
    }),
    [data, ipcInteranual, period]
  );

  // Latest dates
  const ipcDate  = lastDate(data.ipcMensual);
  const remDate  = lastDate(data.remT);
  const tasDate  = lastDate(data.badlar);

  // Tasa real implícita: BADLAR/12 − inflación mensual
  const tasaReal = useMemo(() => {
    const badlarMap = new Map(data.badlar.map((p) => [p.fecha, p.valor]));
    return data.ipcMensual
      .filter((p) => badlarMap.has(p.fecha))
      .map((p) => ({
        fecha: p.fecha,
        valor: parseFloat(((badlarMap.get(p.fecha)! / 12) - p.valor).toFixed(2)),
      }));
  }, [data.badlar, data.ipcMensual]);

  // Last annual projections (single-point value)
  const rem25Last = lastVal(data.remAnual25);
  const rem26Last = lastVal(data.remAnual26);

  return (
    <div className="space-y-10">
      {/* ---- HEADER ---- */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Inflación, Expectativas y Tasas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            IPC INDEC · Expectativas REM &amp; UTDT · Tasas de mercado BCRA
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {ipcDate && (
            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              IPC al: {ipcDate.slice(0, 7)}
            </div>
          )}
          {tasDate && (
            <div className="text-xs text-slate-400 dark:text-slate-600">
              Tasas al: {tasDate.slice(0, 7)}
            </div>
          )}
        </div>
      </div>

      {/* ---- PERIOD SELECTOR ---- */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Período:
        </span>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* ================================================================
          BLOQUE 1: INFLACIÓN
      ================================================================ */}
      <BlockSection title="Inflación (IPC INDEC)" icon="📈" color="orange">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <DeltaKPICard
            label="Inflación Mensual"
            value={lastVal(data.ipcMensual)}
            suffix="%"
            date={lastDate(data.ipcMensual)}
            delta={getDelta(data.ipcMensual)}
            color="#e03131"
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="Inflación Interanual"
            value={lastVal(ipcInteranual)}
            suffix="%"
            date={lastDate(ipcInteranual)}
            delta={getDelta(ipcInteranual)}
            color="#f76707"
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="Núcleo (Core)"
            value={lastVal(data.ipcNucleo)}
            suffix=" (índice)"
            date={lastDate(data.ipcNucleo)}
            delta={getDelta(data.ipcNucleo)}
            color="#c92a2a"
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="Regulados"
            value={lastVal(data.ipcRegulados)}
            suffix=" (índice)"
            date={lastDate(data.ipcRegulados)}
            delta={getDelta(data.ipcRegulados)}
            color="#d9480f"
            positiveIsGood={false}
            decimals={1}
          />
        </div>

        {/* Variación mensual — barra */}
        <div className="card card-dark p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Variación Mensual — Nivel General
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              % mensual
            </span>
          </div>
          <MonthlyInflaChart data={f.ipcMensual} height={280} />
        </div>

        {/* Interanual */}
        <div className="card card-dark p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Inflación Interanual
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              % i.a.
            </span>
          </div>
          <MultiSeriesChart
            series={[{ key: "valor", label: "Variación i.a.", data: f.ipcInteranual, color: "#f76707" }]}
            height={240}
            unit="%"
            showZeroLine={false}
          />
        </div>

        {/* Componentes — núcleo, regulados, estacional */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Componentes del IPC
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              índice Base Dic-2016=100
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
            Evolución comparada — índice más alto = mayor acumulación desde dic-2016
          </p>
          <MultiSeriesChart
            series={[
              { key: "nucleo",     label: "Núcleo (Core)",    data: f.ipcNucleo,     color: "#c92a2a" },
              { key: "regulados",  label: "Regulados",         data: f.ipcRegulados,  color: "#f76707" },
              { key: "estacional", label: "Estacionales",      data: f.ipcEstacional, color: "#fab005" },
            ]}
            height={260}
            unit=""
            showZeroLine={false}
            formatY={(v) => fmtNum(v)}
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 2: EXPECTATIVAS
      ================================================================ */}
      <BlockSection title="Expectativas de Inflación" icon="🔮" color="red">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="REM — Mes Corriente"
            value={lastVal(data.remT)}
            suffix="%"
            date={lastDate(data.remT)}
            delta={getDelta(data.remT)}
            color="#e67700"
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="REM — Próximo Mes"
            value={lastVal(data.remT1)}
            suffix="%"
            date={lastDate(data.remT1)}
            delta={getDelta(data.remT1)}
            color="#d9480f"
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="UTDT — Expectativas 12m"
            value={lastVal(data.utdt12m)}
            suffix="%"
            date={lastDate(data.utdt12m)}
            delta={getDelta(data.utdt12m)}
            color="#c92a2a"
            positiveIsGood={false}
            decimals={1}
          />
        </div>

        {/* Proyecciones anuales */}
        {(rem25Last != null || rem26Last != null) && (
          <div className="flex flex-wrap gap-3 mb-5">
            <p className="text-xs text-slate-500 dark:text-slate-400 w-full font-semibold uppercase tracking-wide">
              Proyecciones interanuales (REM, mediana)
            </p>
            <StatChip
              label="2025"
              value={rem25Last != null ? fmtPct(rem25Last) : null}
            />
            <StatChip
              label="2026"
              value={rem26Last != null ? fmtPct(rem26Last) : null}
            />
          </div>
        )}

        {/* Expectativas vs realización */}
        <div className="card card-dark p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Expectativas REM vs. Realización INDEC
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              % mensual
            </span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "realizado", label: "IPC Mensual (INDEC)", data: f.ipcMensual,   color: "#e03131" },
              { key: "rem_t",     label: "REM — Esperada mes",  data: f.remT,         color: "#e67700" },
              { key: "rem_t1",    label: "REM — Esperada t+1",  data: f.remT1,        color: "#fab005" },
            ]}
            height={260}
            unit="%"
            showZeroLine={false}
          />
        </div>

        {/* Expectativas 12m UTDT */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Expectativas de Inflación a 12 Meses (UTDT Di Tella)
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              %
            </span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "valor", label: "UTDT 12m", data: f.utdt12m, color: "#c92a2a" },
            ]}
            height={220}
            unit="%"
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 3: TASAS DE MERCADO
      ================================================================ */}
      <BlockSection title="Tasas de Mercado" icon="📉" color="blue">
        {remDate && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Fuente: BCRA · Última actualización: {tasDate?.slice(0, 7) ?? "—"}
          </p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Política Monetaria"
            value={lastVal(data.politicaMon)}
            suffix="% n.a."
            date={lastDate(data.politicaMon)}
            delta={getDelta(data.politicaMon)}
            color="#1c7ed6"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="BADLAR Privada"
            value={lastVal(data.badlar)}
            suffix="% n.a."
            date={lastDate(data.badlar)}
            delta={getDelta(data.badlar)}
            color="#1971c2"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Call Interbancario"
            value={lastVal(data.call)}
            suffix="% n.a."
            date={lastDate(data.call)}
            delta={getDelta(data.call)}
            color="#1864ab"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Plazo Fijo 30–59 d"
            value={lastVal(data.pf30)}
            suffix="% n.a."
            date={lastDate(data.pf30)}
            delta={getDelta(data.pf30)}
            color="#2196f3"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Plazo Fijo +60 d"
            value={lastVal(data.pf60)}
            suffix="% n.a."
            date={lastDate(data.pf60)}
            delta={getDelta(data.pf60)}
            color="#4dabf7"
            positiveIsGood={false}
            decimals={2}
          />
        </div>

        {/* Multi-tasas chart */}
        <div className="card card-dark p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Evolución de Tasas de Interés
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              % n.a. mensual
            </span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "politica",  label: "Política Monetaria", data: f.politicaMon, color: "#1c7ed6" },
              { key: "badlar",    label: "BADLAR Privada",      data: f.badlar,      color: "#1971c2" },
              { key: "call",      label: "Call",                data: f.call,        color: "#1864ab" },
              { key: "pf30",      label: "Plazo Fijo 30d",      data: f.pf30,        color: "#2196f3" },
            ]}
            height={280}
            unit="%"
            showZeroLine={false}
            formatY={(v) => `${v.toFixed(0)}%`}
          />
        </div>

        {/* Tasa real implícita */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Tasa Real Implícita (BADLAR − Inflación Mensual)
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              puntos porcentuales
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
            BADLAR mensual/12 − IPC mensual. Positivo = tasa real positiva.
          </p>
          <MultiSeriesChart
            series={[
              {
                key: "real",
                label: "Tasa Real (BADLAR/12 − IPC)",
                data: filterByPeriod(tasaReal, period),
                color: "#339af0",
              },
            ]}
            height={220}
            unit="pp"
            showZeroLine={true}
            formatY={(v) => `${v.toFixed(1)}pp`}
          />
        </div>
      </BlockSection>
    </div>
  );
}
