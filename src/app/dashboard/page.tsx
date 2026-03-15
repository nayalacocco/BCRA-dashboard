import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllVariables, getVariableHistorico } from "@/lib/bcra/client";
import { DASHBOARD_VARIABLE_IDS, VARIABLES_CONFIG } from "@/lib/bcra/constants";
import { KPICard } from "@/components/dashboard/KPICard";
import { HistoricalChart } from "@/components/charts/HistoricalChart";
import { CardSkeleton, ChartSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatDate } from "@/lib/bcra/format";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Indicadores económicos principales del BCRA",
};

export const revalidate = 3600; // ISR: revalidar cada hora

// ---- Server component que trae todos los datos ----

async function DashboardContent() {
  try {
    // Traer todas las variables para filtrar las del dashboard
    const allVariables = await getAllVariables();
    const dashboardVars = DASHBOARD_VARIABLE_IDS.map((id) =>
      allVariables.find((v) => v.idVariable === id)
    ).filter(Boolean);

    // Traer histórico de 30 días para sparklines (en paralelo)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const desde = thirtyDaysAgo.toISOString().split("T")[0];
    const hasta = today.toISOString().split("T")[0];

    const sparkDataResults = await Promise.allSettled(
      DASHBOARD_VARIABLE_IDS.map((id) =>
        getVariableHistorico(id, { desde, hasta, limit: 90 })
      )
    );

    const sparkDataMap = new Map<number, Array<{ fecha: string; valor: number }>>();
    sparkDataResults.forEach((result, index) => {
      const id = DASHBOARD_VARIABLE_IDS[index];
      if (result.status === "fulfilled") {
        // La API devuelve de más reciente a más antiguo — invertir para el gráfico
        const detalle = [...(result.value.data.detalle ?? [])].reverse();
        sparkDataMap.set(id, detalle);
      }
    });

    // Última actualización
    const lastUpdate = dashboardVars[0]?.ultFechaInformada;

    // Histórico extendido de USD Mayorista (90 días) para el chart principal
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const desdeExtended = ninetyDaysAgo.toISOString().split("T")[0];

    const usdHistorico = await getVariableHistorico(5, {
      desde: desdeExtended,
      hasta,
      limit: 365,
    });
    const usdData = [...(usdHistorico.data.detalle ?? [])].reverse();

    return (
      <>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Indicadores BCRA
              </h1>
              <p className="text-slate-500 mt-1 text-sm">
                Principales variables monetarias y cambiarias
              </p>
            </div>
            {lastUpdate && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Actualizado: {formatDate(lastUpdate)}
              </div>
            )}
          </div>
        </div>

        {/* KPI Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {dashboardVars.map((variable) => {
            if (!variable) return null;
            const sparkData = sparkDataMap.get(variable.idVariable) ?? [];
            return (
              <KPICard
                key={variable.idVariable}
                variable={variable}
                sparkData={sparkData}
              />
            );
          })}
        </div>

        {/* Gráfico USD Mayorista - 90 días */}
        <div className="card card-dark p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Tipo de Cambio Mayorista — Últimos 90 días
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Pesos argentinos por dólar estadounidense ($ por USD)
              </p>
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded font-mono">
              ID: 5
            </span>
          </div>
          <HistoricalChart
            data={usdData}
            color={VARIABLES_CONFIG[5]?.color ?? "#3b5bdb"}
            unit="ARS/USD"
            height={280}
          />
        </div>

        {/* Segunda fila de charts - Reservas e Inflación */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MiniChart
            idVariable={1}
            sparkData={sparkDataMap.get(1) ?? []}
            title="Reservas Internacionales — 30 días"
            unit="M USD"
          />
          <MiniChart
            idVariable={27}
            sparkData={sparkDataMap.get(27) ?? []}
            title="Inflación Mensual — Últimos datos"
            unit="%"
          />
        </div>

        {/* Info sobre data */}
        <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
          <p>
            <span className="font-semibold text-slate-700">Fuente:</span>{" "}
            API oficial del BCRA — Principales Variables v4.0.
            Los datos se actualizan automáticamente cada hora (ISR). Para actualización
            forzada usá el endpoint{" "}
            <code className="bg-slate-200 px-1 rounded text-xs font-mono">
              /api/cron/revalidate
            </code>
            .
          </p>
        </div>
      </>
    );
  } catch (error) {
    console.error("[Dashboard]", error);
    return (
      <ErrorState
        message="No se pudieron cargar los datos del BCRA. La API podría estar temporalmente no disponible."
      />
    );
  }
}

function MiniChart({
  idVariable,
  sparkData,
  title,
  unit,
}: {
  idVariable: number;
  sparkData: Array<{ fecha: string; valor: number }>;
  title: string;
  unit: string;
}) {
  const config = VARIABLES_CONFIG[idVariable];
  return (
    <div className="card card-dark p-6">
      <h3 className="font-semibold text-slate-900 mb-1 text-sm">{title}</h3>
      <HistoricalChart
        data={sparkData}
        color={config?.color ?? "#3b5bdb"}
        unit={unit}
        height={180}
      />
    </div>
  );
}

// ---- Page ----

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <ChartSkeleton height={280} />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
