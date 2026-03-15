import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchSectorExternoData } from "@/lib/indec/sector-externo";
import { SectorExternoClient } from "./SectorExternoClient";
import { ChartSkeleton } from "@/components/ui/LoadingState";

export const metadata: Metadata = {
  title: "Sector Externo",
  description: "Balanza comercial, exportaciones e importaciones de Argentina — datos INDEC y BCRA",
};

// Datos mensuales — 1h de caché es suficiente
export const revalidate = 3600;

async function SectorExternoContent() {
  const data = await fetchSectorExternoData();
  return <SectorExternoClient data={data} />;
}

export default function SectorExternoPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-8 w-72 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
          <ChartSkeleton height={260} />
          <ChartSkeleton height={220} />
        </div>
      }
    >
      <SectorExternoContent />
    </Suspense>
  );
}
