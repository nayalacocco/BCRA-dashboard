"use client";

import { SparklineChart } from "./SparklineChart";
import type { BCRAVariable, DataPoint } from "@/lib/bcra/types";
import { VARIABLES_CONFIG } from "@/lib/bcra/constants";
import { formatValue, formatDate, calcChange } from "@/lib/bcra/format";

interface KPICardProps {
  variable: BCRAVariable;
  sparkData?: DataPoint[];
}

export function KPICard({ variable, sparkData = [] }: KPICardProps) {
  const config = VARIABLES_CONFIG[variable.idVariable];
  const label = config?.label ?? variable.descripcion;
  const color = config?.color ?? "#3b5bdb";
  const decimals = config?.decimals ?? 2;
  const prefix = config?.prefix ?? "";
  const suffix = config?.suffix ?? "";

  const value = variable.ultValorInformado;
  const fecha = variable.ultFechaInformada;

  // Variación respecto al punto anterior
  const { pct, direction } = sparkData.length >= 2
    ? calcChange(sparkData[sparkData.length - 1]?.valor, sparkData[sparkData.length - 2]?.valor)
    : { pct: null, direction: "neutral" as const };

  return (
    <div className="card card-dark p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            {prefix && (
              <span className="text-lg font-semibold text-slate-600">{prefix}</span>
            )}
            <span
              className="font-mono text-2xl font-bold tracking-tight"
              style={{ color }}
            >
              {value != null
                ? value.toLocaleString("es-AR", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                  })
                : "—"}
            </span>
            {suffix && (
              <span className="text-sm font-medium text-slate-500">{suffix}</span>
            )}
          </div>
        </div>

        {/* Variación badge */}
        {pct !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
              direction === "up"
                ? "bg-red-50 text-red-600"
                : direction === "down"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {direction === "up" ? "▲" : direction === "down" ? "▼" : "–"}
            {Math.abs(pct).toFixed(2)}%
          </div>
        )}
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <SparklineChart data={sparkData} color={color} />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{variable.unidadExpresion}</span>
        {fecha && <span>Al {formatDate(fecha)}</span>}
      </div>
    </div>
  );
}
