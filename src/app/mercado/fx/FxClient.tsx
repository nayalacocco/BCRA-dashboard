"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { PeriodSelector, type Period } from "@/components/dashboard/PeriodSelector";
import type { AllFxHistorico, ArgDatosPoint } from "@/lib/dolar/argentinadatos";
import type { DxyPoint } from "@/app/api/fx/dxy/route";
import { GOVERNMENT_PERIODS } from "@/lib/bcra/constants";
import type { BymaQuote } from "@/lib/byma/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface SeriesPoint { fecha: string; valor: number; }

// Merged FX point (all series aligned by date, values are "venta")
interface FxMergedPoint {
  fecha: string;
  oficial?:   number;
  mayorista?: number;
  mep?:       number;
  ccl?:       number;
  blue?:      number;
  cripto?:    number;
}

// Ratio point (brecha % or ratio)
interface RatioPoint {
  fecha: string;
  mepBrecha?:    number;
  cclBrecha?:    number;
  blueBrecha?:   number;
  criptoBrecha?: number;
  canje?:        number; // ccl / mep
}

// ── Config ───────────────────────────────────────────────────────────────────

const FX_SERIES: { key: keyof FxMergedPoint; label: string; color: string }[] = [
  { key: "oficial",   label: "Oficial",   color: "#1c7ed6" },
  { key: "mayorista", label: "Mayorista", color: "#339af0" },
  { key: "mep",       label: "MEP",       color: "#0ca678" },
  { key: "ccl",       label: "CCL",       color: "#20c997" },
  { key: "blue",      label: "Blue",      color: "#f76707" },
  { key: "cripto",    label: "Cripto",    color: "#ae3ec9" },
];

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtDate(v: string) {
  const [y, m, d] = v.split("-");
  return `${d}/${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

function fmtDateShort(v: string) {
  const [y, m] = v.split("-");
  return `${MONTHS_ES[parseInt(m) - 1]}/${y.slice(2)}`;
}

// ── Period filter ─────────────────────────────────────────────────────────────

// Build government period map from shared constants (covers all keys: milei, fernandez, macri, cfk2, cfk1, nk)
const GOV_PERIODS_MAP: Record<string, { desde: string; hasta?: string }> = {};
for (const g of GOVERNMENT_PERIODS) {
  GOV_PERIODS_MAP[g.key] = { desde: g.desde, hasta: g.hasta };
}

function filterByPeriod<T extends { fecha: string }>(data: T[], period: Period): T[] {
  if (!data.length || period === "max") return data;

  if (period in GOV_PERIODS_MAP) {
    const { desde, hasta } = GOV_PERIODS_MAP[period];
    return data.filter((d) => {
      if (desde && d.fecha < desde) return false;
      if (hasta && d.fecha > hasta) return false;
      return true;
    });
  }

  const anchor = new Date(data[data.length - 1].fecha + "T12:00:00Z");
  const iso = (d: Date) => d.toISOString().split("T")[0];
  let desde: string;
  switch (period) {
    case "1m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 1);      desde = iso(d); break; }
    case "3m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 3);      desde = iso(d); break; }
    case "6m": { const d = new Date(anchor); d.setMonth(d.getMonth() - 6);      desde = iso(d); break; }
    case "1y": { const d = new Date(anchor); d.setFullYear(d.getFullYear() - 1); desde = iso(d); break; }
    case "2y": { const d = new Date(anchor); d.setFullYear(d.getFullYear() - 2); desde = iso(d); break; }
    case "5y": { const d = new Date(anchor); d.setFullYear(d.getFullYear() - 5); desde = iso(d); break; }
    default:   return data;
  }
  return data.filter((d) => d.fecha >= desde);
}

/** Returns earliest and latest dates of a dataset, or null if empty */
function dataRange(data: { fecha: string }[]): { from: string; to: string } | null {
  if (!data.length) return null;
  return { from: data[0].fecha, to: data[data.length - 1].fecha };
}

/** Empty state for charts when gov period has no data */
function NoDataForPeriod({ period, dataStart }: { period: Period; dataStart: string | null }) {
  const gov = GOVERNMENT_PERIODS.find((g) => g.key === period);
  if (!gov) return <p className="text-slate-400 text-sm text-center py-10">Sin datos para el período seleccionado</p>;
  return (
    <div className="py-10 text-center space-y-1">
      <p className="text-sm text-slate-400">
        Sin datos para el gobierno de <span className="font-medium text-slate-300">{gov.presidente}</span> ({gov.desde.slice(0,4)}–{gov.hasta?.slice(0,4) ?? "..."})
      </p>
      {dataStart && (
        <p className="text-xs text-slate-500">
          La serie disponible comienza en {dataStart.slice(0,7)}
        </p>
      )}
    </div>
  );
}

// ── Merge FX series by date ───────────────────────────────────────────────────

function mergeFxSeries(hist: AllFxHistorico): FxMergedPoint[] {
  const map = new Map<string, FxMergedPoint>();

  function addSeries(series: ArgDatosPoint[], key: keyof Omit<FxMergedPoint, "fecha">) {
    for (const pt of series) {
      if (pt.venta == null) continue;
      let entry = map.get(pt.fecha);
      if (!entry) { entry = { fecha: pt.fecha }; map.set(pt.fecha, entry); }
      (entry as unknown as Record<string, unknown>)[key] = pt.venta;
    }
  }

  addSeries(hist.oficial,   "oficial");
  addSeries(hist.mayorista, "mayorista");
  addSeries(hist.mep,       "mep");
  addSeries(hist.ccl,       "ccl");
  addSeries(hist.blue,      "blue");
  addSeries(hist.cripto,    "cripto");

  return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Compute ratio series ──────────────────────────────────────────────────────

function computeRatios(merged: FxMergedPoint[]): RatioPoint[] {
  return merged
    .filter((d) => d.oficial != null && d.oficial > 0)
    .map((d) => {
      const of = d.oficial!;
      const pt: RatioPoint = { fecha: d.fecha };
      if (d.mep)    pt.mepBrecha    = ((d.mep    - of) / of) * 100;
      if (d.ccl)    pt.cclBrecha    = ((d.ccl    - of) / of) * 100;
      if (d.blue)   pt.blueBrecha   = ((d.blue   - of) / of) * 100;
      if (d.cripto) pt.criptoBrecha = ((d.cripto - of) / of) * 100;
      if (d.ccl && d.mep && d.mep > 0) pt.canje = d.ccl / d.mep;
      return pt;
    });
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};

// ── Implied FX from sovereign bonds ──────────────────────────────────────────

interface ImpliedFxRow {
  base:         string;   // e.g. "AL30"
  arsPrice:     number | null;
  mepUsdPrice:  number | null;
  cclUsdPrice:  number | null;
  impliedMep:   number | null;
  impliedCcl:   number | null;
}

// Bonds we care about (most liquid Argentine sovereign bonds)
const SOVEREIGN_BASES = [
  "AL29", "AL30", "AL35", "AL41",               // Bonares (ley AR)
  "GD29", "GD30", "GD35", "GD38", "GD41",       // Globales (ley NY)
  "GD46", "GD65",
  "AO27", "AN29",                                // Otros soberanos
  "BPOB7", "BPOB8",                              // Bopreal
];

function buildImpliedFx(bonds: BymaQuote[]): ImpliedFxRow[] {
  // Group bonds by base: strip the last character (suffix D/C/O)
  const arsMap   = new Map<string, number>();  // base → ARS price
  const mepMap   = new Map<string, number>();  // base → USD MEP (D) price
  const cclMap   = new Map<string, number>();  // base → USD CCL (C) price

  for (const q of bonds) {
    if (!q.lastPrice || q.lastPrice <= 0) continue;
    const suffix = q.symbol.slice(-1).toUpperCase();
    const base   = q.symbol.slice(0, -1);

    if (suffix === "O" || q.currency === "ARS") {
      // ARS-priced variant — use O suffix OR any ARS-currency bond
      const key = suffix === "O" ? base : q.symbol;
      if (!arsMap.has(key) || (q.lastPrice > (arsMap.get(key) ?? 0))) {
        arsMap.set(suffix === "O" ? base : q.symbol, q.lastPrice);
      }
    } else if (suffix === "D" && q.currency === "USD") {
      if (!mepMap.has(base) || (q.lastPrice > (mepMap.get(base) ?? 0))) {
        mepMap.set(base, q.lastPrice);
      }
    } else if (suffix === "C" && q.currency === "USD") {
      if (!cclMap.has(base) || (q.lastPrice > (cclMap.get(base) ?? 0))) {
        cclMap.set(base, q.lastPrice);
      }
    }
  }

  // Build rows for known sovereign bases
  const rows: ImpliedFxRow[] = [];
  for (const base of SOVEREIGN_BASES) {
    const arsPrice    = arsMap.get(base) ?? null;
    const mepUsdPrice = mepMap.get(base) ?? null;
    const cclUsdPrice = cclMap.get(base) ?? null;

    // Need at least ARS + one USD price
    if (!arsPrice || (!mepUsdPrice && !cclUsdPrice)) continue;

    const impliedMep = arsPrice && mepUsdPrice ? arsPrice / mepUsdPrice : null;
    const impliedCcl = arsPrice && cclUsdPrice ? arsPrice / cclUsdPrice : null;

    rows.push({ base, arsPrice, mepUsdPrice, cclUsdPrice, impliedMep, impliedCcl });
  }

  return rows;
}

function ImpliedFxTable({
  bonds,
  fxRef,
}: {
  bonds: BymaQuote[];
  fxRef: AllFxHistorico | null;
}) {
  const rows = useMemo(() => buildImpliedFx(bonds), [bonds]);
  if (rows.length === 0) return null;

  // Reference: last official MEP/CCL from argentinadatos
  const refMep = fxRef?.mep?.at(-1)?.venta ?? null;
  const refCcl = fxRef?.ccl?.at(-1)?.venta ?? null;

  function spreadBadge(implied: number | null, ref: number | null) {
    if (!implied || !ref) return null;
    const diff = ((implied - ref) / ref) * 100;
    const cls = Math.abs(diff) < 0.5
      ? "text-slate-400"
      : diff > 0
        ? "text-emerald-500 dark:text-emerald-400"
        : "text-red-500 dark:text-red-400";
    return (
      <span className={`text-[10px] font-medium ml-1 ${cls}`}>
        ({diff > 0 ? "+" : ""}{diff.toFixed(1)}%)
      </span>
    );
  }

  function fmtP(v: number | null) {
    if (!v) return "—";
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="card card-dark p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
        FX Implícito desde Bonos Soberanos
      </h2>
      <p className="text-xs text-slate-500 mb-1">
        MEP = precio ARS / precio USD-D · CCL = precio ARS / precio USD-C · Fuente: BYMA tiempo real
      </p>
      {(refMep || refCcl) && (
        <p className="text-xs text-slate-500 mb-4">
          Referencia argentinadatos:{" "}
          {refMep && <span className="text-emerald-500 dark:text-emerald-400 font-medium">MEP ${fmtP(refMep)}</span>}
          {refMep && refCcl && " · "}
          {refCcl && <span className="text-teal-500 dark:text-teal-400 font-medium">CCL ${fmtP(refCcl)}</span>}
          <span className="text-slate-400"> — la diferencia entre bonos refleja diferencias en liquidez y operatoria</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
              <th className="text-left py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wide">Bono</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-500 uppercase tracking-wide">ARS</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-500 uppercase tracking-wide">USD MEP (D)</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-500 uppercase tracking-wide">USD CCL (C)</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-500 uppercase tracking-wide">MEP Implícito</th>
              <th className="text-right py-2 pl-2 font-semibold text-slate-500 uppercase tracking-wide">CCL Implícito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.base} className="border-b border-slate-100/40 dark:border-slate-800/40 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="py-2 pr-4 font-bold text-slate-900 dark:text-slate-100">{r.base}</td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                  ${fmtP(r.arsPrice)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                  {r.mepUsdPrice ? `$${fmtP(r.mepUsdPrice)}` : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                  {r.cclUsdPrice ? `$${fmtP(r.cclUsdPrice)}` : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {r.impliedMep ? (
                    <span>
                      ${fmtP(r.impliedMep)}
                      {spreadBadge(r.impliedMep, refMep)}
                    </span>
                  ) : "—"}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {r.impliedCcl ? (
                    <span>
                      ${fmtP(r.impliedCcl)}
                      {spreadBadge(r.impliedCcl, refCcl)}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FxClient() {
  const [period, setPeriod] = useState<Period>("2y");
  const [activeSeries, setActiveSeries] = useState<Set<string>>(
    new Set(["oficial", "mep", "ccl", "blue"])
  );
  const [hist, setHist]       = useState<AllFxHistorico | null>(null);
  const [tcrm, setTcrm]       = useState<SeriesPoint[]>([]);
  const [dxy,  setDxy]        = useState<DxyPoint[]>([]);
  const [bonds, setBonds]     = useState<BymaQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetch("/api/fx/historico").then((r) => r.json()),
      fetch("/api/fx/dxy").then((r) => r.json()),
      // TCRM diario desde datos.gob.ar — BCRA multilateral index base dic-2015=100
      // Series ID: 116.4_TCRZE_2015_D_36_4
      fetch(
        "https://apis.datos.gob.ar/series/api/series/?ids=116.4_TCRZE_2015_D_36_4&limit=3000&sort=asc&format=json",
        { headers: { "Accept": "application/json" } }
      ).then((r) => r.json()),
      // BYMA sovereign bonds for implied FX calculation
      fetch("/api/byma/mercado").then((r) => r.json()),
    ]).then(([histRes, dxyRes, tcrmRes, bymaRes]) => {
      if (histRes.status === "fulfilled" && histRes.value?.data) {
        setHist(histRes.value.data as AllFxHistorico);
      } else {
        setError("No se pudo cargar el histórico de FX");
      }
      if (dxyRes.status === "fulfilled" && dxyRes.value?.data) {
        setDxy(dxyRes.value.data as DxyPoint[]);
      }
      if (tcrmRes.status === "fulfilled" && tcrmRes.value?.data) {
        const rows: [string, number | null][] = (tcrmRes.value as { data: [string, number | null][] }).data ?? [];
        setTcrm(rows.filter(([, v]) => v != null).map(([fecha, valor]) => ({ fecha, valor: valor! })));
      }
      if (bymaRes.status === "fulfilled" && bymaRes.value?.publicBonds) {
        setBonds(bymaRes.value.publicBonds as BymaQuote[]);
      }
    }).finally(() => setLoading(false));
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const merged = useMemo(() => hist ? mergeFxSeries(hist) : [], [hist]);
  const filteredMerged = useMemo(() => filterByPeriod(merged, period), [merged, period]);
  const ratios = useMemo(() => computeRatios(merged), [merged]);
  const filteredRatios = useMemo(() => filterByPeriod(ratios, period), [ratios, period]);
  const filteredTcrm = useMemo(() => filterByPeriod(tcrm, period), [tcrm, period]);
  const filteredDxy  = useMemo(() => filterByPeriod(dxy.map((d) => ({ fecha: d.fecha, valor: d.valor })), period), [dxy, period]);

  // ── Toggle series ──────────────────────────────────────────────────────────

  function toggleSeries(key: string) {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  // ── Tick formatter ─────────────────────────────────────────────────────────

  function xTick(v: string) {
    // For long periods show month/year, for short periods show day/month
    return period === "1m" ? fmtDate(v) : fmtDateShort(v);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/mercado"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Mercado
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            FX — Series Históricas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Evolución histórica de tipos de cambio. Fuente: argentinadatos.com · BCRA · Yahoo Finance
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Período:</span>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
          Cargando series históricas…
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && hist && (
        <>
          {/* ── FX Multi-series chart ────────────────────────────────────── */}
          <div className="card card-dark p-5">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Tipos de Cambio (ARS / USD)
              </h2>
              {/* Series toggles */}
              <div className="flex flex-wrap gap-2">
                {FX_SERIES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => toggleSeries(s.key as string)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      activeSeries.has(s.key as string)
                        ? "ring-1 ring-current"
                        : "opacity-35 hover:opacity-60"
                    }`}
                    style={{ color: s.color }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: activeSeries.has(s.key as string) ? s.color : "#94a3b8" }}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredMerged.length === 0 ? (
              <NoDataForPeriod period={period} dataStart={dataRange(merged)?.from ?? null} />
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={filteredMerged} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={xTick}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v as number).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={64}
                  />
                  <Tooltip
                    labelFormatter={(v) => fmtDate(v as string)}
                    formatter={(v: unknown, name: unknown) => [
                      `$${(v as number).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      FX_SERIES.find((s) => s.key === name)?.label ?? String(name),
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  {FX_SERIES.map((s) =>
                    activeSeries.has(s.key as string) ? (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        dot={false}
                        strokeWidth={1.5}
                        connectNulls
                        name={s.key}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Brechas vs Oficial ───────────────────────────────────────── */}
          <div className="card card-dark p-5">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Brecha vs Oficial (%)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              (FX – Oficial) / Oficial × 100
            </p>
            {filteredRatios.length === 0 ? (
              <NoDataForPeriod period={period} dataStart={dataRange(ratios)?.from ?? null} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={filteredRatios} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={xTick}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={44}
                  />
                  <Tooltip
                    labelFormatter={(v) => fmtDate(v as string)}
                    formatter={(v: unknown, name: unknown) => [
                      `${(v as number).toFixed(1)}%`,
                      name === "mepBrecha"    ? "MEP"
                      : name === "cclBrecha"  ? "CCL"
                      : name === "blueBrecha" ? "Blue"
                      : "Cripto",
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Line type="monotone" dataKey="mepBrecha"    stroke="#0ca678" dot={false} strokeWidth={1.5} connectNulls name="mepBrecha" />
                  <Line type="monotone" dataKey="cclBrecha"    stroke="#20c997" dot={false} strokeWidth={1.5} connectNulls name="cclBrecha" />
                  <Line type="monotone" dataKey="blueBrecha"   stroke="#f76707" dot={false} strokeWidth={1.5} connectNulls name="blueBrecha" />
                  <Line type="monotone" dataKey="criptoBrecha" stroke="#ae3ec9" dot={false} strokeWidth={1.5} connectNulls name="criptoBrecha" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="flex gap-4 flex-wrap mt-2 justify-center">
              {[
                { key: "mepBrecha", label: "MEP", color: "#0ca678" },
                { key: "cclBrecha", label: "CCL", color: "#20c997" },
                { key: "blueBrecha", label: "Blue", color: "#f76707" },
                { key: "criptoBrecha", label: "Cripto", color: "#ae3ec9" },
              ].map((l) => (
                <span key={l.key} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-3 h-0.5 rounded" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Canje CCL/MEP ─────────────────────────────────────────────── */}
          {filteredRatios.some((d) => d.canje != null) && (
            <div className="card card-dark p-5">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Canje (CCL / MEP)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Ratio CCL / MEP. Cuanto más alto, mayor la diferencia entre ambos dólares financieros.
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={filteredRatios} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={xTick}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v as number).toFixed(3)}`}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={52}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    labelFormatter={(v) => fmtDate(v as string)}
                    formatter={(v: unknown) => [(v as number).toFixed(4), "CCL/MEP"]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Line type="monotone" dataKey="canje" stroke="#339af0" dot={false} strokeWidth={1.5} connectNulls name="canje" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── TCRM + DXY ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TCRM */}
            <div className="card card-dark p-5">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">TCRM</h2>
              <p className="text-xs text-slate-500 mb-4">
                Tipo de Cambio Real Multilateral — índice base dic-2015=100. Fuente: BCRA vía datos.gob.ar
              </p>
              {filteredTcrm.length === 0 ? (
                <NoDataForPeriod period={period} dataStart={dataRange(tcrm)?.from ?? null} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={filteredTcrm} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={xTick}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      interval="preserveStartEnd"
                      minTickGap={60}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} />
                    <Tooltip
                      labelFormatter={(v) => fmtDate(v as string)}
                      formatter={(v: unknown) => [(v as number).toFixed(2), "TCRM (índice)"]}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Line type="monotone" dataKey="valor" stroke="#3b5bdb" dot={false} strokeWidth={1.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* DXY */}
            <div className="card card-dark p-5">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Dollar Index (DXY)</h2>
              <p className="text-xs text-slate-500 mb-4">
                Índice del dólar frente a una canasta de monedas. Fuente: Yahoo Finance
              </p>
              {filteredDxy.length === 0 ? (
                <NoDataForPeriod period={period} dataStart={dataRange(dxy.map((d) => ({ fecha: d.fecha })))?.from ?? null} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={filteredDxy} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={xTick}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      interval="preserveStartEnd"
                      minTickGap={60}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} domain={["auto", "auto"]} />
                    <Tooltip
                      labelFormatter={(v) => fmtDate(v as string)}
                      formatter={(v: unknown) => [(v as number).toFixed(2), "DXY"]}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Line type="monotone" dataKey="valor" stroke="#f76707" dot={false} strokeWidth={1.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── FX implícito desde bonos soberanos ──────────────────────── */}
          <ImpliedFxTable bonds={bonds} fxRef={hist} />

          {/* ── Note ──────────────────────────────────────────────────────── */}
          <p className="text-xs text-slate-400 text-center">
            FX histórico: argentinadatos.com · TCRM: BCRA vía datos.gob.ar · DXY: Yahoo Finance · Bonos: BYMA
          </p>
        </>
      )}
    </div>
  );
}
