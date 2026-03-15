"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { DeltaKPICard } from "@/components/dashboard/DeltaKPICard";
import { BlockSection } from "@/components/dashboard/BlockSection";
import { HistoricalChart } from "@/components/charts/HistoricalChart";
import {
  PeriodSelector,
  filterByPeriod,
  type Period,
} from "@/components/dashboard/PeriodSelector";
import type { SectorExternoData, SeriesPoint } from "@/lib/indec/sector-externo";

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

// ---- Multi-series line chart ----

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatMonthTick(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

function formatYTick(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

interface MultiSeriesLine {
  key: string;
  label: string;
  data: SeriesPoint[];
  color: string;
}

function MultiSeriesChart({
  series,
  height = 260,
  unit = "M USD",
  showZeroLine = false,
}: {
  series: MultiSeriesLine[];
  height?: number;
  unit?: string;
  showZeroLine?: boolean;
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

  // Show ticks every ~12 points for monthly data
  const tickInterval = Math.max(1, Math.floor(combined.length / 10));

  return (
    <div>
      {/* Legend */}
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
            tickFormatter={formatYTick}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            width={44}
          />
          <Tooltip
            formatter={(value: number, key: string) => {
              const s = series.find((s) => s.key === key);
              return [
                `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${unit}`,
                s?.label ?? key,
              ];
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
          {showZeroLine && (
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 3" />
          )}
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

// ---- Stat chip (coverage / share) ----

function ShareChip({ label, share }: { label: string; share: number | null }) {
  if (share == null || isNaN(share)) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
      {share.toFixed(1)}% {label}
    </span>
  );
}

// ---- Main component ----

export function SectorExternoClient({ data }: { data: SectorExternoData }) {
  const [period, setPeriod] = useState<Period>("2y");

  const f = useMemo(
    () => ({
      expoTotal:        filterByPeriod(data.expoTotal, period),
      impoTotal:        filterByPeriod(data.impoTotal, period),
      saldoComercial:   filterByPeriod(data.saldoComercial, period),
      expoPP:           filterByPeriod(data.expoPP, period),
      expoMOA:          filterByPeriod(data.expoMOA, period),
      expoMOI:          filterByPeriod(data.expoMOI, period),
      impoBienesCap:    filterByPeriod(data.impoBienesCap, period),
      impoCombustibles: filterByPeriod(data.impoCombustibles, period),
      ctaCteTotal:      filterByPeriod(data.ctaCteTotal, period),
      bienes:           filterByPeriod(data.bienes, period),
      servicios:        filterByPeriod(data.servicios, period),
    }),
    [data, period]
  );

  // Export share calculations (vs total)
  const expoLast = lastVal(data.expoTotal);
  const sharePP  = expoLast ? ((lastVal(data.expoPP)  ?? 0) / expoLast) * 100 : null;
  const shareMOA = expoLast ? ((lastVal(data.expoMOA) ?? 0) / expoLast) * 100 : null;
  const shareMOI = expoLast ? ((lastVal(data.expoMOI) ?? 0) / expoLast) * 100 : null;

  // Import share calculations
  const impoLast = lastVal(data.impoTotal);
  const shareBC  = impoLast ? ((lastVal(data.impoBienesCap)    ?? 0) / impoLast) * 100 : null;
  const shareComb = impoLast ? ((lastVal(data.impoCombustibles) ?? 0) / impoLast) * 100 : null;

  // Date tags
  const icaDate = lastDate(data.expoTotal);
  const balDate = lastDate(data.bienes);

  return (
    <div className="space-y-10">
      {/* ---- HEADER ---- */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Sector Externo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Balanza comercial, exportaciones e importaciones · INDEC &amp; BCRA
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {icaDate && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ICA al: {icaDate.slice(0, 7)}
            </div>
          )}
          {balDate && (
            <div className="text-xs text-slate-400 dark:text-slate-600">
              Balance cambiario al: {balDate.slice(0, 7)}
            </div>
          )}
        </div>
      </div>

      {/* ---- PERIOD SELECTOR (sticky) ---- */}
      <div className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Período:
          </span>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ================================================================
          BLOQUE 1: BALANZA COMERCIAL
      ================================================================ */}
      <BlockSection title="Balanza Comercial (ICA)" icon="⚖️" color="emerald">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Saldo Comercial"
            value={lastVal(data.saldoComercial)}
            suffix="M USD"
            date={lastDate(data.saldoComercial)}
            delta={getDelta(data.saldoComercial)}
            color="#3b5bdb"
            positiveIsGood={true}
            showSign={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Exportaciones Totales"
            value={lastVal(data.expoTotal)}
            suffix="M USD"
            date={lastDate(data.expoTotal)}
            delta={getDelta(data.expoTotal)}
            color="#2f9e44"
            positiveIsGood={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Importaciones Totales"
            value={lastVal(data.impoTotal)}
            suffix="M USD"
            date={lastDate(data.impoTotal)}
            delta={getDelta(data.impoTotal)}
            color="#e03131"
            positiveIsGood={false}
            decimals={0}
          />
        </div>

        {/* Expo vs Impo chart */}
        <div className="card card-dark p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Exportaciones vs. Importaciones
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "expo", label: "Exportaciones", data: f.expoTotal, color: "#2f9e44" },
              { key: "impo", label: "Importaciones", data: f.impoTotal, color: "#e03131" },
            ]}
            height={240}
            unit="M USD"
          />
        </div>

        {/* Saldo chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Saldo Comercial
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <MultiSeriesChart
            series={[{ key: "saldo", label: "Saldo", data: f.saldoComercial, color: "#3b5bdb" }]}
            height={180}
            unit="M USD"
            showZeroLine
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 2: COMPOSICIÓN EXPORTACIONES
      ================================================================ */}
      <BlockSection title="Composición Exportaciones" icon="📦" color="green">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Productos Primarios (PP)"
            value={lastVal(data.expoPP)}
            suffix="M USD"
            date={lastDate(data.expoPP)}
            delta={getDelta(data.expoPP)}
            color="#2f9e44"
            positiveIsGood={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Manuf. Agropecuarias (MOA)"
            value={lastVal(data.expoMOA)}
            suffix="M USD"
            date={lastDate(data.expoMOA)}
            delta={getDelta(data.expoMOA)}
            color="#087f5b"
            positiveIsGood={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Manuf. Industriales (MOI)"
            value={lastVal(data.expoMOI)}
            suffix="M USD"
            date={lastDate(data.expoMOI)}
            delta={getDelta(data.expoMOI)}
            color="#1971c2"
            positiveIsGood={true}
            decimals={0}
          />
        </div>

        {/* Share chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          <ShareChip label="de expo total" share={sharePP} />
          <ShareChip label="de expo total" share={shareMOA} />
          <ShareChip label="de expo total" share={shareMOI} />
        </div>

        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Expo por Categoría
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "pp",  label: "Prod. Primarios (PP)",   data: f.expoPP,  color: "#2f9e44" },
              { key: "moa", label: "Manuf. Agrop. (MOA)",    data: f.expoMOA, color: "#087f5b" },
              { key: "moi", label: "Manuf. Industrial (MOI)", data: f.expoMOI, color: "#1971c2" },
            ]}
            height={240}
            unit="M USD"
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 3: COMPOSICIÓN IMPORTACIONES
      ================================================================ */}
      <BlockSection title="Composición Importaciones" icon="🚢" color="red">
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-5">
          <DeltaKPICard
            label="Bienes de Capital + Partes"
            value={lastVal(data.impoBienesCap)}
            suffix="M USD"
            date={lastDate(data.impoBienesCap)}
            delta={getDelta(data.impoBienesCap)}
            color="#f03e3e"
            positiveIsGood={null as unknown as boolean}
            decimals={0}
          />
          <DeltaKPICard
            label="Combustibles y Lubricantes"
            value={lastVal(data.impoCombustibles)}
            suffix="M USD"
            date={lastDate(data.impoCombustibles)}
            delta={getDelta(data.impoCombustibles)}
            color="#c92a2a"
            positiveIsGood={false}
            decimals={0}
          />
        </div>

        {/* Share chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          <ShareChip label="de impo total" share={shareBC} />
          <ShareChip label="de impo total" share={shareComb} />
        </div>

        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Impo por Uso Económico
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "bc",   label: "Bienes de Capital + Partes", data: f.impoBienesCap,    color: "#f03e3e" },
              { key: "comb", label: "Combustibles",               data: f.impoCombustibles, color: "#c92a2a" },
            ]}
            height={220}
            unit="M USD"
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 4: BALANCE CAMBIARIO (BCRA)
      ================================================================ */}
      <BlockSection title="Balance Cambiario" icon="💱" color="blue">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Flujos de divisas por el mercado cambiario (MULC). Difiere del ICA por timing de pagos y cobros.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Bienes (liquidaciones netas)"
            value={lastVal(data.bienes)}
            suffix="M USD"
            date={lastDate(data.bienes)}
            delta={getDelta(data.bienes)}
            color="#3b5bdb"
            positiveIsGood={true}
            showSign={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Servicios (neto)"
            value={lastVal(data.servicios)}
            suffix="M USD"
            date={lastDate(data.servicios)}
            delta={getDelta(data.servicios)}
            color="#7048e8"
            positiveIsGood={true}
            showSign={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Cta. Corriente Cambiaria"
            value={lastVal(data.ctaCteTotal)}
            suffix="M USD"
            date={lastDate(data.ctaCteTotal)}
            delta={getDelta(data.ctaCteTotal)}
            color="#0c8599"
            positiveIsGood={true}
            showSign={true}
            decimals={0}
          />
        </div>

        <div className="card card-dark p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Bienes y Servicios Cambiarios
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "bienes",    label: "Bienes (neto)",   data: f.bienes,    color: "#3b5bdb" },
              { key: "servicios", label: "Servicios (neto)", data: f.servicios, color: "#7048e8" },
            ]}
            height={220}
            unit="M USD"
            showZeroLine
          />
        </div>

        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Cuenta Corriente Cambiaria
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">M USD</span>
          </div>
          <HistoricalChart
            data={f.ctaCteTotal}
            color="#0c8599"
            unit="M USD"
            height={200}
          />
        </div>
      </BlockSection>

      {/* Source note */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Fuentes:</span>{" "}
          Intercambio Comercial Argentino (ICA) — INDEC vía datos.gob.ar ·
          Balance Cambiario — BCRA vía datos.gob.ar.
          Datos mensuales con caché de 1h.
        </p>
      </div>
    </div>
  );
}
