import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ONs — Lista completa",
};

export default function ONListPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/mercado"
          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          ← Volver a Mercado
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
          Obligaciones Negociables
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Lista completa de ONs corporativas disponibles en el mercado.
        </p>
      </div>

      <div className="card card-dark p-12 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-sm">
          Próximamente — tabla filtrable de ONs con TIR, duration y flujos de caja.
        </p>
      </div>
    </div>
  );
}
