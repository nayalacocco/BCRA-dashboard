"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
}

// IDs fetched by the dashboard
const DASHBOARD_IDS = [1, 5, 4, 15, 109, 78, 27, 28, 29, 7];
const CACHE_KEY = "bcra-dashboard-v1";
const RETRY_SECONDS = 300;

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

type DataStatus = "ok" | "stale" | "fetching" | "error";

export function DashboardClient({
  latestValues: serverLatestValues,
  historicData: serverHistoricData,
  pageGeneratedAt: serverGeneratedAt,
  lastBCRAUpdate: serverLastBCRAUpdate,
  initialFetchFailed = false,
  kvCachedAt,
}: DashboardClientProps) {
  const hasServerData = Object.keys(serverLatestValues).length > 0;

  const [latestValues, setLatestValues] = useState(serverLatestValues);
  const [historicData, setHistoricData] = useState(serverHistoricData);
  const [pageGeneratedAt, setPageGeneratedAt] = useState<string | null>(serverGeneratedAt);
  const [lastBCRAUpdate, setLastBCRAUpdate] = useState<string | undefined>(serverLastBCRAUpdate);
  const [dataStatus, setDataStatus] = useState<DataStatus>(
    !initialFetchFailed && hasServerData ? "ok" : "error"
  );
  // kvCachedAt: server has data from KV but BCRA API was down
  const isKVStale = Boolean(kvCachedAt);
  const [retryIn, setRetryIn] = useState(0);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const fetchingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref so the setInterval callback always calls the latest function instance
  const fetchFnRef = useRef<() => Promise<void>>(async () => {});

  async function fetchClientData() {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    setRetryIn(0);
    setDataStatus((s) => (s === "stale" ? "stale" : "fetching"));

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
      setDataStatus("ok");

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          latestValues: newLatest, historicData: newHist,
          pageGeneratedAt: now, lastBCRAUpdate: bcraDate,
          savedAt: now,
        }));
      } catch { /* QuotaExceededError */ }
    } catch {
      setDataStatus((s) => (s === "stale" ? "stale" : "error"));
      let countdown = RETRY_SECONDS;
      setRetryIn(countdown);
      retryTimerRef.current = setInterval(() => {
        countdown -= 1;
        setRetryIn(countdown);
        if (countdown <= 0) {
          if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
          fetchingRef.current = false;
          fetchFnRef.current(); // call via stable ref to avoid stale closure
        }
      }, 1000);
    } finally {
      fetchingRef.current = false;
    }
  }

  // Keep the ref in sync with the latest function instance
  fetchFnRef.current = fetchClientData;

  useEffect(() => {
    // Good server data → persist to localStorage
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

    // Server failed → try localStorage cache first, then client fetch
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.latestValues && Object.keys(parsed.latestValues).length > 0) {
          setLatestValues(parsed.latestValues);
          setHistoricData(parsed.historicData ?? {});
          setPageGeneratedAt(parsed.pageGeneratedAt ?? null);
          setLastBCRAUpdate(parsed.lastBCRAUpdate);
          setCachedAt(parsed.savedAt ?? null);
          setDataStatus("stale");
        }
      }
    } catch { /* ignore */ }

    fetchClientData();

    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
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

  // ---- Ratio calculations ----
  const bmReservas =
    (latestVal(latestValues, 15) ?? 0) / (latestVal(latestValues, 1) ?? 1);
  const m2Reservas =
    (latestVal(latestValues, 109) ?? 0) / (latestVal(latestValues, 1) ?? 1);
  const usdOficial = latestVal(latestValues, 5) ?? null;

  // If truly no data and still erroring — show minimal retry UI
  const hasAnyData = Object.keys(latestValues).length > 0;
  if (!hasAnyData && (dataStatus === "error" || dataStatus === "fetching")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl">
          {dataStatus === "fetching" ? (
            <span className="animate-spin inline-block">⟳</span>
          ) : "⚠️"}
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-1">
            {dataStatus === "fetching" ? "Cargando datos…" : "No se pudieron cargar los datos"}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md text-sm">
            La API del BCRA podría estar temporalmente no disponible.
            {retryIn > 0 && ` Reintentando en ${retryIn} segundos.`}
          </p>
        </div>
        <button
          onClick={() => { fetchingRef.current = false; fetchClientData(); }}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
        >
          Reintentar ahora
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ---- STATUS BANNERS ---- */}
      {/* KV cache banner: server served stale data because BCRA API was down */}
      {isKVStale && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-sm text-orange-700 dark:text-orange-400">
          <span className="text-base">📡</span>
          <span>
            <strong>API del BCRA no disponible.</strong> Mostrando últimos datos del{" "}
            <strong>
              {new Date(kvCachedAt!).toLocaleString("es-AR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </strong>.
            La página se actualizará automáticamente cuando la API vuelva.
          </span>
        </div>
      )}
      {dataStatus === "stale" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <span>⚠️</span>
          <span>
            Mostrando datos en caché
            {cachedAt ? ` del ${new Date(cachedAt).toLocaleDateString("es-AR")}` : ""}.
            La API del BCRA no está disponible temporalmente.
            {retryIn > 0 && ` Reintentando en ${retryIn}s.`}
          </span>
          <button
            onClick={() => { fetchingRef.current = false; fetchClientData(); }}
            className="ml-auto text-xs font-semibold underline whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}
      {dataStatus === "fetching" && hasAnyData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-600 dark:text-blue-400">
          <span className="animate-spin inline-block">⟳</span>
          <span>Actualizando datos…</span>
        </div>
      )}

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

      {/* ---- PERIOD SELECTOR ---- */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Período:
        </span>
        <PeriodSelector value={period} onChange={setPeriod} />
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <PendingCard
            label="Liquidación Agro"
            description="CIARA-CEC: sector agroexportador"
            source="CIARA"
            unit="M USD"
          />
          <PendingCard
            label="Importaciones"
            description="Pagos de importaciones al exterior"
            source="INDEC"
            unit="M USD"
          />
          <PendingCard
            label="Balance Comercial"
            description="Exportaciones − Importaciones"
            source="INDEC"
            unit="M USD"
          />
        </div>
      </BlockSection>

      {/* Source note */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Fuente:</span>{" "}
          API oficial del BCRA — Principales Variables v4.0. Datos con caché ISR de 30 min.{" "}
          <span className="text-amber-600 dark:text-amber-500">⚠ Pendiente</span>{" "}
          indica variables de fuentes externas (ByMA, ROFEX, INDEC, CIARA) aún no integradas.
        </p>
      </div>
    </div>
  );
}
