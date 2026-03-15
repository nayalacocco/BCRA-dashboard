"use client";

import { useState, useEffect, useCallback } from "react";
import { SeriesComparator } from "@/components/charts/SeriesComparator";
import { RatioChart } from "@/components/charts/RatioChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChartSkeleton } from "@/components/ui/LoadingState";
import type { BCRAVariable, SerieData, DataPoint } from "@/lib/bcra/types";
import { VARIABLES_CONFIG, CHART_COLORS } from "@/lib/bcra/constants";
import { calcRatioSeries, generateCSV, downloadFile, formatDate } from "@/lib/bcra/format";

interface SeriesClientProps {
  variables: BCRAVariable[];
}

const DATE_RANGES = [
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "6 meses", days: 180 },
  { label: "1 año", days: 365 },
  { label: "2 años", days: 730 },
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

async function fetchSerie(id: number, desde: string, hasta: string): Promise<DataPoint[]> {
  const params = new URLSearchParams({ desde, hasta, limit: "3000" });
  const res = await fetch(`/api/bcra/historico/${id}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} para variable ${id}`);
  const json = await res.json();
  return [...(json.data?.detalle ?? [])].reverse();
}

export function SeriesClient({ variables }: SeriesClientProps) {
  // ---- Estado del comparador ----
  const [selectedIds, setSelectedIds] = useState<number[]>([5, 1]); // USD + Reservas
  const [rangeDays, setRangeDays] = useState(90);
  const [normalized, setNormalized] = useState(false);
  const [seriesData, setSeriesData] = useState<Map<number, DataPoint[]>>(new Map());
  const [loadingComp, setLoadingComp] = useState(false);
  const [errorComp, setErrorComp] = useState<string | null>(null);

  // ---- Estado del ratio builder ----
  const [ratioNum, setRatioNum] = useState<number>(5);  // Numerador
  const [ratioDen, setRatioDen] = useState<number>(1);  // Denominador
  const [ratioRangeDays, setRatioRangeDays] = useState(365);
  const [ratioData, setRatioData] = useState<ReturnType<typeof calcRatioSeries>>([]);
  const [loadingRatio, setLoadingRatio] = useState(false);
  const [errorRatio, setErrorRatio] = useState<string | null>(null);

  // ---- Cargar datos del comparador ----
  const fetchComparadorData = useCallback(async () => {
    if (!selectedIds.length) return;
    setLoadingComp(true);
    setErrorComp(null);

    const { desde, hasta } = getDateRange(rangeDays);

    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => fetchSerie(id, desde, hasta))
      );

      const newMap = new Map<number, DataPoint[]>();
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          newMap.set(selectedIds[i], r.value);
        }
      });
      setSeriesData(newMap);
    } catch (err) {
      setErrorComp(err instanceof Error ? err.message : "Error al cargar series");
    } finally {
      setLoadingComp(false);
    }
  }, [selectedIds, rangeDays]);

  // ---- Cargar datos del ratio ----
  const fetchRatioData = useCallback(async () => {
    setLoadingRatio(true);
    setErrorRatio(null);
    const { desde, hasta } = getDateRange(ratioRangeDays);

    try {
      const [numData, denData] = await Promise.all([
        fetchSerie(ratioNum, desde, hasta),
        fetchSerie(ratioDen, desde, hasta),
      ]);
      const ratio = calcRatioSeries(numData, denData);
      setRatioData(ratio);
    } catch (err) {
      setErrorRatio(err instanceof Error ? err.message : "Error al calcular ratio");
    } finally {
      setLoadingRatio(false);
    }
  }, [ratioNum, ratioDen, ratioRangeDays]);

  useEffect(() => { fetchComparadorData(); }, [fetchComparadorData]);
  useEffect(() => { fetchRatioData(); }, [fetchRatioData]);

  // Construir SerieData array para el comparador
  const series: SerieData[] = selectedIds
    .map((id, i) => {
      const v = variables.find((v) => v.idVariable === id);
      const config = VARIABLES_CONFIG[id];
      if (!v) return null;
      return {
        idVariable: id,
        descripcion: v.descripcion,
        label: config?.label ?? v.descripcion,
        color: config?.color ?? CHART_COLORS[i % CHART_COLORS.length],
        unidad: config?.suffix ?? v.unidadExpresion,
        datos: seriesData.get(id) ?? [],
      };
    })
    .filter(Boolean) as SerieData[];

  function toggleVariable(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 6
        ? prev // máximo 6 series
        : [...prev, id]
    );
  }

  function handleExportCSV() {
    const rows: Record<string, string | number>[] = [];
    series.forEach((s) => {
      s.datos.forEach((d) => {
        rows.push({
          fecha: formatDate(d.fecha),
          fecha_iso: d.fecha,
          variable: s.label,
          id_variable: s.idVariable,
          unidad: s.unidad,
          valor: d.valor,
        });
      });
    });
    rows.sort((a, b) => String(a.fecha_iso).localeCompare(String(b.fecha_iso)));

    const csv = generateCSV(rows, [
      { key: "fecha", label: "Fecha" },
      { key: "variable", label: "Variable" },
      { key: "valor", label: "Valor" },
      { key: "unidad", label: "Unidad" },
      { key: "id_variable", label: "ID Variable" },
    ]);
    downloadFile(csv, `bcra_series_${new Date().toISOString().split("T")[0]}.csv`);
  }

  const varNum = variables.find((v) => v.idVariable === ratioNum);
  const varDen = variables.find((v) => v.idVariable === ratioDen);

  return (
    <div className="space-y-8">
      {/* ======== SECCIÓN 1: COMPARADOR DE SERIES ======== */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Comparador de Series</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Seleccioná hasta 6 variables para comparar su evolución
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={!series.length || loadingComp}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar CSV
          </button>
        </div>

        <div className="card card-dark p-5 mb-4">
          {/* Controles del comparador */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* Período */}
            <div>
              <span className="text-xs font-medium text-slate-600 block mb-1.5">Período</span>
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

            {/* Normalizar toggle */}
            <div className="ml-auto">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setNormalized((n) => !n)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    normalized ? "bg-bcra-600" : "bg-slate-200"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      normalized ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600">
                  Base 100 (normalizado)
                </span>
              </label>
            </div>
          </div>

          {/* Selector de variables */}
          <div className="mb-4">
            <span className="text-xs font-medium text-slate-600 block mb-2">
              Variables seleccionadas ({selectedIds.length}/6)
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
              {variables.slice(0, 50).map((v) => {
                const cfg = VARIABLES_CONFIG[v.idVariable];
                const label = cfg?.label ?? `ID ${v.idVariable}`;
                const isSelected = selectedIds.includes(v.idVariable);
                return (
                  <button
                    key={v.idVariable}
                    onClick={() => toggleVariable(v.idVariable)}
                    style={
                      isSelected
                        ? { backgroundColor: cfg?.color + "20", borderColor: cfg?.color, color: cfg?.color }
                        : undefined
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? "border-current"
                        : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {isSelected && "✓ "}{label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gráfico */}
          {errorComp ? (
            <ErrorState message={errorComp} onRetry={fetchComparadorData} />
          ) : loadingComp ? (
            <ChartSkeleton height={360} />
          ) : (
            <SeriesComparator
              series={series}
              normalized={normalized}
              height={360}
            />
          )}
        </div>
      </section>

      {/* ======== SECCIÓN 2: RATIO BUILDER ======== */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Ratio Builder</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Calculá el cociente entre dos variables a lo largo del tiempo
          </p>
        </div>

        <div className="card card-dark p-5">
          {/* Controles del ratio */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Numerador */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Numerador (A)
              </label>
              <select
                value={ratioNum}
                onChange={(e) => setRatioNum(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white"
              >
                {variables.slice(0, 50).map((v) => {
                  const cfg = VARIABLES_CONFIG[v.idVariable];
                  return (
                    <option key={v.idVariable} value={v.idVariable}>
                      [{v.idVariable}] {cfg?.label ?? v.descripcion}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Denominador */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Denominador (B)
              </label>
              <select
                value={ratioDen}
                onChange={(e) => setRatioDen(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white"
              >
                {variables.slice(0, 50).map((v) => {
                  const cfg = VARIABLES_CONFIG[v.idVariable];
                  return (
                    <option key={v.idVariable} value={v.idVariable}>
                      [{v.idVariable}] {cfg?.label ?? v.descripcion}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Período */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Período
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DATE_RANGES.map(({ label, days }) => (
                  <button
                    key={label}
                    onClick={() => setRatioRangeDays(days)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      ratioRangeDays === days
                        ? "bg-bcra-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Label del ratio */}
          <div className="mb-4 p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-600">
              <strong className="text-slate-900">Ratio:</strong>{" "}
              <span className="font-mono text-bcra-700">
                {VARIABLES_CONFIG[ratioNum]?.label ?? varNum?.descripcion ?? `ID ${ratioNum}`}
              </span>
              {" / "}
              <span className="font-mono text-bcra-700">
                {VARIABLES_CONFIG[ratioDen]?.label ?? varDen?.descripcion ?? `ID ${ratioDen}`}
              </span>
            </span>
            {ratioData.length > 0 && (
              <span className="ml-4 text-xs text-slate-500">
                Último:{" "}
                <strong className="text-slate-700 font-mono">
                  {ratioData[ratioData.length - 1]?.ratio.toLocaleString("es-AR", {
                    maximumFractionDigits: 6,
                  })}
                </strong>
              </span>
            )}
          </div>

          {/* Gráfico del ratio */}
          {errorRatio ? (
            <ErrorState message={errorRatio} onRetry={fetchRatioData} />
          ) : loadingRatio ? (
            <ChartSkeleton height={280} />
          ) : (
            <RatioChart
              data={ratioData}
              numeradorLabel={VARIABLES_CONFIG[ratioNum]?.label ?? `ID ${ratioNum}`}
              denominadorLabel={VARIABLES_CONFIG[ratioDen]?.label ?? `ID ${ratioDen}`}
              height={280}
            />
          )}

          {/* Export del ratio */}
          {ratioData.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  const numLabel = VARIABLES_CONFIG[ratioNum]?.label ?? `var_${ratioNum}`;
                  const denLabel = VARIABLES_CONFIG[ratioDen]?.label ?? `var_${ratioDen}`;
                  const csv = generateCSV(
                    ratioData.map((d) => ({
                      fecha: formatDate(d.fecha),
                      fecha_iso: d.fecha,
                      ratio: d.ratio,
                      numerador: d.numerador,
                      denominador: d.denominador,
                    })),
                    [
                      { key: "fecha", label: "Fecha" },
                      { key: "ratio", label: `Ratio (${numLabel}/${denLabel})` },
                      { key: "numerador", label: numLabel },
                      { key: "denominador", label: denLabel },
                    ]
                  );
                  downloadFile(
                    csv,
                    `bcra_ratio_${ratioNum}_vs_${ratioDen}_${new Date().toISOString().split("T")[0]}.csv`
                  );
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar Ratio CSV
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
