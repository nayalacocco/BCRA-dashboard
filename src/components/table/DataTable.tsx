"use client";

import { useState, useMemo } from "react";
import type { DataPoint } from "@/lib/bcra/types";
import { formatDate, generateCSV, downloadFile } from "@/lib/bcra/format";

interface DataTableProps {
  data: DataPoint[];
  variableName: string;
  variableId: number;
  unit?: string;
  decimals?: number;
  isLoading?: boolean;
}

type SortDir = "asc" | "desc";

export function DataTable({
  data,
  variableName,
  variableId,
  unit = "",
  decimals = 2,
  isLoading = false,
}: DataTableProps) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 20;

  // Ordenar
  const sorted = useMemo(
    () =>
      [...data].sort((a, b) =>
        sortDir === "desc"
          ? b.fecha.localeCompare(a.fecha)
          : a.fecha.localeCompare(b.fecha)
      ),
    [data, sortDir]
  );

  // Filtrar por búsqueda (fecha)
  const filtered = useMemo(
    () =>
      search
        ? sorted.filter((d) => d.fecha.includes(search) || formatDate(d.fecha).includes(search))
        : sorted,
    [sorted, search]
  );

  // Paginar
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort() {
    setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    setPage(1);
  }

  function handleExportCSV() {
    const csv = generateCSV(
      filtered.map((d) => ({
        fecha: formatDate(d.fecha),
        fecha_iso: d.fecha,
        valor: d.valor,
        variable: variableName,
        id_variable: variableId,
        unidad: unit,
      })),
      [
        { key: "fecha", label: "Fecha" },
        { key: "fecha_iso", label: "Fecha ISO" },
        { key: "valor", label: "Valor" },
        { key: "variable", label: "Variable" },
        { key: "id_variable", label: "ID Variable" },
        { key: "unidad", label: "Unidad" },
      ]
    );
    const filename = `bcra_${variableId}_${new Date().toISOString().split("T")[0]}.csv`;
    downloadFile(csv, filename);
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filtrar por fecha (ej: 2025-12)"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-bcra-500 w-56"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setPage(1); }}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {filtered.length.toLocaleString("es-AR")} registros
          </span>
          <button
            onClick={handleExportCSV}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th
                className="text-left px-4 py-3 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none"
                onClick={toggleSort}
              >
                <div className="flex items-center gap-1">
                  Fecha
                  <span className="text-slate-400">
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                </div>
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                Valor
              </th>
              {unit && (
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">
                  Unidad
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-slate-400 text-sm">
                  No se encontraron datos para el filtro aplicado
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr
                  key={row.fecha}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    i === 0 ? "font-medium" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {formatDate(row.fecha)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                    {row.valor.toLocaleString("es-AR", {
                      minimumFractionDigits: decimals,
                      maximumFractionDigits: decimals,
                    })}
                  </td>
                  {unit && (
                    <td className="px-4 py-3 text-slate-400 text-xs">{unit}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >
              ‹ Ant.
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >
              Sig. ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-xs"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
