"use client";

/**
 * MercadoClient — market data dashboard.
 *
 * Data sources:
 * - FX rates:  dolarapi.com (free, public, CORS-enabled)
 * - Tasas:     BCRA API v4 (already integrated, server-side proxy)
 * - MAE data:  blocked by MAE WAF (repos, cauciones, renta fija shown as pending)
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
import { PendingCard } from "@/components/dashboard/PendingCard";
import {
  PeriodSelector,
  filterByPeriod,
  type Period,
} from "@/components/dashboard/PeriodSelector";
import { fetchDolarSnapshot, brecha } from "@/lib/dolar/client";
import type { DolarSnapshot } from "@/lib/dolar/client";
import type { BymaData, BymaQuote } from "@/lib/byma/client";

// ---- Types for BCRA tasas (fetched from our proxy) ----

interface SeriesPoint { fecha: string; valor: number; }

interface TasasData {
  badlar:       SeriesPoint[];
  call:         SeriesPoint[];
  politicaMon:  SeriesPoint[];
  pf30:         SeriesPoint[];
}

// ---- BCRA tasas fetcher — each series fetched separately ----
// Uses sort=desc&limit=240 (20 years of monthly data) then reverses for chronological order.
// Fetching separately avoids column-alignment issues when series have different start dates.
// (e.g. Política Monetaria only exists from 2019 — would be invisible in asc limit=200 window)

async function fetchOneSeries(id: string, limit = 240): Promise<SeriesPoint[]> {
  const url = `https://apis.datos.gob.ar/series/api/series/?ids=${id}&limit=${limit}&sort=desc&format=json`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`datos.gob.ar ${res.status} for ${id}`);
  const json = await res.json();
  const rows: [string, number | null][] = json.data ?? [];
  const pts: SeriesPoint[] = [];
  for (const [fecha, val] of rows) {
    if (val != null) pts.push({ fecha, valor: val });
  }
  pts.reverse(); // restore chronological order for charts
  return pts;
}

async function fetchTasas(): Promise<TasasData> {
  const [badlarRes, callRes, pmRes, pf30Res] = await Promise.allSettled([
    fetchOneSeries("89.1_TIB_0_0_20"),         // BADLAR privada
    fetchOneSeries("89.1_TIC_0_0_18"),          // Call interbancario
    fetchOneSeries("89.1_IR_BCRARIA_0_M_34"),   // Política Monetaria (desde 2019)
    fetchOneSeries("89.1_TIPF35D_0_0_35"),      // PF 30-59 días
  ]);

  return {
    badlar:      badlarRes.status  === "fulfilled" ? badlarRes.value  : [],
    call:        callRes.status    === "fulfilled" ? callRes.value    : [],
    politicaMon: pmRes.status      === "fulfilled" ? pmRes.value      : [],
    pf30:        pf30Res.status    === "fulfilled" ? pf30Res.value    : [],
  };
}

// ---- Helpers ----

function lastVal(s: SeriesPoint[])  { return s.at(-1)?.valor ?? undefined; }
function lastDate(s: SeriesPoint[]) { return s.at(-1)?.fecha ?? undefined; }

function getDelta(s: SeriesPoint[]) {
  if (s.length < 2) return { abs: null, pct: null };
  const last = s[s.length - 1].valor;
  const prev = s[s.length - 2].valor;
  if (prev === 0) return { abs: last - prev, pct: null };
  return { abs: last - prev, pct: ((last - prev) / Math.abs(prev)) * 100 };
}

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

// ---- FX Rate card ----

function fmtPeso(v: number | null) {
  if (v == null) return "—";
  // Use compact format without decimals for large numbers (≥1000)
  if (v >= 1000) return `$${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

function FxCard({
  label,
  rate,
  brechaVsOficial,
}: {
  label: string;
  rate: { compra: number | null; venta: number | null; fechaActualizacion: string } | null;
  brechaVsOficial?: number | null;
}) {
  if (!rate) return <PendingCard label={label} description="Sin datos" source="dolarapi.com" />;

  const hora = new Date(rate.fechaActualizacion).toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="card card-dark p-4 flex flex-col gap-2">
      {/* Header row: label + brecha badge */}
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
        {brechaVsOficial != null && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
            brechaVsOficial > 20 ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
            : brechaVsOficial > 5  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
            : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
          }`}>
            +{brechaVsOficial.toFixed(1)}%
          </span>
        )}
      </div>
      {/* Compra / Venta stacked */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Compra</p>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {fmtPeso(rate.compra)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Venta</p>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {fmtPeso(rate.venta)}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">{hora}</p>
    </div>
  );
}

// ---- Brecha bar chart ----

function BrechaChart({ fx }: { fx: DolarSnapshot }) {
  const oficial = fx.oficial;
  const items = [
    { label: "MEP",  brecha: brecha(fx.mep,       oficial), color: "#1c7ed6" },
    { label: "CCL",  brecha: brecha(fx.ccl,        oficial), color: "#339af0" },
    { label: "Blue", brecha: brecha(fx.blue,       oficial), color: "#74c0fc" },
    { label: "Cripto", brecha: brecha(fx.cripto,   oficial), color: "#a5d8ff" },
  ].filter((d) => d.brecha != null);

  if (items.length === 0) return null;

  return (
    <div className="card card-dark p-5 mt-5">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Brecha vs Oficial</h3>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={items} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <YAxis
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            width={44}
            domain={[0, "auto"]}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)}%`, "Brecha vs Oficial"]}
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="#475569" />
          <Bar dataKey="brecha" fill="#1c7ed6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Tasas chart ----

function TasasChart({ data, period }: { data: TasasData; period: Period }) {
  const series = useMemo(() => ({
    badlar:      filterByPeriod(data.badlar,      period),
    call:        filterByPeriod(data.call,        period),
    politicaMon: filterByPeriod(data.politicaMon, period),
    pf30:        filterByPeriod(data.pf30,        period),
  }), [data, period]);

  const combined = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    const entries = [
      ["badlar",      series.badlar],
      ["call",        series.call],
      ["politicaMon", series.politicaMon],
      ["pf30",        series.pf30],
    ] as const;
    for (const [key, pts] of entries) {
      for (const { fecha, valor } of pts) {
        if (!map.has(fecha)) map.set(fecha, { fecha });
        map.get(fecha)![key] = valor;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.fecha as string).localeCompare(b.fecha as string)
    );
  }, [series]);

  if (combined.length === 0) {
    return <div className="flex items-center justify-center text-slate-400 text-sm h-48">Sin datos</div>;
  }

  const interval = Math.max(1, Math.floor(combined.length / 10));

  const SERIES_DEF = [
    { key: "politicaMon", label: "Política Monetaria", color: "#f59e0b" },
    { key: "badlar",      label: "BADLAR",             color: "#3b82f6" },
    { key: "pf30",        label: "PF 30-59d",          color: "#10b981" },
    { key: "call",        label: "Call",               color: "#8b5cf6" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-3">
        {SERIES_DEF.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={combined} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="fecha" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#94a3b8" }} interval={interval} />
          <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} />
          <Tooltip
            formatter={(v: number, key: string) => {
              const s = SERIES_DEF.find((s) => s.key === key);
              return [`${v.toFixed(2)}% TNA`, s?.label ?? key];
            }}
            labelFormatter={fmt}
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          {SERIES_DEF.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Skeleton ----

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
      <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
      <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
    </div>
  );
}

// ---- MAE pending notice ----

function MAEPendingNotice() {
  return (
    <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-5 text-sm">
      <span className="text-amber-500 mt-0.5">⚠️</span>
      <p className="text-amber-700 dark:text-amber-400">
        Datos del MAE bloqueados por firewall — requiere habilitación de A3/MAE para las IPs del servidor.
        Mientras tanto, los datos de FX y tasas vienen de fuentes alternativas.
      </p>
    </div>
  );
}

// ---- BYMA bond card ----

function BondCard({ q }: { q: BymaQuote }) {
  const isUp   = (q.changePercent ?? 0) > 0;
  const isDown = (q.changePercent ?? 0) < 0;
  const pct    = q.changePercent ?? 0;

  return (
    <div className="card card-dark p-4">
      <div className="flex items-start justify-between mb-1 gap-1">
        <span className="text-xs font-bold text-slate-400 font-mono truncate">{q.symbol}</span>
        <span className={`text-xs font-semibold shrink-0 ${isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-slate-400"}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </div>
      <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {q.lastPrice != null
          ? q.lastPrice.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "—"
        }
      </p>
      <p className="text-xs text-slate-500 mt-0.5 truncate">{q.description}</p>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
        {q.currency && <span>{q.currency}</span>}
        {q.yieldToMaturity != null && (
          <>
            <span>·</span>
            <span>TIR {q.yieldToMaturity.toFixed(1)}%</span>
          </>
        )}
        {q.volume != null && q.volume > 0 && (
          <>
            <span>·</span>
            <span>Vol {(q.volume / 1e6).toFixed(1)}M</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Main page ----

async function fetchByma(): Promise<BymaData> {
  const res = await fetch("/api/byma/mercado");
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.data as BymaData;
}

export function MercadoClient() {
  const [fx, setFx]           = useState<DolarSnapshot | null>(null);
  const [tasas, setTasas]     = useState<TasasData | null>(null);
  const [byma, setByma]       = useState<BymaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [period, setPeriod]   = useState<Period>("6m");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([
      fetchDolarSnapshot(),
      fetchTasas(),
      fetchByma(),
    ]).then(([fxRes, tasasRes, bymaRes]) => {
      if (fxRes.status   === "fulfilled") setFx(fxRes.value);
      if (tasasRes.status === "fulfilled") setTasas(tasasRes.value);
      if (bymaRes.status  === "fulfilled") setByma(bymaRes.value);
      if (fxRes.status === "rejected" && tasasRes.status === "rejected" && bymaRes.status === "rejected") {
        setError("No se pudieron cargar datos de ninguna fuente.");
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mercado</h1>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Error al cargar datos</p>
          <p className="text-xs text-red-600 dark:text-red-500 font-mono break-all mb-4">{error}</p>
          <button onClick={load} className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const oficial = fx?.oficial ?? null;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mercado</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            FX · Tasas de mercado · Renta fija · Cauciones
          </p>
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          FX: dolarapi.com · Tasas: BCRA · Bonos: BYMA
        </div>
      </div>

      {/* Sticky period selector */}
      <div className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Período:</span>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ================================================================
          FX DE MERCADO
      ================================================================ */}
      <BlockSection title="FX de Mercado" icon="💵" color="blue">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Tipos de cambio en tiempo real. Fuente: dolarapi.com
        </p>

        {fx ? (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
              <FxCard label="Oficial" rate={fx.oficial} />
              <FxCard label="Mayorista" rate={fx.mayorista} />
              <FxCard
                label="MEP (Bolsa)"
                rate={fx.mep}
                brechaVsOficial={brecha(fx.mep, oficial)}
              />
              <FxCard
                label="CCL"
                rate={fx.ccl}
                brechaVsOficial={brecha(fx.ccl, oficial)}
              />
              <FxCard
                label="Blue"
                rate={fx.blue}
                brechaVsOficial={brecha(fx.blue, oficial)}
              />
              <FxCard
                label="Cripto"
                rate={fx.cripto}
                brechaVsOficial={brecha(fx.cripto, oficial)}
              />
            </div>

            {/* Brecha chart */}
            <BrechaChart fx={fx} />
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {["Oficial", "MEP", "CCL", "Blue"].map((l) => (
              <PendingCard key={l} label={l} description="Tipo de cambio" source="dolarapi.com" />
            ))}
          </div>
        )}
      </BlockSection>

      {/* ================================================================
          TASAS DE MERCADO
      ================================================================ */}
      <BlockSection title="Tasas de Mercado" icon="📈" color="orange">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Tasas de referencia del mercado monetario. Fuente: BCRA — datos.gob.ar
        </p>

        {tasas ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <DeltaKPICard
                label="Política Monetaria"
                value={lastVal(tasas.politicaMon)}
                suffix="% TNA"
                date={lastDate(tasas.politicaMon)}
                delta={getDelta(tasas.politicaMon)}
                color="#f59e0b"
                positiveIsGood={false}
                decimals={2}
              />
              <DeltaKPICard
                label="BADLAR"
                value={lastVal(tasas.badlar)}
                suffix="% TNA"
                date={lastDate(tasas.badlar)}
                delta={getDelta(tasas.badlar)}
                color="#3b82f6"
                positiveIsGood={false}
                decimals={2}
              />
              <DeltaKPICard
                label="PF 30-59 días"
                value={lastVal(tasas.pf30)}
                suffix="% TNA"
                date={lastDate(tasas.pf30)}
                delta={getDelta(tasas.pf30)}
                color="#10b981"
                positiveIsGood={false}
                decimals={2}
              />
              <DeltaKPICard
                label="Call Interbancario"
                value={lastVal(tasas.call)}
                suffix="% TNA"
                date={lastDate(tasas.call)}
                delta={getDelta(tasas.call)}
                color="#8b5cf6"
                positiveIsGood={false}
                decimals={2}
              />
            </div>

            <div className="card card-dark p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Evolución de Tasas</h3>
                <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">% TNA</span>
              </div>
              <TasasChart data={tasas} period={period} />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {["Política Monetaria", "BADLAR", "PF 30d", "Call"].map((l) => (
              <PendingCard key={l} label={l} description="Tasa de referencia" source="BCRA" unit="% TNA" />
            ))}
          </div>
        )}
      </BlockSection>

      {/* ================================================================
          RENTA FIJA — BYMA
      ================================================================ */}
      <BlockSection title="Renta Fija" icon="📊" color="orange">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Precios y TIR de bonos soberanos y ONs. Fuente: BYMA · open.bymadata.com.ar
          {byma && !byma.marketOpen && (
            <span className="ml-2 text-slate-400">(último cierre)</span>
          )}
        </p>

        {byma && byma.publicBonds.length > 0 ? (
          <>
            {/* Sovereign bonds — filter key tickers */}
            {(() => {
              const SOVEREIGN = ["GD30", "GD29", "AL30", "AL35", "AE38", "GD35", "GD38", "GD41", "GD46"];
              const sovereigns = byma.publicBonds
                .filter((q) => SOVEREIGN.some((t) => q.symbol.startsWith(t)))
                .sort((a, b) => a.symbol.localeCompare(b.symbol));
              const letras = byma.publicBonds
                .filter((q) => q.symbol.startsWith("S") || q.symbol.startsWith("T") || q.description.toLowerCase().includes("lecap") || q.description.toLowerCase().includes("letra"))
                .sort((a, b) => a.symbol.localeCompare(b.symbol))
                .slice(0, 8);
              const all = byma.publicBonds.slice(0, 20);

              return (
                <>
                  {sovereigns.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Bonos Soberanos</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                        {sovereigns.slice(0, 8).map((q) => <BondCard key={q.symbol} q={q} />)}
                      </div>
                    </>
                  )}
                  {letras.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Letras / LECAP</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                        {letras.map((q) => <BondCard key={q.symbol} q={q} />)}
                      </div>
                    </>
                  )}
                  {sovereigns.length === 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {all.map((q) => <BondCard key={q.symbol} q={q} />)}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {["GD30", "AL30", "AE38", "GD35", "GD41", "GD46"].map((t) => (
              <PendingCard key={t} label={t} description="Bono soberano" source="BYMA" unit="ARS" />
            ))}
          </div>
        )}
      </BlockSection>

      {/* ================================================================
          ONs — BYMA
      ================================================================ */}
      {byma && byma.negotiableObligations.length > 0 && (
        <BlockSection title="Obligaciones Negociables" icon="🏢" color="blue">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            ONs corporativas. Fuente: BYMA
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {byma.negotiableObligations.slice(0, 16).map((q) => <BondCard key={q.symbol} q={q} />)}
          </div>
        </BlockSection>
      )}

      {/* ================================================================
          ACCIONES LÍDERES + MERVAL — BYMA
      ================================================================ */}
      {byma && (byma.leadingEquity.length > 0 || byma.indices.length > 0) && (
        <BlockSection title="Renta Variable" icon="📈" color="emerald">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Panel Merval e índices. Fuente: BYMA
          </p>

          {/* Indices */}
          {byma.indices.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
              {byma.indices.map((idx) => (
                <div key={idx.symbol} className="card card-dark p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{idx.symbol}</p>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {idx.lastValue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </p>
                  <p className={`text-xs font-semibold mt-0.5 ${idx.changePercent > 0 ? "text-emerald-500" : idx.changePercent < 0 ? "text-red-500" : "text-slate-400"}`}>
                    {idx.changePercent > 0 ? "+" : ""}{idx.changePercent.toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Panel Merval */}
          {byma.leadingEquity.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {byma.leadingEquity.slice(0, 12).map((q) => <BondCard key={q.symbol} q={q} />)}
            </div>
          )}
        </BlockSection>
      )}

      {/* ================================================================
          REPOS MAE / CAUCIONES — pendiente habilitación
      ================================================================ */}
      <BlockSection title="Repos MAE & Cauciones" icon="💴" color="violet">
        <MAEPendingNotice />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {["Repo Overnight", "Repo 3 días", "Caución 1d", "Caución 7d"].map((l) => (
            <PendingCard key={l} label={l} description="Pendiente habilitación MAE/A3" source="MAE" unit="% TNA" />
          ))}
        </div>
      </BlockSection>
    </div>
  );
}
