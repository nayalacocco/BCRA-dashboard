import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllVariables, getVariableHistorico } from "@/lib/bcra/client";
import { EXTENDED_DASHBOARD_IDS } from "@/lib/bcra/constants";
import { DashboardClient, type HistoricPoint } from "./DashboardClient";
import { ChartSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatDateTime } from "@/lib/bcra/format";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Indicadores económicos principales del BCRA",
};

// ISR: revalidar cada 30 minutos
export const revalidate = 1800;

// ---- Variables que tienen histórico extendido ----
// IDs para los que buscamos hasta 2000 puntos (≈6 años de días hábiles)
const HISTORIC_IDS = [1, 5, 4, 15, 109, 78, 27, 28, 29, 7];

async function DashboardContent() {
  try {
    // 1. Últimos valores de todas las variables
    const allVariables = await getAllVariables();

    // Construir mapa de últimos valores
    const latestValues: Record<number, { valor: number; fecha: string } | null> = {};
    for (const v of allVariables) {
      latestValues[v.idVariable] =
        v.ultValorInformado != null && v.ultFechaInformada != null
          ? { valor: v.ultValorInformado, fecha: v.ultFechaInformada }
          : null;
    }

    // Asegurarnos de que tenemos los IDs del dashboard extendido
    const missingIds = EXTENDED_DASHBOARD_IDS.filter(
      (id) => latestValues[id] == null
    );
    if (missingIds.length > 0) {
      console.warn("[Dashboard] IDs no encontrados en allVariables:", missingIds);
    }

    // 2. Histórico extendido para los IDs clave (en paralelo)
    const historicResults = await Promise.allSettled(
      HISTORIC_IDS.map((id) =>
        getVariableHistorico(id, { limit: 2000 })
      )
    );

    const historicData: Record<number, HistoricPoint[]> = {};
    historicResults.forEach((result, index) => {
      const id = HISTORIC_IDS[index];
      if (result.status === "fulfilled") {
        // La API devuelve de reciente → antiguo; invertir para gráficos (antiguo → reciente)
        const detalle = [...(result.value.data.detalle ?? [])].reverse();
        historicData[id] = detalle;
      } else {
        historicData[id] = [];
        console.error(`[Dashboard] Error fetching historico ID ${id}:`, result.reason);
      }
    });

    // 3. Metadata de página
    const pageGeneratedAt = formatDateTime(new Date());
    const lastBCRAUpdate =
      allVariables.find((v) => v.idVariable === 1)?.ultFechaInformada ??
      allVariables[0]?.ultFechaInformada;

    return (
      <DashboardClient
        latestValues={latestValues}
        historicData={historicData}
        pageGeneratedAt={pageGeneratedAt}
        lastBCRAUpdate={lastBCRAUpdate}
      />
    );
  } catch (error) {
    console.error("[Dashboard]", error);
    return (
      <ErrorState message="No se pudieron cargar los datos del BCRA. La API podría estar temporalmente no disponible." />
    );
  }
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <ChartSkeleton height={260} />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
