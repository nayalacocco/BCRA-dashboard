"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
import { HistoricalChart } from "@/components/charts/HistoricalChart";
import { SeasonalChart } from "@/components/charts/SeasonalChart";
import { VariableCombobox } from "@/components/ui/VariableCombobox";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChartSkeleton } from "@/components/ui/LoadingState";
import type { BCRAVariable, DataPoint } from "@/lib/bcra/types";
import { VARIABLES_CONFIG, GOVERNMENT_PERIODS } from "@/lib/bcra/constants";

interface HistoricoClientProps {
  variables: BCRAVariable[];
}

// ---- Period type --------------------------------------------------------
type HistoricoPeriod =
  | "30d" | "3m" | "6m" | "1y" | "3y" | "ytd" | "estacional" | "personalizado"
  | "milei" | "fernandez" | "macri" | "cfk2" | "cfk1" | "nk";

const TIME_PERIODS: { key: HistoricoPeriod; label: string }[] = [
  { key: "30d",         label: "30D" },
  { key: "3m",          label: "3M" },
  { key: "6m",          label: "6M" },
  { key: "1y",          label: "1A" },
  { key: "3y",          label: "3A" },
  { key: "ytd",         label: "YTD" },
  { key: "estacional",  label: "Estacional" },
  { key: "personalizado", label: "Personalizado" },
];

// ---- Date range helpers -------------------------------------------------
function getTimePeriodRange(period: HistoricoPeriod): { desde?: string; hasta?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().split("T")[0];

  switch (period) {
    case "30d": { const d = new Date(today); d.setDate(today.getDate() - 30);       return { desde: iso(d) }; }
    case "3m":  { const d = new Date(today); d.setMonth(today.getMonth() - 3);      return { desde: iso(d) }; }
    case "6m":  { const d = new Date(today); d.setMonth(today.getMonth() - 6);      return { desde: iso(d) }; }
    case "1y":  { const d = new Date(today); d.setFullYear(today.getFullYear() - 1); return { desde: iso(d) }; }
    case "3y":  { const d = new Date(today); d.setFullYear(today.getFullYear() - 3); return { desde: iso(d) }; }
    case "ytd": return { desde: `${today.getFullYear()}-01-01` };
    default:    return {};
  }
}

function getPeriodRange(
  period: HistoricoPeriod,
  customDesde: string,
  customHasta: string
): { desde?: string; hasta?: string; allTime?: boolean } {
  if (period === "estacional") return { allTime: true };
  if (period === "personalizado") return { desde: customDesde, hasta: customHasta };

  const gov = GOVERNMENT_PERIODS.find((g) => g.key === period);
  if (gov) return { desde: gov.desde, hasta: gov.hasta };

  return getTimePeriodRange(period);
}

// ---- Government button color map (active state) ------------------------
const govActiveClass: Record<string, string> = {
  milei:     "!bg-violet-600 !text-white",
  fernandez: "!bg-blue-600 !text-white",
  macri:     "!bg-amber-600 !text-white",
  cfk2:      "!bg-emerald-700 !text-white",
  cfk1:      "!bg-emerald-600 !text-white",
  nk:        "!bg-teal-600 !text-white",
};

// ---- Component ----------------------------------------------------------
export function HistoricoClient({ variables }: HistoricoClientProps) {
  const [selectedId, setSelectedId] = useState<number>(1); // Reservas por defecto
  const [period, setPeriod] = useState<HistoricoPeriod>("3y");
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [showTable, setShowTable] = useState(false);

  const selectedVar = variables.find((v) => v.idVariable === selectedId);
  const config = VARIABLES_CONFIG[selectedId];
  const isEstacional = period === "estacional";

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { desde, hasta, allTime } = getPeriodRange(period, customDesde, customHasta);

    // Require both dates for personalizado
    if (period === "personalizado" && (!desde || !hasta)) {
      setIsLoading(false);
      return;
    }

    try {
      const params: Record<string, string> = { limit: "3000" };
      if (!allTime) {
        if (desde) params.desde = desde;
        if (hasta) params.hasta = hasta;
      }

      const res = await fetch(
        `/api/bcra/variables/${selectedId}?${new URLSearchParams(params)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const detalle: DataPoint[] = [...(json.data?.detalle ?? [])].reverse();
      setData(detalle);
      setTotalCount(json.totalCount ?? detalle.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setIsLoading(false);
    }
  }, [selectedId, period, customDesde, customHasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cuando cambia la variable, mantener el período actual
  function handleVariableChange(id: number) {
    setSelectedId(id);
    setData([]);
  }

  return (
    <div className="space-y-6">
      {/* ======== FILTROS ======== */}
      <div className="card p-5 space-y-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>

        {/* Variable selector (searchable) */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Variable
          </label>
          <VariableCombobox
            variables={variables}
            selectedId={selectedId}
            onChange={handleVariableChange}
          />
        </div>

        {/* Period — tiempo */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Período
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  period === key
                    ? key === "estacional"
                      ? "bg-indigo-600 text-white"
                      : "bg-bcra-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Period — gobierno */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Por gobierno
          </label>
          <div className="flex flex-wrap gap-1.5">
            {GOVERNMENT_PERIODS.map((gov) => {
              const isActive = period === gov.key;
              return (
                <button
                  key={gov.key}
                  onClick={() => setPeriod(gov.key as HistoricoPeriod)}
                  title={`${gov.presidente} (${gov.desde}${gov.hasta ? " – " + gov.hasta : " – hoy"})`}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? govActiveClass[gov.key] ?? "bg-slate-700 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {gov.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom date inputs */}
        {period === "personalizado" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Desde
              </label>
              <input
                type="date"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Hasta
              </label>
              <input
                type="date"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {/* Info de la variable seleccionada */}
        {selectedVar && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Variable:</strong>{" "}
              {selectedVar.descripcion}
            </span>
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Unidad:</strong>{" "}
              {selectedVar.unidadExpresion}
            </span>
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Último valor:</strong>{" "}
              {selectedVar.ultValorInformado?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
            </span>
            <span>
              <strong className="text-slate-700 dark:text-slate-300">Registros cargados:</strong>{" "}
              {totalCount.toLocaleString("es-AR")}
            </span>
          </div>
        )}
      </div>

      {/* ======== GRÁFICO ======== */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            {isEstacional ? "Vista estacional" : "Evolución histórica"}
            {selectedVar && (
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
                — {config?.label ?? selectedVar.descripcion}
              </span>
            )}
          </h2>
          {isEstacional && (
            <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded font-medium">
              Superposición por año · Eje: ene–dic
            </span>
          )}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : isLoading ? (
          <ChartSkeleton height={isEstacional ? 380 : 300} />
        ) : isEstacional ? (
          <SeasonalChart
            data={data}
            color={config?.color ?? "#3b5bdb"}
            unit={config?.suffix ?? selectedVar?.unidadExpresion ?? ""}
            height={380}
          />
        ) : (
          <HistoricalChart
            data={data}
            color={config?.color ?? "#3b5bdb"}
            unit={config?.suffix ?? selectedVar?.unidadExpresion ?? ""}
            height={300}
          />
        )}
      </div>

      {/* ======== DATOS TABULARES (colapsable) ======== */}
      {!isEstacional && (
        <div className="card overflow-hidden">
          {/* Header / toggle */}
          <button
            onClick={() => setShowTable((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Datos tabulares
              {data.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                  {data.length.toLocaleString("es-AR")} registros
                </span>
              )}
            </h2>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${showTable ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Collapsible content */}
          {showTable && (
            <div className="px-6 pb-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              {error ? (
                <ErrorState message={error} onRetry={fetchData} />
              ) : (
                <DataTable
                  data={data}
                  variableName={selectedVar?.descripcion ?? ""}
                  variableId={selectedId}
                  unit={config?.suffix ?? selectedVar?.unidadExpresion ?? ""}
                  decimals={config?.decimals ?? 2}
                  isLoading={isLoading}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
