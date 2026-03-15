"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
import { HistoricalChart } from "@/components/charts/HistoricalChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChartSkeleton } from "@/components/ui/LoadingState";
import type { BCRAVariable, DataPoint } from "@/lib/bcra/types";
import { VARIABLES_CONFIG } from "@/lib/bcra/constants";

interface HistoricoClientProps {
  variables: BCRAVariable[];
}

// Rango de fechas predefinidos
const DATE_RANGES = [
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "6 meses", days: 180 },
  { label: "1 año", days: 365 },
  { label: "3 años", days: 365 * 3 },
  { label: "Personalizado", days: 0 },
];

function getDateRange(days: number) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - days);
  return {
    desde: from.toISOString().split("T")[0],
    hasta: today.toISOString().split("T")[0],
  };
}

export function HistoricoClient({ variables }: HistoricoClientProps) {
  const [selectedId, setSelectedId] = useState<number>(5); // USD Mayorista por defecto
  const [rangeDays, setRangeDays] = useState<number>(90);
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const selectedVar = variables.find((v) => v.idVariable === selectedId);
  const config = VARIABLES_CONFIG[selectedId];

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const isCustom = rangeDays === 0;
    const { desde, hasta } = isCustom
      ? { desde: customDesde, hasta: customHasta }
      : getDateRange(rangeDays);

    if (isCustom && (!desde || !hasta)) {
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        desde,
        hasta,
        limit: "3000",
      });
      const res = await fetch(`/api/bcra/variables/${selectedId}?${params}`);
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
  }, [selectedId, rangeDays, customDesde, customHasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="card card-dark p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Filtros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Selector de variable */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Variable
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white"
            >
              {variables.map((v) => {
                const cfg = VARIABLES_CONFIG[v.idVariable];
                const label = cfg?.label ?? v.descripcion;
                return (
                  <option key={v.idVariable} value={v.idVariable}>
                    [{v.idVariable}] {label} — {v.categoria}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selector de rango */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Período
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_RANGES.map(({ label, days }) => (
                <button
                  key={label}
                  onClick={() => setRangeDays(days)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    rangeDays === days
                      ? "bg-bcra-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fechas personalizadas */}
          {rangeDays === 0 && (
            <div className="sm:col-span-2 lg:col-span-1 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Desde
                </label>
                <input
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Info de la variable seleccionada */}
        {selectedVar && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              <strong className="text-slate-700">Variable:</strong> {selectedVar.descripcion}
            </span>
            <span>
              <strong className="text-slate-700">Unidad:</strong> {selectedVar.unidadExpresion}
            </span>
            <span>
              <strong className="text-slate-700">Último valor:</strong>{" "}
              {selectedVar.ultValorInformado?.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
            </span>
            <span>
              <strong className="text-slate-700">Total disponible:</strong>{" "}
              {totalCount.toLocaleString("es-AR")} registros
            </span>
          </div>
        )}
      </div>

      {/* Gráfico */}
      <div className="card card-dark p-6">
        <h2 className="font-semibold text-slate-900 mb-4">
          Evolución histórica
          {selectedVar && (
            <span className="text-sm font-normal text-slate-500 ml-2">
              — {config?.label ?? selectedVar.descripcion}
            </span>
          )}
        </h2>

        {error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : isLoading ? (
          <ChartSkeleton height={300} />
        ) : (
          <HistoricalChart
            data={data}
            color={config?.color ?? "#3b5bdb"}
            unit={config?.suffix ?? selectedVar?.unidadExpresion ?? ""}
            height={300}
          />
        )}
      </div>

      {/* Tabla */}
      <div className="card card-dark p-6">
        <h2 className="font-semibold text-slate-900 mb-4">
          Datos tabulares
        </h2>

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
    </div>
  );
}
