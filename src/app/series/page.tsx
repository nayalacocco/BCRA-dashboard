import type { Metadata } from "next";
import { getAllVariables } from "@/lib/bcra/client";
import { SeriesClient } from "./SeriesClient";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata: Metadata = {
  title: "Comparador de Series",
  description: "Compará múltiples series del BCRA y calculá ratios entre variables",
};

export const revalidate = 1800; // ISR: revalidar cada 30 minutos

export default async function SeriesPage() {
  try {
    const allVariables = await getAllVariables();
    const availableVariables = allVariables.filter(
      (v) => v.ultValorInformado != null && v.primerFechaInformada
    );

    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Comparador de Series</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Visualizá y comparás múltiples variables del BCRA. Calculá ratios entre indicadores.
          </p>
        </div>

        <SeriesClient variables={availableVariables} />
      </div>
    );
  } catch (error) {
    console.error("[Series]", error);
    return (
      <div className="py-12">
        <ErrorState message="No se pudo cargar el listado de variables del BCRA." />
      </div>
    );
  }
}
