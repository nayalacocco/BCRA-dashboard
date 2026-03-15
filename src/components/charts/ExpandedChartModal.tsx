"use client";

import { useEffect } from "react";
import { HistoricalChart } from "./HistoricalChart";
import { SeasonalChart } from "./SeasonalChart";
import type { DataPoint } from "@/lib/bcra/types";

interface ExpandedChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DataPoint[];
  isEstacional: boolean;
  color: string;
  unit: string;
  title: string;
  periodLabel: string;
  lastValue?: number;
  totalPoints?: number;
}

export function ExpandedChartModal({
  isOpen,
  onClose,
  data,
  isEstacional,
  color,
  unit,
  title,
  periodLabel,
  lastValue,
  totalPoints,
}: ExpandedChartModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/97 flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-bold text-slate-100 truncate">{title}</h2>
          <span className="text-xs font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded shrink-0">
            {periodLabel}
          </span>
          {isEstacional && (
            <span className="text-xs font-medium bg-indigo-900/50 text-indigo-400 px-2 py-0.5 rounded shrink-0">
              Estacional · ene=100
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0 ml-4">
          {/* Stats */}
          {lastValue != null && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
              <span>
                <strong className="text-slate-200">
                  {lastValue.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
                </strong>{" "}
                {unit}
              </span>
              {totalPoints != null && (
                <span>{totalPoints.toLocaleString("es-AR")} registros</span>
              )}
            </div>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-6 py-6">
        {isEstacional ? (
          <SeasonalChart
            data={data}
            color={color}
            unit={unit}
            height={580}
          />
        ) : (
          <HistoricalChart
            data={data}
            color={color}
            unit={unit}
            height={580}
          />
        )}
      </div>

      {/* Footer hint */}
      <div className="px-6 pb-4 shrink-0 text-center">
        <span className="text-xs text-slate-600">Presioná ESC para cerrar</span>
      </div>
    </div>
  );
}
