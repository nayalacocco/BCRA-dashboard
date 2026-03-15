"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HistoricalChart } from "@/components/charts/HistoricalChart";
import { DeltaKPICard } from "@/components/dashboard/DeltaKPICard";
import { PendingCard } from "@/components/dashboard/PendingCard";
import { BlockSection } from "@/components/dashboard/BlockSection";
import {
  PeriodSelector,
  filterByPeriod,
  type Period,
} from "@/components/dashboard/PeriodSelector";
import { VARIABLES_CONFIG } from "@/lib/bcra/constants";
import { formatDate } from "@/lib/bcra/format";
import type { IndecDashboardData } from "@/lib/indec/client";

// ---- Types ----

export interface HistoricPoint {
  fecha: string;
  valor: number;
}

export interface DashboardClientProps {
  latestValues: Record<number, { valor: number; fecha: string } | null>;
  historicData: Record<number, HistoricPoint[]>;
  pageGeneratedAt: string | null;
  lastBCRAUpdate?: string;
  /** true when server-side fetch failed AND no KV cache — triggers client-side fallback */
  initialFetchFailed?: boolean;
  /** ISO timestamp: set when data comes from KV cache because BCRA API was down */
  kvCachedAt?: string;
  /** INDEC/datos.gob.ar series for Sector Externo + Expectativas */
  indecData?: IndecDashboardData;
}

// IDs fetched by the dashboard
const DASHBOARD_IDS = [1, 5, 4, 15, 109, 78, 27, 28, 29, 7];
const CACHE_KEY = "bcra-dashboard-v1";
const RETRY_MS = 5 * 60 * 1000; // retry silently every 5 min

// ---- Helpers ----

function getDelta(
  data: HistoricPoint[]
): { abs: number | null; pct: number | null } {
  if (data.length < 2) return { abs: null, pct: null };
  const last = data[data.length - 1].valor;
  const prev = data[data.length - 2].valor;
  if (prev === 0) return { abs: last - prev, pct: null };
  return {
    abs: last - prev,
    pct: ((last - prev) / Math.abs(prev)) * 100,
  };
}

function latestVal(
  latestValues: DashboardClientProps["latestValues"],
  id: number
): number | undefined {
  return latestValues[id]?.valor ?? undefined;
}

function latestDate(
  latestValues: DashboardClientProps["latestValues"],
  id: number
): string | undefined {
  return latestValues[id]?.fecha ?? undefined;
}

// Ratio KPI card (inline, used for BM/Reservas etc.)
function RatioCard({
  label,
  description,
  value,
  suffix,
  comparison,
  compLabel,
}: {
  label: string;
  description: string;
  value: number | null;
  suffix?: string;
  comparison?: number | null;
  compLabel?: string;
}) {
  const formatted =
    value != null
      ? value.toLocaleString("es-AR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : "—";

  const pctOfComp =
    value != null && comparison != null && comparison !== 0
      ? ((value / comparison) * 100).toFixed(1)
      : null;

  return (
    <div className="card card-dark p-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-xl font-bold text-slate-700 dark:text-slate-200">
          ${formatted}
        </span>
        {suffix && (
          <span className="text-xs text-slate-400">{suffix}</span>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{description}</p>
      {pctOfComp && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold w-fit bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {pctOfComp}% de {compLabel}
        </div>
      )}
    </div>
  );
}

// ---- Main component ----

export function DashboardClient({
  latestValues: serverLatestValues,
  historicData: serverHistoricData,
  pageGeneratedAt: serverGeneratedAt,
  lastBCRAUpdate: serverLastBCRAUpdate,
  initialFetchFailed = false,
  indecData,
}: DashboardClientProps) {
  const hasServerData = Object.keys(serverLatestValues).length > 0;

  const [latestValues, setLatestValues] = useState(serverLatestValues);
  const [historicData, setHistoricData] = useState(serverHistoricData);
  const [pageGeneratedAt, setPageGeneratedAt] = useState<string | null>(serverGeneratedAt);
  const [lastBCRAUpdate, setLastBCRAUpdate] = useState<string | undefined>(serverLastBCRAUpdate);

  const fetchingRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchFnRef = useRef<() => Promise<void>>(async () => {});

  async function fetchClientData() {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }

    try {
      const varsRes = await fetch(`/api/bcra/variables?ids=${DASHBOARD_IDS.join(",")}`);
      if (!varsRes.ok) throw new Error("vars");
      const { data: variables } = await varsRes.json();

      const newLatest: Record<number, { valor: number; fecha: string } | null> = {};
      for (const v of variables) {
        newLatest[v.idVariable] =
          v.ultValorInformado != null
            ? { valor: v.ultValorInformado, fecha: v.ultFechaInformada }
            : null;
      }

      const histResults = await Promise.allSettled(
        DASHBOARD_IDS.map((id) =>
          fetch(`/api/bcra/historico/${id}?limit=2000`).then((r) => r.json())
        )
      );
      const newHist: Record<number, HistoricPoint[]> = {};
      histResults.forEach((r, i) => {
        const id = DASHBOARD_IDS[i];
        newHist[id] =
          r.status === "fulfilled" && r.value?.data?.detalle
            ? ([...r.value.data.detalle].reverse() as HistoricPoint[])
            : [];
      });

      const now = new Date().toISOString();
      const bcraDate = (variables as Array<{ idVariable: number; ultFechaInformada?: string }>)
        .find((v) => v.idVariable === 1)?.ultFechaInformada;

      setLatestValues(newLatest);
      setHistoricData(newHist);
      setPageGeneratedAt(now);
      setLastBCRAUpdate(bcraDate);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          latestValues: newLatest, historicData: newHist,
          pageGeneratedAt: now, lastBCRAUpdate: bcraDate,
          savedAt: now,
        }));
      } catch { /* QuotaExceededError */ }
    } catch {
      // Retry silently after 5 minutes
      retryRef.current = setTimeout(() => {
        fetchingRef.current = false;
        fetchFnRef.current();
      }, RETRY_MS);
    } finally {
      fetchingRef.current = false;
    }
  }

  fetchFnRef.current = fetchClientData;

  useEffect(() => {
    // Good server data → persist to localStorage for future offline fallback
    if (!initialFetchFailed && hasServerData) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          latestValues: serverLatestValues,
          historicData: serverHistoricData,
          pageGeneratedAt: serverGeneratedAt,
          lastBCRAUpdate: serverLastBCRAUpdate,
          savedAt: new Date().toISOString(),
        }));
      } catch { /* ignore */ }
      return;
    }

    // Server fetch failed → try localStorage cache, then retry in background
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.latestValues && Object.keys(parsed.latestValues).length > 0) {
          setLatestValues(parsed.latestValues);
          setHistoricData(parsed.historicData ?? {});
          setPageGeneratedAt(parsed.pageGeneratedAt ?? null);
          setLastBCRAUpdate(parsed.lastBCRAUpdate);
        }
      }
    } catch { /* ignore */ }

    fetchClientData();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [period, setPeriod] = useState<Period>("1y");

  // Filter all historical data by selected period
  const filtered = useMemo(() => {
    const result: Record<number, HistoricPoint[]> = {};
    for (const [id, data] of Object.entries(historicData)) {
      result[Number(id)] = filterByPeriod(data, period);
    }
    return result;
  }, [historicData, period]);

  // Filter INDEC data by period
  const filteredIndec = useMemo(() => ({
    exportCereales: filterByPeriod(indecData?.exportCereales ?? [], period),
    balanceCereales: filterByPeriod(indecData?.balanceCereales ?? [], period),
    inflacionEsperada: filterByPeriod(indecData?.inflacionEsperada ?? [], period),
  }), [indecData, period]);

  // ---- Ratio calculations ----
  const bmReservas =
    (latestVal(latestValues, 15) ?? 0) / (latestVal(latestValues, 1) ?? 1);
  const m2Reservas =
    (latestVal(latestValues, 109) ?? 0) / (latestVal(latestValues, 1) ?? 1);
  const usdOficial = latestVal(latestValues, 5) ?? null;

  return (
    <div className="space-y-10">

      {/* ---- PAGE HEADER ---- */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Indicadores BCRA
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Principales variables monetarias y cambiarias
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {lastBCRAUpdate && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Datos al: {formatDate(lastBCRAUpdate)}
            </div>
          )}
          {pageGeneratedAt && (
            <p className="text-xs text-slate-400 dark:text-slate-600">
              Actualizado: {new Date(pageGeneratedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} ART
            </p>
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
          BLOQUE 1: RESERVAS E INTERVENCIÓN
      ================================================================ */}
      <BlockSection title="Reservas e Intervención" icon="🏦" color="emerald">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <DeltaKPICard
            label="Reservas Brutas"
            value={latestVal(latestValues, 1)}
            suffix="M USD"
            date={latestDate(latestValues, 1)}
            delta={getDelta(historicData[1] ?? [])}
            color={VARIABLES_CONFIG[1]?.color}
            positiveIsGood={true}
            decimals={0}
          />
          <DeltaKPICard
            label="Variación Diaria Res."
            value={getDelta(historicData[1] ?? []).abs}
            suffix="M USD"
            date={latestDate(latestValues, 1)}
            color={
              (getDelta(historicData[1] ?? []).abs ?? 0) >= 0
                ? "#0ca678"
                : "#e03131"
            }
            positiveIsGood={true}
            showSign={true}
            decimals={1}
          />
          <DeltaKPICard
            label="Compras MULC (diario)"
            value={latestVal(latestValues, 78)}
            suffix="M USD"
            date={latestDate(latestValues, 78)}
            delta={getDelta(historicData[78] ?? [])}
            color={VARIABLES_CONFIG[78]?.color}
            positiveIsGood={true}
            showSign={true}
            decimals={1}
          />
          <PendingCard
            label="Reservas Netas"
            description="Brutas − SWAP BPCh − FMI − REPO"
            source="BCRA (cálculo)"
            unit="M USD"
          />
        </div>

        {/* Reservas chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Reservas Internacionales
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              M USD
            </span>
          </div>
          <HistoricalChart
            data={filtered[1] ?? []}
            color={VARIABLES_CONFIG[1]?.color ?? "#0ca678"}
            unit="M USD"
            height={260}
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 2: MONETARIO
      ================================================================ */}
      <BlockSection title="Monetario" icon="💵" color="violet">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Base Monetaria"
            value={latestVal(latestValues, 15)}
            suffix="M $"
            date={latestDate(latestValues, 15)}
            delta={getDelta(historicData[15] ?? [])}
            color={VARIABLES_CONFIG[15]?.color}
            positiveIsGood={false}
            decimals={0}
            compact={true}
          />
          <DeltaKPICard
            label="M2 Privado"
            value={latestVal(latestValues, 109)}
            suffix="M $"
            date={latestDate(latestValues, 109)}
            delta={getDelta(historicData[109] ?? [])}
            color={VARIABLES_CONFIG[109]?.color}
            positiveIsGood={false}
            decimals={0}
            compact={true}
          />
          <PendingCard
            label="Pasivos Remunerados"
            description="LEFI – Letras Fiscales de Liquidez"
            source="Secretaría de Finanzas"
            unit="M $"
          />
        </div>

        {/* Ratios de cobertura */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Ratios de cobertura (dólar implícito)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RatioCard
              label="Dólar BM"
              description="Base Monetaria / Reservas"
              value={bmReservas}
              suffix="$/USD"
              comparison={usdOficial}
              compLabel="USD Oficial"
            />
            <RatioCard
              label="Dólar M2"
              description="M2 Privado / Reservas"
              value={m2Reservas}
              suffix="$/USD"
              comparison={usdOficial}
              compLabel="USD Oficial"
            />
            <PendingCard
              label="Pasivos / BM"
              description="Pasivos Remunerados / Base Monetaria"
              source="Pendiente"
            />
          </div>
        </div>

        {/* BM chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Base Monetaria
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              M $
            </span>
          </div>
          <HistoricalChart
            data={filtered[15] ?? []}
            color={VARIABLES_CONFIG[15]?.color ?? "#862e9c"}
            unit="M $"
            height={220}
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 3: CAMBIARIO
      ================================================================ */}
      <BlockSection title="Cambiario" icon="💱" color="blue">
        <div className="flex justify-end mb-3">
          <Link
            href="/mercado"
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            Ver mercado completo →
          </Link>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <DeltaKPICard
            label="USD Mayorista (A3500)"
            value={latestVal(latestValues, 5)}
            prefix="$"
            date={latestDate(latestValues, 5)}
            delta={getDelta(historicData[5] ?? [])}
            color={VARIABLES_CONFIG[5]?.color}
            positiveIsGood={false}
            decimals={2}
          />
          <DeltaKPICard
            label="USD Minorista"
            value={latestVal(latestValues, 4)}
            prefix="$"
            date={latestDate(latestValues, 4)}
            delta={getDelta(historicData[4] ?? [])}
            color={VARIABLES_CONFIG[4]?.color}
            positiveIsGood={false}
            decimals={2}
          />
          <PendingCard
            label="USD MEP"
            description="Implícito de bonos (AL30/GD30)"
            source="ByMA"
          />
          <PendingCard
            label="USD CCL"
            description="Contado con Liquidación"
            source="ByMA"
          />
        </div>

        {/* Brecha row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <PendingCard
            label="Brecha MEP/Oficial"
            description="(MEP − Oficial) / Oficial — &lt;20% verde · 20–40% amarillo · &gt;40% rojo"
            source="Calculado"
            unit="%"
            riskBand={true}
          />
          <PendingCard
            label="Brecha CCL/Oficial"
            description="(CCL − Oficial) / Oficial"
            source="Calculado"
            unit="%"
            riskBand={true}
          />
        </div>

        {/* USD Mayorista chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Tipo de Cambio Mayorista (A3500)
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              ARS / USD
            </span>
          </div>
          <HistoricalChart
            data={filtered[5] ?? []}
            color={VARIABLES_CONFIG[5]?.color ?? "#3b5bdb"}
            unit="ARS/USD"
            height={240}
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 4: EXPECTATIVAS
      ================================================================ */}
      <BlockSection title="Expectativas e Inflación" icon="📊" color="orange">
        <div className="flex justify-end mb-3">
          <Link
            href="/inflacion"
            className="text-xs font-medium text-orange-700 dark:text-orange-400 hover:underline flex items-center gap-1"
          >
            Ver análisis completo →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <DeltaKPICard
            label="Inflación Mensual"
            value={latestVal(latestValues, 27)}
            suffix="%"
            date={latestDate(latestValues, 27)}
            delta={getDelta(historicData[27] ?? [])}
            color={VARIABLES_CONFIG[27]?.color}
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="Inflación Interanual"
            value={latestVal(latestValues, 28)}
            suffix="%"
            date={latestDate(latestValues, 28)}
            delta={getDelta(historicData[28] ?? [])}
            color={VARIABLES_CONFIG[28]?.color}
            positiveIsGood={false}
            decimals={1}
          />
          <DeltaKPICard
            label="REM – Inflación 12m"
            value={latestVal(latestValues, 29)}
            suffix="%"
            date={latestDate(latestValues, 29)}
            color={VARIABLES_CONFIG[29]?.color}
            decimals={1}
          />
          <PendingCard
            label="Riesgo País"
            description="JP Morgan EMBI+ Argentina"
            source="JP Morgan"
            unit="pb"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <PendingCard
            label="Futuros Dólar (ROFEX)"
            description="Contratos a término por vencimiento"
            source="ROFEX"
          />
          <DeltaKPICard
            label="BADLAR Privada"
            value={latestVal(latestValues, 7)}
            suffix="% n.a."
            date={latestDate(latestValues, 7)}
            delta={getDelta(historicData[7] ?? [])}
            color={VARIABLES_CONFIG[7]?.color}
            positiveIsGood={false}
            decimals={3}
          />
          <DeltaKPICard
            label="Inflación Esperada 12m"
            value={indecData?.inflacionEsperada.at(-1)?.valor ?? undefined}
            suffix="%"
            date={indecData?.inflacionEsperada.at(-1)?.fecha}
            delta={getDelta(indecData?.inflacionEsperada ?? [])}
            color="#e67700"
            positiveIsGood={false}
            decimals={1}
          />
        </div>

        {/* Inflación chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              Inflación Mensual
            </h3>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              %
            </span>
          </div>
          <HistoricalChart
            data={filtered[27] ?? []}
            color={VARIABLES_CONFIG[27]?.color ?? "#e03131"}
            unit="%"
            height={200}
          />
        </div>
      </BlockSection>

      {/* ================================================================
          BLOQUE 5: SECTOR EXTERNO
      ================================================================ */}
      <BlockSection title="Sector Externo" icon="🌎" color="green">
        <div className="flex justify-end mb-3">
          <Link
            href="/sector-externo"
            className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline flex items-center gap-1"
          >
            Ver análisis completo →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <DeltaKPICard
            label="Exportaciones Cereales"
            value={indecData?.exportCereales.at(-1)?.valor ?? undefined}
            suffix="M USD"
            date={indecData?.exportCereales.at(-1)?.fecha}
            delta={getDelta(indecData?.exportCereales ?? [])}
            color="#2f9e44"
            positiveIsGood={true}
            decimals={1}
          />
          <PendingCard
            label="Importaciones"
            description="Pagos de importaciones al exterior"
            source="INDEC"
            unit="M USD"
          />
          <DeltaKPICard
            label="Balance Comercial Agro"
            value={indecData?.balanceCereales.at(-1)?.valor ?? undefined}
            suffix="M USD"
            date={indecData?.balanceCereales.at(-1)?.fecha}
            delta={getDelta(indecData?.balanceCereales ?? [])}
            color="#087f5b"
            positiveIsGood={true}
            showSign={true}
            decimals={1}
          />
        </div>

        {/* Exportaciones chart */}
        <div className="card card-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Exportaciones de Cereales
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Fuente: INDEC (datos.gob.ar)</p>
            </div>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              M USD
            </span>
          </div>
          <HistoricalChart
            data={filteredIndec.exportCereales}
            color="#2f9e44"
            unit="M USD"
            height={220}
          />
        </div>
      </BlockSection>

      {/* Source note */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Fuentes:</span>{" "}
          API oficial del BCRA v4.0 · INDEC vía datos.gob.ar · UTDT (Di Tella) vía datos.gob.ar.
          Datos con caché ISR de 30 min.{" "}
          <span className="text-amber-600 dark:text-amber-500">⚠ Pendiente</span>{" "}
          indica variables de fuentes externas (ByMA, ROFEX, CIARA) aún no integradas.
        </p>
      </div>
    </div>
  );
}
