"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { BCRAVariable } from "@/lib/bcra/types";
import { VARIABLES_CONFIG } from "@/lib/bcra/constants";

interface VariableComboboxProps {
  variables: BCRAVariable[];
  selectedId: number;
  onChange: (id: number) => void;
}

function getLabel(v: BCRAVariable): string {
  return VARIABLES_CONFIG[v.idVariable]?.label ?? v.descripcion;
}

export function VariableCombobox({ variables, selectedId, onChange }: VariableComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedVar = variables.find((v) => v.idVariable === selectedId);
  const selectedLabel = selectedVar ? getLabel(selectedVar) : "";

  // Filter by query
  const filtered = query.trim()
    ? variables.filter((v) => {
        const q = query.toLowerCase();
        return (
          getLabel(v).toLowerCase().includes(q) ||
          v.descripcion.toLowerCase().includes(q) ||
          String(v.idVariable).includes(q) ||
          v.categoria.toLowerCase().includes(q)
        );
      })
    : variables;

  function handleSelect(id: number) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setFocusedIndex(0);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[focusedIndex]) handleSelect(filtered[focusedIndex].idVariable);
        break;
      case "Escape":
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
        break;
    }
  }

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current || !open) return;
    const el = listRef.current.querySelector(`[data-idx="${focusedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, open]);

  // Reset focused index when query changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  // Close on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
      setQuery("");
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, handleOutsideClick]);

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar variable por nombre o ID…"
          className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-bcra-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        {/* Icon */}
        {open ? (
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ) : (
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">
              No se encontraron variables
            </div>
          ) : (
            filtered.map((v, i) => {
              const label = getLabel(v);
              const isSelected = v.idVariable === selectedId;
              const isFocused = i === focusedIndex;
              return (
                <div
                  key={v.idVariable}
                  data-idx={i}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur before click
                    handleSelect(v.idVariable);
                  }}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 text-sm transition-colors ${
                    isFocused
                      ? "bg-bcra-50 dark:bg-slate-700"
                      : ""
                  } ${
                    isSelected
                      ? "text-bcra-700 dark:text-blue-400 font-semibold"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 font-mono">
                    #{v.idVariable}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
