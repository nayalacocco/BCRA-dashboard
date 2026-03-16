"use client";

import { useState, useMemo, useEffect } from "react";
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
  Cell,
} from "recharts";
import { DeltaKPICard } from "@/components/dashboard/DeltaKPICard";
import { BlockSection } from "@/components/dashboard/BlockSection";
import { PendingCard } from "@/components/dashboard/PendingCard";
import {
  PeriodSelector,
  filterByPeriod,
  type Period,
} from "@/components/dashboard/PeriodSelector";
import type { MercadoData, SeriesPoint, MAEQuote, RepoTermPoint } from "@/lib/mae/mercado";

// ---- Helpers ----

function getDelta(data: SeriesPoint[]) {
  if (data.length < 2) return { abs: null, pct: null };
  const last = data[data.length - 1].valor;
  const prev = data[data.length - 2].valor;
  if (prev === 0) return { abs: last - prev, pct: null };
  return { abs: last - prev, pct: ((last - prev) / Math.abs(prev)) * 100 };
}

function lastVal(data: SeriesPoint[]) { return data.at(-1)?.valor ?? undefined; }
function lastDate(data: SeriesPoint[]) { return data.at(-1)?.fecha ?? undefined; }

function findQuote(quotes: MAEQuote[], ticker: string): MAEQuote | undefined {
  return quotes.find((q) => q.ticker === ticker || q.ticker.startsWith(ticker));
}

// ---- Chart helpers ----

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatMonthTick(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

// ---- Market closed badge ----

function MarketClosedBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg w-fit">
      <span className="w-2 h-2 rounded-full bg-slate-400" />
      Mercado cerrado — datos al último cierre
    </div>
  );
}

// ---- Multi-series line chart ----

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
  tickFmt = formatMonthTick,
}: {
  series: MultiSeriesLine[];
  height?: number;
  unit?: string;
  tickFmt?: (v: string) => string;
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
        Sin datos disponibles
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
            tickFormatter={tickFmt}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            interval={tickInterval}
          />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            width={44}
          />
          <Tooltip
            formatter={(value: number, key: string) => {
              const s = series.find((s) => s.key === key);
              return [`${value.toFixed(2)} ${unit}`, s?.label ?? key];
            }}
            labelFormatter={tickFmt}
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Term structure bar chart ----

function CurvaBar({ data, height = 200 }: { data: RepoTermPoint[]; height?: number }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center text-slate-400 text-sm" style={{ height }}>Sin datos</div>;
  }

  const COLORS = ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
        <XAxis
          dataKey="plazo"
          tickFormatter={(v) => `${parseInt(v)}d`}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          width={44}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(v: number, _: string, props) => [
            `${v.toFixed(2)}% TNA`,
            `Plazo ${parseInt(String(props.payload?.plazo))}d`,
          ]}
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 12 }}
        />
        <Bar dataKey="tasa" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Bond price card ----

function BondCard({ quote }: { quote: MAEQuote }) {
  const isUp = quote.variacion > 0;
  const isDown = quote.variacion < 0;
  return (
    <div className="card card-dark p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-400 font-mono">{quote.ticker}</span>
        <span className={`text-xs font-semibold ${isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-slate-400"}`}>
          {quote.variacion > 0 ? "+" : ""}{quote.variacion.toFixed(2)}%
        </span>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
        {quote.precioUltimo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-xs text-slate-400 mt-0.5 truncate">{quote.descripcion}</p>
      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
        <span>{quote.moneda}</span>
        <span>·</span>
        <span>Vol: {(quote.volumenAcumulado / 1e6).toFixed(1)}M</span>
      </div>
    </div>
  );
}

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
      <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ---- Main component ----

const SOVEREIGN_TICKERS = ["GD30", "GD29", "AL30", "AL35", "AE38", "GD35", "GD38", "GD41", "GD46"];

function MercadoContent({ data }: { data: MercadoData }) {
  const [period, setPeriod] = useState<Period>("6m");

  const f = useMemo(
    () => ({
      repoOvernight: filterByPeriod(data.repoOvernight, period),
      repo3d:        filterByPeriod(data.repo3d, period),
      repo7d:        filterByPeriod(data.repo7d, period),
      repoVolume:    filterByPeriod(data.repoVolume, period),
    }),
    [data, period]
  );

  const mep = findQuote(data.forex, "USMEP");
  const usdTransf = findQuote(data.forex, "UST$T");

  const cau1d  = data.cauciones.find((q) => parseInt(q.plazo) <= 1);
  const cau7d  = data.cauciones.find((q) => parseInt(q.plazo) === 7);
  const cau30d = data.cauciones.find((q) => parseInt(q.plazo) >= 28 && parseInt(q.plazo) <= 32);

  const sovereignBonds = data.rentafija
    .filter((q) => SOVEREIGN_TICKERS.some((t) => q.ticker.startsWith(t)))
    .slice(0, 8);
  const lecaps = data.rentafija
    .filter((q) => q.tipoEmision === "LCAP" || q.descripcion.toLowerCase().includes("lecap"))
    .slice(0, 6);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mercado</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Repos MAE · Renta fija · Cauciones · FX de mercado
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.lastRepoDate && (
            <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              Repos al: {data.lastRepoDate}
            </div>
          )}
          {data.marketOpen ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Mercado abierto
            </div>
          ) : (
            <div className="text-xs text-slate-400">Mercado cerrado</div>
          )}
        </div>
      </div>

      {/* Sticky period selector */}
      <div className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Período:
          </span>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ================================================================
          BLOQUE 1: REPOS MAE
      ================================================================ */}
      <BlockSection title="Repos MAE" icon="💴" color="violet">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Tasas promedio ponderadas del mercado de repos del MAE. Referencia de liquidez interbancaria de corto plazo.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <DeltaKPICard
            label="Repo Overnight (1d)"
            value={lastVal(data.repoOvernight)}
            suffix="% TNA"
            date={lastDate(data.repoOvernight)}
            delta={getDelta(data.repoOvernight)}
            color="#7c3aed"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Repo 3 días"
            value={lastVal(data.repo3d)}
            suffix="% TNA"
            date={lastDate(data.repo3d)}
            delta={getDelta(data.repo3d)}
            color="#8b5cf6"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Repo 7 días"
            value={lastVal(data.repo7d)}
            suffix="% TNA"
            date={lastDate(data.repo7d)}
            delta={getDelta(data.repo7d)}
            color="#a78bfa"
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="Volumen Overnight"
            value={lastVal(data.repoVolume)}
            suffix="B ARS"
            date={lastDate(data.repoVolume)}
            delta={getDelta(data.repoVolume)}
            color="#6d28d9"
            positiveIsGood={true}
            decimals={0}
          />
        </div>

        <div className="card card-dark p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Evolución Tasas Repo</h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">% TNA</span>
          </div>
          <MultiSeriesChart
            series={[
              { key: "overnight", label: "Overnight (1d)", data: f.repoOvernight, color: "#7c3aed" },
              { key: "tres_d",    label: "3 días",          data: f.repo3d,        color: "#8b5cf6" },
              { key: "siete_d",   label: "7 días",          data: f.repo7d,        color: "#a78bfa" },
            ]}
            height={280}
            unit="% TNA"
          />
        </div>

        {data.repoLatestCurve.length > 0 && (
          <div className="card card-dark p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Curva de Plazos — Último día</h3>
              <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">% TNA por plazo</span>
            </div>
            <CurvaBar data={data.repoLatestCurve} height={200} />
          </div>
        )}

        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Volumen Diario Overnight</h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">ARS miles de millones</span>
          </div>
          <MultiSeriesChart
            series={[{ key: "vol", label: "Volumen", data: f.repoVolume, color: "#6d28d9" }]}
            height={180}
            unit="B ARS"
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 2: FX DE MERCADO
      ================================================================ */}
      <BlockSection title="FX de Mercado" icon="💵" color="blue">
        {!data.marketOpen && <div className="mb-4"><MarketClosedBadge /></div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {mep ? (
            <DeltaKPICard
              label="USD MEP (Dólar Bolsa)"
              value={mep.precioUltimo}
              prefix="$"
              date={mep.fecha?.slice(0, 10)}
              color="#1c7ed6"
              positiveIsGood={false}
              decimals={2}
            />
          ) : (
            <PendingCard label="USD MEP" description="Dólar bolsa (USMEP) · MAE" source="MAE / Mercado cerrado" />
          )}
          {usdTransf ? (
            <DeltaKPICard
              label="USD Transferencia"
              value={usdTransf.precioUltimo}
              prefix="$"
              date={usdTransf.fecha?.slice(0, 10)}
              color="#1971c2"
              positiveIsGood={false}
              decimals={2}
            />
          ) : (
            <PendingCard label="USD Transferencia" description="USD wire → ARS · MAE" source="MAE / Mercado cerrado" />
          )}
          <PendingCard label="USD CCL" description="Derivado GD30 ARS ÷ GD30 USD" source="Calculado de renta fija" />
          <PendingCard label="Brecha MEP/Oficial" description="(MEP − Oficial) / Oficial" source="Calculado" unit="%" />
        </div>

        {data.forex.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.forex.filter((q) => q.precioUltimo > 0).map((q) => (
              <BondCard key={`${q.ticker}-${q.plazo}`} quote={q} />
            ))}
          </div>
        )}
      </BlockSection>

      {/* ================================================================
          BLOQUE 3: CAUCIONES BURSÁTILES
      ================================================================ */}
      <BlockSection title="Cauciones Bursátiles" icon="📋" color="emerald">
        {!data.marketOpen && <div className="mb-4"><MarketClosedBadge /></div>}
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Tasas de préstamos garantizados con valores (TNA). Referencia de costo de fondeo del mercado de capitales.
        </p>

        {data.cauciones.length > 0 ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {cau1d && (
                <DeltaKPICard label="Caución 1 día" value={cau1d.ultimaTasa} suffix="% TNA" date={cau1d.fecha?.slice(0, 10)} color="#2f9e44" positiveIsGood={false} decimals={2} />
              )}
              {cau7d && (
                <DeltaKPICard label="Caución 7 días" value={cau7d.ultimaTasa} suffix="% TNA" date={cau7d.fecha?.slice(0, 10)} color="#2f9e44" positiveIsGood={false} decimals={2} />
              )}
              {cau30d && (
                <DeltaKPICard label="Caución ~30 días" value={cau30d.ultimaTasa} suffix="% TNA" date={cau30d.fecha?.slice(0, 10)} color="#2f9e44" positiveIsGood={false} decimals={2} />
              )}
            </div>
            <div className="card card-dark p-5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Curva de Cauciones — Hoy</h3>
              <CurvaBar
                data={data.cauciones
                  .filter((q) => q.ultimaTasa > 0)
                  .map((q) => ({ plazo: q.plazo, tasa: q.ultimaTasa, vol: q.volumenAcumulado, ops: 0 }))
                  .sort((a, b) => parseInt(a.plazo) - parseInt(b.plazo))}
                height={200}
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {["1 día", "7 días", "14 días", "30 días"].map((p) => (
              <PendingCard key={p} label={`Caución ${p}`} description="Tasas de cauciones bursátiles · MAE" source="Disponible en horario de mercado" unit="% TNA" />
            ))}
          </div>
        )}
      </BlockSection>

      {/* ================================================================
          BLOQUE 4: RENTA FIJA
      ================================================================ */}
      <BlockSection title="Renta Fija" icon="📊" color="orange">
        {!data.marketOpen && <div className="mb-4"><MarketClosedBadge /></div>}

        {data.rentafija.length > 0 ? (
          <>
            {sovereignBonds.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Bonos Soberanos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  {sovereignBonds.map((q) => (
                    <BondCard key={`${q.ticker}-${q.plazo}`} quote={q} />
                  ))}
                </div>
              </>
            )}
            {lecaps.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">LECAP / Tasa Fija</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                  {lecaps.map((q) => (
                    <BondCard key={`${q.ticker}-${q.plazo}`} quote={q} />
                  ))}
                </div>
              </>
            )}
            {sovereignBonds.length === 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.rentafija.slice(0, 16).map((q) => (
                  <BondCard key={`${q.ticker}-${q.plazo}`} quote={q} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {["GD30", "AL30", "AE38", "GD35", "GD41", "GD46", "LECAP", "LECER"].map((t) => (
              <PendingCard
                key={t}
                label={t}
                description={t.startsWith("GD") || t.startsWith("AL") || t.startsWith("AE") ? "Bono soberano en USD" : "Instrumento de tasa fija"}
                source="Disponible en horario de mercado"
                unit="ARS"
              />
            ))}
          </div>
        )}
      </BlockSection>
    </div>
  );
}

// ---- Root export — fetches data client-side ----

export function MercadoClient() {
  const [data, setData]     = useState<MercadoData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/mae/mercado")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
        } else {
          setData(json.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mercado</h1>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Error al cargar datos del MAE</p>
          <p className="text-xs text-red-600 dark:text-red-500 font-mono break-all">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); fetch("/api/mae/mercado").then(r => r.json()).then(j => { setData(j.data); setError(j.error); }).catch(e => setError(String(e))).finally(() => setLoading(false)); }}
            className="mt-4 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  return <MercadoContent data={data} />;
}
