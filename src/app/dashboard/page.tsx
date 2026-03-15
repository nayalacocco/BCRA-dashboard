import type { Metadata } from "next";
import { Suspense } from "react";
import { getAllVariables, getVariableHistorico } from "@/lib/bcra/client";
import { EXTENDED_DASHBOARD_IDS } from "@/lib/bcra/constants";
import { DashboardClient, type HistoricPoint } from "./DashboardClient";
import { ChartSkeleton } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/lib/bcra/format";
import { saveToKV, loadFromKV } from "@/lib/bcra/kv-cache";
import { fetchDashboardIndecData } from "@/lib/indec/client";

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
  // INDEC siempre se fetcha independientemente del estado del BCRA
  const indecPromise = fetchDashboardIndecData();

  let latestValues: Record<number, { valor: number; fecha: string } | null> = {};
  let historicData: Record<number, HistoricPoint[]> = {};
  let pageGeneratedAt: string | null = null;
  let lastBCRAUpdate: string | undefined;
  let bcraOk = false;

  try {
    // 1. Últimos valores de todas las variables BCRA
    const allVariables = await getAllVariables();

    for (const v of allVariables) {
      latestValues[v.idVariable] =
        v.ultValorInformado != null && v.ultFechaInformada != null
          ? { valor: v.ultValorInformado, fecha: v.ultFechaInformada }
          : null;
    }

    const missingIds = EXTENDED_DASHBOARD_IDS.filter((id) => latestValues[id] == null);
    if (missingIds.length > 0) {
      console.warn("[Dashboard] IDs no encontrados en allVariables:", missingIds);
    }

    // 2. Histórico BCRA en paralelo con la espera de INDEC
    const historicResults = await Promise.allSettled(
      HISTORIC_IDS.map((id) => getVariableHistorico(id, { limit: 2000 }))
    );

    historicResults.forEach((result, index) => {
      const id = HISTORIC_IDS[index];
      if (result.status === "fulfilled") {
        historicData[id] = [...(result.value.data.detalle ?? [])].reverse();
      } else {
        historicData[id] = [];
        console.error(`[Dashboard] Error fetching historico ID ${id}:`, result.reason);
      }
    });

    pageGeneratedAt = formatDateTime(new Date());
    lastBCRAUpdate =
      allVariables.find((v) => v.idVariable === 1)?.ultFechaInformada ??
      allVariables[0]?.ultFechaInformada;

    bcraOk = true;
  } catch (error) {
    console.error("[Dashboard] BCRA API error:", error);

    // Intentar recuperar BCRA desde KV cache
    const cached = await loadFromKV();
    if (cached) {
      console.log("[Dashboard] Serving BCRA from KV cache:", cached.savedAt);
      latestValues = cached.latestValues as Record<number, { valor: number; fecha: string } | null>;
      historicData = cached.historicData as Record<number, HistoricPoint[]>;
      pageGeneratedAt = cached.savedAt;
      lastBCRAUpdate = cached.lastBCRAUpdate;
    }
    // Si no hay KV cache, latestValues/historicData quedan vacíos — los cards muestran "—"
  }

  // Resolver INDEC siempre (puede haber terminado mientras esperábamos BCRA)
  const indecData = await indecPromise;

  // Persistir en KV si BCRA anduvo bien
  if (bcraOk) {
    await saveToKV({ latestValues, historicData, lastBCRAUpdate, indecData });
  }

  return (
    <DashboardClient
      latestValues={latestValues}
      historicData={historicData}
      pageGeneratedAt={pageGeneratedAt}
      lastBCRAUpdate={lastBCRAUpdate}
      indecData={indecData}
    />
  );
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
