import type { Metadata } from "next";
import { getAllVariables } from "@/lib/bcra/client";
import { HistoricoClient } from "./HistoricoClient";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata: Metadata = {
  title: "Histórico",
  description: "Serie histórica filtrable de variables del BCRA con exportación CSV",
};

export const revalidate = 3600;

export default async function HistoricoPage() {
  try {
    const allVariables = await getAllVariables();

    // Filtrar solo las que tienen datos disponibles
    const availableVariables = allVariables.filter(
      (v) => v.ultValorInformado != null && v.primerFechaInformada
    );

    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Histórico de Variables</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Seleccioná una variable y un período para ver la evolución histórica y exportar datos.
          </p>
        </div>

        <HistoricoClient variables={availableVariables} />
      </div>
    );
  } catch (error) {
    console.error("[Histórico]", error);
    return (
      <div className="py-12">
        <ErrorState message="No se pudo cargar el listado de variables del BCRA." />
      </div>
    );
  }
}
