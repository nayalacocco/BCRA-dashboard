import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchInflacionData } from "@/lib/indec/inflacion";
import { InflacionClient } from "./InflacionClient";
import { ChartSkeleton } from "@/components/ui/LoadingState";

export const metadata: Metadata = {
  title: "Inflación y Tasas",
  description: "IPC por componentes, expectativas REM, tasas de mercado — INDEC, BCRA y UTDT",
};

export const revalidate = 3600;

async function InflacionContent() {
  const data = await fetchInflacionData();
  return <InflacionClient data={data} />;
}

export default function InflacionPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-8 w-80 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
          <ChartSkeleton height={280} />
          <ChartSkeleton height={240} />
          <ChartSkeleton height={240} />
        </div>
      }
    >
      <InflacionContent />
    </Suspense>
  );
}
