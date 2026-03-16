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
  type Period,
} from "@/components/dashboard/PeriodSelector";
import { fetchDolarSnapshot, brecha } from "@/lib/dolar/client";
import type { DolarSnapshot } from "@/lib/dolar/client";
import type { BymaData, BymaQuote } from "@/lib/byma/client";
import type { MercadoData as MAEData, MAEQuote } from "@/lib/mae/mercado";
import { getONSpec } from "@/lib/byma/on-specs";
import type { ONSpec } from "@/lib/byma/on-specs";

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

/**
 * Like filterByPeriod but anchors relative periods (1m/3m/6m/1y/2y/5y) to the
 * LAST DATA POINT instead of today. This is critical for BCRA monthly series
 * which are published with a 3-5 month lag — anchoring to today would show
 * almost no data for short periods.
 * Government periods (milei, macri, etc.) still use their fixed absolute dates.
 */
function filterByPeriodAnchored(data: SeriesPoint[], period: Period): SeriesPoint[] {
  if (data.length === 0) return data;
  if (period === "max") return data;

  // Government periods: absolute date ranges
  const GOV_PERIODS: Record<string, { desde: string; hasta?: string }> = {
    milei:   { desde: "2023-12-10" },
    fernandez: { desde: "2019-12-10", hasta: "2023-12-10" },
    macri:   { desde: "2015-12-10", hasta: "2019-12-10" },
    kirchner: { desde: "2003-05-25", hasta: "2015-12-10" },
  };
  if (period in GOV_PERIODS) {
    const { desde, hasta } = GOV_PERIODS[period];
    return data.filter((d) => {
      if (desde && d.fecha < desde) return false;
      if (hasta && d.fecha > hasta) return false;
      return true;
    });
  }

  // Relative periods: anchor to last data point date
  const anchorStr = data[data.length - 1].fecha;
  const anchor = new Date(anchorStr + "T12:00:00Z");
  const iso = (d: Date) => d.toISOString().split("T")[0];

  let desde: string;
  switch (period) {
    case "1m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 1);     desde = iso(d); break; }
    case "3m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 3);     desde = iso(d); break; }
    case "6m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 6);     desde = iso(d); break; }
    case "1y": { const d = new Date(anchor); d.setFullYear(d.getFullYear()-1); desde = iso(d); break; }
    case "2y": { const d = new Date(anchor); d.setFullYear(d.getFullYear()-2); desde = iso(d); break; }
    case "5y": { const d = new Date(anchor); d.setFullYear(d.getFullYear()-5); desde = iso(d); break; }
    default:   return data;
  }

  return data.filter((d) => d.fecha >= desde);
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
    badlar:      filterByPeriodAnchored(data.badlar,      period),
    call:        filterByPeriodAnchored(data.call,        period),
    politicaMon: filterByPeriodAnchored(data.politicaMon, period),
    pf30:        filterByPeriodAnchored(data.pf30,        period),
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

function BondCard({ q, onClick }: { q: BymaQuote; onClick?: () => void }) {
  const isUp   = (q.changePercent ?? 0) > 0;
  const isDown = (q.changePercent ?? 0) < 0;
  const pct    = q.changePercent;

  // Format price: ARS bonds are quoted in nominal/100 units (e.g. 110,000),
  // USD bonds in cent-dollars (e.g. 74.77)
  const priceStr = q.lastPrice != null
    ? q.lastPrice.toLocaleString("es-AR", {
        minimumFractionDigits: q.lastPrice >= 100 ? 0 : 2,
        maximumFractionDigits: q.lastPrice >= 100 ? 0 : 2,
      })
    : "—";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      className={`card card-dark p-4 text-left w-full ${onClick ? "hover:ring-2 hover:ring-blue-400/40 cursor-pointer transition-all" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-1.5 gap-1">
        <span className="text-xs font-bold text-slate-300 font-mono">{q.symbol}</span>
        <span className={`text-xs font-semibold shrink-0 tabular-nums ${
          pct == null  ? "text-slate-500"
          : isUp       ? "text-emerald-500"
          : isDown     ? "text-red-500"
          :              "text-slate-400"
        }`}>
          {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
        </span>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
        {priceStr}
      </p>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
        {q.currency && (
          <span className={`font-medium ${q.currency === "USD" ? "text-emerald-500/80" : "text-blue-400/80"}`}>
            {q.currency}
          </span>
        )}
        {q.maturityDate && (
          <>
            <span>·</span>
            <span>{q.maturityDate.slice(0, 7)}</span>
          </>
        )}
        {q.volumeAmount != null && q.volumeAmount > 0 && (
          <>
            <span>·</span>
            <span>Vol {(q.volumeAmount / 1e6).toFixed(0)}M</span>
          </>
        )}
        {onClick && (
          <span className="ml-auto text-[10px] text-blue-400/70 shrink-0">ver detalle →</span>
        )}
      </div>
    </Tag>
  );
}

// ---- ON Detail: TIR solver + cash flow builder ----

/**
 * Try to extract the annual coupon rate (%) from a bond description string.
 * Common patterns: "YPF 8.875%", "PAMPA CLASE XI 7% 2029", "TNA 6.50%"
 * We look for the first X.XX% pattern where X is in a plausible coupon range (0.5 – 30%).
 */
function parseCouponFromDesc(description: string): number | null {
  // Match decimal or integer percentage: e.g. "8.875%", "7%", "6.5%"
  const matches = description.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g);
  for (const m of matches) {
    const rate = parseFloat(m[1].replace(",", "."));
    if (rate >= 0.5 && rate <= 30) return rate;   // plausible coupon range
  }
  return null;
}

interface CashFlow { fecha: string; cupon: number; amortizacion: number; total: number; }

/**
 * Build an approximate coupon schedule.
 * Uses maturityDate as anchor for the last payment; distributes prior payments
 * evenly going backward from maturity.
 * freq: payments per year (1 = annual, 2 = semi-annual, 4 = quarterly)
 */
function buildCashFlows(
  couponPct: number,
  maturityDate: string,
  freq: number,
): CashFlow[] {
  const matDate  = new Date(maturityDate + "T12:00:00Z");
  const today    = new Date();
  const totalDays = (matDate.getTime() - today.getTime()) / 86_400_000;
  if (totalDays <= 0) return [];

  const yearsToMat = totalDays / 365;
  const periods    = Math.max(1, Math.round(yearsToMat * freq));
  const daysPerPeriod = totalDays / periods;
  const couponPerPeriod = (couponPct / 100) * 100 / freq; // on 100 VN

  const flows: CashFlow[] = [];
  for (let i = 1; i <= periods; i++) {
    const daysOffset = Math.round(i * daysPerPeriod);
    const d = new Date(today.getTime() + daysOffset * 86_400_000);
    const fecha = d.toISOString().split("T")[0];
    const isLast = i === periods;
    flows.push({
      fecha,
      cupon:         couponPerPeriod,
      amortizacion:  isLast ? 100 : 0,
      total:         couponPerPeriod + (isLast ? 100 : 0),
    });
  }
  return flows;
}

/**
 * Newton-Raphson IRR solver.
 * cashflows: array of {t (years), cf (positive = receipt)}
 * price:     bond purchase price (positive number, we subtract it as initial outflow)
 */
function solveTIR(price: number, cashflows: CashFlow[], maturityDate: string): number | null {
  if (cashflows.length === 0 || price <= 0) return null;

  const today = new Date();
  const tFlows = cashflows.map((c) => {
    const d = new Date(c.fecha + "T12:00:00Z");
    const t = (d.getTime() - today.getTime()) / (365.25 * 86_400_000);
    return { t, cf: c.total };
  });

  let r = 0.10; // initial guess
  for (let iter = 0; iter < 200; iter++) {
    let npv = -price, dnpv = 0;
    for (const { t, cf } of tFlows) {
      if (t <= 0) continue;
      const disc = Math.pow(1 + r, t);
      npv  += cf / disc;
      dnpv -= t * cf / (disc * (1 + r));
    }
    if (Math.abs(dnpv) < 1e-14) break;
    const delta = npv / dnpv;
    r -= delta;
    if (Math.abs(delta) < 1e-9) break;
    if (r < -0.99 || r > 100) return null; // diverged
  }
  return r * 100; // return as %
}

// ---- ON Detail Modal ----

function ONDetailModal({ quote: q, onClose }: { quote: BymaQuote; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // --- Price formatting ---
  const price = q.lastPrice;
  const priceStr = price != null
    ? price.toLocaleString("es-AR", {
        minimumFractionDigits: price >= 100 ? 0 : 2,
        maximumFractionDigits: price >= 100 ? 0 : 2,
      })
    : "—";

  const pct   = q.changePercent;
  const isUp  = (pct ?? 0) > 0;
  const isDown = (pct ?? 0) < 0;

  // --- Lookup static ON spec (covers the ~33 most active ONs) ---
  // Priority for coupon data: 1. static DB  2. BYMA field  3. parse description
  const staticSpec: ONSpec | null = getONSpec(q.symbol);

  // --- Maturity display (prefer static DB date for precision) ---
  const displayMaturity = staticSpec?.maturityDate ?? q.maturityDate ?? null;
  const matStr = displayMaturity
    ? new Date(displayMaturity + "T12:00:00Z").toLocaleDateString("es-AR", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : null;

  // --- TIR calculation ---
  // Priority: 1. BYMA provides yieldToMaturity → use it
  //           2. Static DB has coupon → Newton-Raphson (most accurate)
  //           3. Coupon parseable from description → Newton-Raphson
  //           4. No coupon data → show "pendiente" (don't show bogus approx)
  let tirValue: number | null = null;
  let tirLabel  = "";
  let tirNote   = "";
  let cashFlows: CashFlow[] = [];
  let tirMethod: "byma" | "computed" | "pending" | "none" = "none";

  // Resolve the best coupon source
  const resolvedCoupon: number | null =
    q.yieldToMaturity != null && q.yieldToMaturity > 0
      ? null  // will use BYMA TIR directly below
      : (staticSpec?.couponRate ?? q.couponRate ?? parseCouponFromDesc(q.description));

  const resolvedFreq: 1 | 2 | 4 =
    (staticSpec?.couponFrequency ?? q.couponFrequency ?? (q.currency === "USD" ? 2 : 1)) as 1 | 2 | 4;

  // Resolve maturity — prefer static DB (more precise date) over BYMA string
  const resolvedMaturity: string | null = staticSpec?.maturityDate ?? q.maturityDate ?? null;
  const resolvedDays: number | null =
    resolvedMaturity
      ? Math.round((new Date(resolvedMaturity + "T12:00:00Z").getTime() - Date.now()) / 86_400_000)
      : q.daysToMaturity ?? null;

  const couponSource: "byma-field" | "static-db" | "description" | null =
    q.yieldToMaturity != null && q.yieldToMaturity > 0 ? null
    : staticSpec?.couponRate != null ? "static-db"
    : q.couponRate != null ? "byma-field"
    : parseCouponFromDesc(q.description) != null ? "description"
    : null;

  if (q.yieldToMaturity != null && q.yieldToMaturity > 0) {
    tirValue  = q.yieldToMaturity;
    tirLabel  = "TIR (BYMA)";
    tirNote   = "Calculada por BYMA.";
    tirMethod = "byma";
  } else if (price != null && resolvedMaturity && resolvedDays && resolvedDays > 0 && resolvedCoupon != null) {
    cashFlows = buildCashFlows(resolvedCoupon, resolvedMaturity, resolvedFreq);
    const computed = solveTIR(price, cashFlows, resolvedMaturity);
    if (computed != null && computed > -99) {
      tirValue  = computed;
      tirLabel  = "TIR";
      tirNote   = couponSource === "static-db"
        ? `Cupón ${resolvedCoupon}% anual (${resolvedFreq === 2 ? "semestral" : resolvedFreq === 4 ? "trimestral" : "anual"}) — base de datos interna.`
        : couponSource === "description"
        ? `Cupón ${resolvedCoupon}% parseado de la descripción — verificar con el prospecto.`
        : `Cupón ${resolvedCoupon}% anual.`;
      tirMethod = "computed";
      if (couponSource === "description") tirLabel = "TIR estimada *";
    }
  } else if (price != null && resolvedDays && resolvedDays > 0) {
    // Coupon data missing — show "pendiente" instead of a misleading approx
    tirMethod = "pending";
  }

  // --- Frequency label helper ---
  const freqLabel = (freq: number) =>
    freq === 2 ? "semestral" : freq === 4 ? "trimestral" : freq === 12 ? "mensual" : "anual";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-8 pb-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono font-bold text-xl text-slate-900 dark:text-slate-100">{q.symbol}</span>
              {q.currency && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  q.currency === "USD"
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                }`}>{q.currency}</span>
              )}
              {q.settlementType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{q.settlementType}</span>
              )}
              {q.securityType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{q.securityType}</span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug line-clamp-2">{q.description}</p>
            {(staticSpec?.issuer ?? q.issuer) && (staticSpec?.issuer ?? q.issuer) !== q.description && !(staticSpec?.issuer ?? "").includes("completar") && (
              <p className="text-xs text-slate-500 mt-0.5">Emisor: {staticSpec?.issuer ?? q.issuer}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Market snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Current price */}
            <div className="col-span-2 sm:col-span-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Precio actual</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{priceStr}</p>
              <span className={`text-sm font-semibold tabular-nums ${
                pct == null  ? "text-slate-500"
                : isUp       ? "text-emerald-500"
                : isDown     ? "text-red-500"
                :              "text-slate-400"
              }`}>
                {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
              </span>
              {q.previousClosingPrice != null && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Cierre ant.: {q.previousClosingPrice.toLocaleString("es-AR", {
                    minimumFractionDigits: q.previousClosingPrice >= 100 ? 0 : 2,
                    maximumFractionDigits: q.previousClosingPrice >= 100 ? 0 : 2,
                  })}
                </p>
              )}
            </div>

            {/* Intraday range + volume */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Rango del día</p>
              <div className="space-y-1 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                {q.maxPrice != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Máx</span>
                    <span className="font-medium">{q.maxPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {q.minPrice != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mín</span>
                    <span className="font-medium">{q.minPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {q.openingPrice != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Apertura</span>
                    <span className="font-medium">{q.openingPrice.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Maturity */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Vencimiento</p>
              {matStr ? (
                <>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">{matStr}</p>
                  {q.daysToMaturity != null && (
                    <p className="text-xs text-slate-500 mt-1">
                      {q.daysToMaturity > 365
                        ? `${(q.daysToMaturity / 365).toFixed(1)} años`
                        : `${q.daysToMaturity} días`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
              {q.volumeAmount != null && q.volumeAmount > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Vol: {q.volumeAmount >= 1e9
                    ? `${(q.volumeAmount / 1e9).toFixed(2)} MM`
                    : `${(q.volumeAmount / 1e6).toFixed(0)} M`} {q.currency ?? "ARS"}
                </p>
              )}
            </div>
          </div>

          {/* TIR section */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">TIR / Rendimiento</h3>
              {tirMethod === "byma" && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">BYMA</span>
              )}
              {tirMethod === "computed" && couponSource === "static-db" && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">DB interna</span>
              )}
              {tirMethod === "computed" && couponSource !== "static-db" && (
                <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full font-medium">Estimada</span>
              )}
              {tirMethod === "pending" && (
                <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Datos pendientes</span>
              )}
            </div>
            <div className="px-4 py-3">
              {tirValue != null && tirValue > -99 ? (
                <>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {tirValue.toFixed(2)}<span className="text-xl font-semibold text-slate-400 ml-1">%</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{tirLabel}</p>
                  {tirNote && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">{tirNote}</p>}
                </>
              ) : tirMethod === "pending" ? (
                <div className="py-1">
                  <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Cupón no disponible en API gratuita</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Completar <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">couponRate</code> en{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">src/lib/byma/on-specs.ts</code>{" "}
                    o integrar API A3.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-1">No disponible — precio o vencimiento faltante.</p>
              )}
            </div>
          </div>

          {/* Cash flows section */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Flujos de Caja <span className="text-slate-400 font-normal">(sobre 100 VN)</span></h3>
              {cashFlows.length > 0 && (
                <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">
                  {freqLabel(resolvedFreq)}{couponSource !== "static-db" && couponSource !== "byma-field" ? "*" : ""}
                </span>
              )}
            </div>

            {cashFlows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-4 py-2 font-medium">Fecha</th>
                      <th className="text-right px-3 py-2 font-medium">Cupón</th>
                      <th className="text-right px-3 py-2 font-medium">Amort.</th>
                      <th className="text-right px-4 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlows.map((cf, i) => (
                      <tr key={i} className={`border-b border-slate-50 dark:border-slate-800/60 ${
                        i === cashFlows.length - 1
                          ? "bg-emerald-50 dark:bg-emerald-900/10 font-semibold text-slate-900 dark:text-slate-100"
                          : "text-slate-700 dark:text-slate-300"
                      }`}>
                        <td className="px-4 py-2 font-mono">
                          {cf.fecha}
                          {i === cashFlows.length - 1 && (
                            <span className="ml-2 text-[9px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">final</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {cf.cupon > 0 ? cf.cupon.toFixed(4) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {cf.amortizacion > 0 ? cf.amortizacion.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {cf.total.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-slate-50 dark:bg-slate-800/40 font-semibold text-slate-900 dark:text-slate-100">
                      <td className="px-4 py-2 text-xs text-slate-500 font-normal">Total recibido</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {cashFlows.reduce((s, c) => s + c.cupon, 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">100.00</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {cashFlows.reduce((s, c) => s + c.total, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-400 px-4 py-2 border-t border-slate-100 dark:border-slate-800">
                  * Fechas estimadas según días al vencimiento. La frecuencia y el monto exacto de cada pago
                  pueden diferir según el prospecto de la ON.
                  {tirMethod === "computed" && " Cupón extraído de la descripción del instrumento."}
                </p>
              </div>
            ) : (
              <div className="px-4 py-5">
                {q.maturityDate ? (
                  <div className="space-y-3">
                    {/* Only maturity date known */}
                    <div className="flex justify-between text-xs border-b border-dashed border-slate-200 dark:border-slate-700 pb-3">
                      <span className="text-slate-500">Vencimiento / Amort. final</span>
                      <div className="text-right">
                        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{q.maturityDate}</span>
                        <span className="ml-2 text-slate-500 tabular-nums">100.00</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      El calendario de cupones y amortizaciones no está disponible en la API gratuita de BYMA.
                      Consultá el prospecto en <span className="font-medium text-blue-500">cnv.gob.ar</span> o en la hoja técnica del bono en BYMA.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Flujos no disponibles — fecha de vencimiento desconocida.</p>
                )}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Datos de mercado: BYMA (open.bymadata.com.ar). La TIR y los flujos mostrados son estimaciones
            con fines informativos — no constituyen asesoramiento de inversión.
          </p>
        </div>
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
  const [fx, setFx]               = useState<DolarSnapshot | null>(null);
  const [tasas, setTasas]         = useState<TasasData | null>(null);
  const [byma, setByma]           = useState<BymaData | null>(null);
  const [mae, setMae]             = useState<MAEData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [period, setPeriod]       = useState<Period>("6m");
  const [selectedON, setSelectedON] = useState<BymaQuote | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([
      fetchDolarSnapshot(),
      fetchTasas(),
      fetchByma(),
      fetch("/api/mae/mercado").then((r) => {
        if (!r.ok) throw new Error(`MAE HTTP ${r.status}`);
        return r.json().then((j: { data: MAEData | null; error: string | null }) => {
          if (!j.data) throw new Error(j.error ?? "MAE sin datos");
          return j.data;
        });
      }),
    ]).then(([fxRes, tasasRes, bymaRes, maeRes]) => {
      if (fxRes.status   === "fulfilled") setFx(fxRes.value);
      if (tasasRes.status === "fulfilled") setTasas(tasasRes.value);
      if (bymaRes.status  === "fulfilled") setByma(bymaRes.value);
      if (maeRes.status   === "fulfilled") setMae(maeRes.value as MAEData);
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
      {/* ON Detail Modal */}
      {selectedON && <ONDetailModal quote={selectedON} onClose={() => setSelectedON(null)} />}

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
            {(() => {
              // Ley-argentina sovereign bonds available in BYMA free API
              // Note: GD-series (ley NY) are NOT in the free tier
              const SOVEREIGN_BASE = ["AL30","AL35","AL41","AL29","AE38","AO27","AN29","DICP","PARA"];

              // Keep only: exact base (ARS price) and "C" suffix (USD cable)
              // Filter out D (MEP), X/Y/Z (technical/repo variants)
              const sovereigns = byma.publicBonds
                .filter((q) => {
                  const base = q.symbol.replace(/[CDXYZcdxyz]$/, "");
                  if (!SOVEREIGN_BASE.includes(base)) return false;
                  const suffix = q.symbol.slice(base.length);
                  return suffix === "" || suffix === "C";
                })
                .sort((a, b) => {
                  const aBase = a.symbol.replace(/C$/, "");
                  const bBase = b.symbol.replace(/C$/, "");
                  const ai = SOVEREIGN_BASE.indexOf(aBase);
                  const bi = SOVEREIGN_BASE.indexOf(bBase);
                  if (ai !== bi) return ai - bi;
                  // ARS before USD within same base
                  return (a.currency === "ARS" ? 0 : 1) - (b.currency === "ARS" ? 0 : 1);
                });

              // Letras del Tesoro: short-duration T-bills (S or T prefix, ≤6 chars)
              const letras = byma.publicBonds
                .filter((q) => {
                  const sym = q.symbol;
                  return (
                    ((sym.startsWith("S") || sym.startsWith("T")) && sym.length <= 6) &&
                    !SOVEREIGN_BASE.some(b => sym.startsWith(b))
                  );
                })
                .filter((q) => q.currency === "ARS") // only ARS letras
                .sort((a, b) => a.symbol.localeCompare(b.symbol))
                .slice(0, 8);

              return (
                <>
                  {sovereigns.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                        Bonos Soberanos <span className="normal-case font-normal text-slate-600">(ley arg · ARS + cable USD)</span>
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
                        {sovereigns.map((q) => <BondCard key={q.symbol} q={q} />)}
                      </div>
                    </>
                  )}
                  {letras.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Letras del Tesoro</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
                        {letras.map((q) => <BondCard key={q.symbol} q={q} />)}
                      </div>
                    </>
                  )}
                  {sovereigns.length === 0 && letras.length === 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {byma.publicBonds.slice(0, 16).map((q) => <BondCard key={q.symbol} q={q} />)}
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
      {byma && byma.negotiableObligations.length > 0 && (() => {
        // Show ONs with highest volume (or if no volume, first 16 sorted by symbol)
        const sorted = [...byma.negotiableObligations]
          .sort((a, b) => {
            const va = a.volumeAmount ?? a.volume ?? 0;
            const vb = b.volumeAmount ?? b.volume ?? 0;
            return vb - va;
          });
        // Prefer USD ONs (most traded) — filter to EXT currency first
        const usdOns = sorted.filter(q => q.currency === "USD").slice(0, 8);
        const arsOns = sorted.filter(q => q.currency === "ARS").slice(0, 8);
        const display = usdOns.length >= 4
          ? [...usdOns.slice(0, 8), ...arsOns.slice(0, 8)]
          : sorted.slice(0, 16);

        return (
          <BlockSection title="Obligaciones Negociables" icon="🏢" color="blue">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              ONs corporativas. {byma.negotiableObligations.length} instrumentos disponibles. Fuente: BYMA
              {!byma.marketOpen && <span className="ml-2 text-slate-400">· último cierre</span>}
            </p>
            {usdOns.length > 0 && arsOns.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">USD</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-5">
                  {usdOns.map((q) => <BondCard key={q.symbol} q={q} onClick={() => setSelectedON(q)} />)}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">ARS</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {arsOns.map((q) => <BondCard key={q.symbol} q={q} onClick={() => setSelectedON(q)} />)}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {display.map((q) => <BondCard key={q.symbol} q={q} onClick={() => setSelectedON(q)} />)}
              </div>
            )}
          </BlockSection>
        );
      })()}

      {/* ================================================================
          RENTA VARIABLE — BYMA
      ================================================================ */}
      {byma && (byma.leadingEquity.length > 0 || byma.indices.length > 0) && (
        <BlockSection title="Renta Variable" icon="📈" color="emerald">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Panel Merval e índices S&P BYMA. Fuente: BYMA
            {byma && !byma.marketOpen && <span className="ml-2 text-slate-400">· último cierre</span>}
          </p>

          {/* Key indices — filter to the most relevant */}
          {(() => {
            const KEY_IDX = ["M", "G", "SPBYICAP", "SPBYCDAP"];
            const keyIndices = byma.indices
              .filter((idx) => KEY_IDX.includes(idx.symbol) && idx.lastValue > 0)
              .sort((a, b) => KEY_IDX.indexOf(a.symbol) - KEY_IDX.indexOf(b.symbol));
            const otherIndices = byma.indices
              .filter((idx) => !KEY_IDX.includes(idx.symbol) && idx.lastValue > 0)
              .slice(0, 6);
            const allIndices = [...keyIndices, ...otherIndices];

            return allIndices.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Índices</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
                  {allIndices.map((idx) => {
                    const isUp   = idx.changePercent > 0;
                    const isDown = idx.changePercent < 0;
                    return (
                      <div key={idx.symbol} className="card card-dark p-4">
                        <div className="flex items-start justify-between mb-1.5 gap-1">
                          <span className="text-xs font-bold text-slate-300 font-mono truncate">{idx.symbol}</span>
                          <span className={`text-xs font-semibold shrink-0 tabular-nums ${isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-slate-400"}`}>
                            {isUp ? "+" : ""}{idx.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
                          {idx.lastValue >= 1e6
                            ? `${(idx.lastValue / 1e6).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
                            : idx.lastValue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 truncate leading-tight">{idx.description}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null;
          })()}

          {/* Panel Merval — leading equities */}
          {byma.leadingEquity.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Panel Merval</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {byma.leadingEquity
                  .filter((q) => q.lastPrice != null && q.lastPrice > 0)
                  .slice(0, 20)
                  .map((q) => <BondCard key={q.symbol} q={q} />)}
              </div>
            </>
          )}
        </BlockSection>
      )}

      {/* ================================================================
          REPOS MAE / CAUCIONES
      ================================================================ */}
      <BlockSection title="Repos MAE & Cauciones" icon="💴" color="violet">
        {mae ? (
          <div className="space-y-6">
            {/* ── Repo + Cauciones KPI cards ──────────────────────────────── */}
            {(() => {
              // Repo overnight: today's latestCurve, fallback to last in history
              const onToday = mae.repoLatestCurve.find((r) => r.plazo === "001" || r.plazo === "1");
              const onLast  = mae.repoOvernight.at(-1);
              const onTasa  = onToday?.tasa ?? onLast?.valor;
              const onVol   = onToday?.vol;
              const onFecha = onToday ? null : onLast?.fecha;  // show date only when using fallback

              // Cauciones: find ARS and USD separately
              const cauARS = mae.cauciones.find((c) => c.moneda === "$" || c.ticker === "CAARS");
              const cauUSD = mae.cauciones.find((c) => c.moneda === "D" || c.ticker === "CAUSD");

              const mkRepoCard = (label: string, tasa: number | undefined, vol?: number, fallbackFecha?: string | null) => (
                <div className="card card-dark p-4">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                  {tasa != null ? (
                    <>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {tasa.toFixed(2)}<span className="text-sm ml-1 text-slate-400">%</span>
                      </p>
                      {vol != null && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Vol: {vol >= 1e12 ? `${(vol / 1e12).toFixed(2)} B` : `${(vol / 1e9).toFixed(1)} MM`} ARS
                        </p>
                      )}
                      {fallbackFecha && (
                        <p className="text-[10px] text-amber-500 mt-0.5">Últ. {new Date(fallbackFecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Sin datos</p>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">TNA · MAE</p>
                </div>
              );

              const mkCauCard = (label: string, cau: typeof cauARS) => (
                <div className="card card-dark p-4">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                  {cau && cau.ultimaTasa > 0 ? (
                    <>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {cau.ultimaTasa.toFixed(2)}<span className="text-sm ml-1 text-slate-400">%</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Rango: {cau.precioMinimo.toFixed(2)}–{cau.precioMaximo.toFixed(2)}%
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Sin datos</p>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">TNA · MAE</p>
                </div>
              );

              return (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {mkRepoCard("Repo Overnight", onTasa, onVol, onFecha)}
                  {mkCauCard("Caución ARS 1d", cauARS)}
                  {mkCauCard("Caución USD 1d", cauUSD)}
                </div>
              );
            })()}

            {/* ── Renta fija MAE ─────────────────────────────────────────── */}
            {mae.rentafija.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Renta Fija MAE ({mae.rentafija.length} instrumentos hoy)
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left px-4 py-2.5 font-medium">Ticker</th>
                        <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Descripción</th>
                        <th className="text-right px-3 py-2.5 font-medium">Precio</th>
                        <th className="text-right px-3 py-2.5 font-medium hidden sm:table-cell">Var%</th>
                        <th className="text-right px-4 py-2.5 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* deduplicate by ticker (MAE lists BT+GT segments) */}
                      {Array.from(
                        mae.rentafija
                          .reduce((m, q) => {
                            const prev = m.get(q.ticker);
                            if (!prev || q.montoAcumulado > (prev as MAEQuote).montoAcumulado) m.set(q.ticker, q);
                            return m;
                          }, new Map<string, MAEQuote>())
                          .values()
                      )
                        .sort((a, b) => (b as MAEQuote).montoAcumulado - (a as MAEQuote).montoAcumulado)
                        .slice(0, 20)
                        .map((q) => {
                          const mq = q as MAEQuote;
                          const isUp   = mq.variacion > 0;
                          const isDown = mq.variacion < 0;
                          return (
                            <tr key={mq.ticker + mq.plazo} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-4 py-2 font-mono font-semibold text-slate-900 dark:text-slate-100">{mq.ticker}</td>
                              <td className="px-3 py-2 text-slate-500 hidden sm:table-cell max-w-[200px] truncate">{mq.descripcion.replace(mq.ticker, "").replace(/^\s*\(/, "").replace(/\)\s*$/, "").trim()}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{mq.precioUltimo > 0 ? mq.precioUltimo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}</td>
                              <td className={`px-3 py-2 text-right tabular-nums hidden sm:table-cell font-medium ${isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-slate-400"}`}>
                                {mq.variacion !== 0 ? `${mq.variacion > 0 ? "+" : ""}${mq.variacion.toFixed(2)}%` : "—"}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                                {mq.montoAcumulado >= 1e9
                                  ? `${(mq.montoAcumulado / 1e9).toFixed(1)} B`
                                  : mq.montoAcumulado >= 1e6
                                  ? `${(mq.montoAcumulado / 1e6).toFixed(0)} M`
                                  : mq.montoAcumulado > 0
                                  ? `${mq.montoAcumulado.toLocaleString("es-AR")}`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Fuente: MAE · Mercado Abierto Electrónico. Top 20 por monto. Segmento bilateral + garantizado.</p>
              </div>
            )}
          </div>
        ) : (
          /* MAE key not set in Vercel yet */
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Configurar MAE_API_KEY en Vercel</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Ir a Vercel → Settings → Environment Variables → agregar <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">MAE_API_KEY</code> con el valor de la key de MAE.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {["Repo Overnight", "Caución ARS 1d", "Caución USD 1d"].map((l) => (
                <PendingCard key={l} label={l} description="Requiere MAE_API_KEY en Vercel" source="MAE" unit="% TNA" />
              ))}
            </div>
          </div>
        )}
      </BlockSection>
    </div>
  );
}
