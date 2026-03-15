import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchMercadoData } from "@/lib/mae/mercado";
import { MercadoClient } from "./MercadoClient";
import { ChartSkeleton } from "@/components/ui/LoadingState";

export const metadata: Metadata = {
  title: "Mercado",
  description: "Repos MAE, renta fija, cauciones bursátiles y FX de mercado — Mercado Abierto Electrónico",
};

// Market data changes intraday — revalidate every 5 minutes
export const revalidate = 300;

async function MercadoContent() {
  const data = await fetchMercadoData();
  return <MercadoClient data={data} />;
}

export default function MercadoPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
          <ChartSkeleton height={280} />
          <ChartSkeleton height={200} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <MercadoContent />
    </Suspense>
  );
}
