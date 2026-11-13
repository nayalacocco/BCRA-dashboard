"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HeatmapData, SerieKey } from "@/lib/inflacion/difusion-types";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fmtMes = (f: string) => `${MESES[parseInt(f.slice(5, 7), 10) - 1]} ${f.slice(2, 4)}`;
const fmt = (v: number, d = 1) => v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

type Orden = "division" | "peso" | "atraso";
const GRUPOS = ["Nacional", "GBA", "Pampeana", "Noreste", "Noroeste", "Cuyo", "Patagonia"];
/** Saturación de la escala: |r| ≥ 4 pp se pinta con el color pleno. */
const TOPE = 4;

function color(r: number | null): string {
  if (r == null) return "transparent";
  const x = Math.max(-1, Math.min(1, r / TOPE));
  const a = 0.08 + 0.87 * Math.abs(x);
  return x >= 0 ? `rgba(239,68,68,${a.toFixed(3)})` : `rgba(59,130,246,${a.toFixed(3)})`;
}

export function Heatmap({ serie, a, b }: { serie: SerieKey; a: number; b: number }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState(false);
  const [grupo, setGrupo] = useState("Nacional");
  const [orden, setOrden] = useState<Orden>("division");

  // Carga diferida: el JSON (~350 KB) se pide recién cuando el mapa se acerca a la pantalla
  const ancla = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ancla.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    fetch("/api/inflacion/heatmap")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: HeatmapData) => vivo && setData(j))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [visible]);

  const filas = useMemo(() => {
    if (!data) return [];
    const g = data.grupos[grupo];
    const out = g.items.map((it) => {
      const r = g[serie][it.id].slice(a, b + 1);
      // Σ r está en puntos log ×100: se convierte a variación % del precio relativo en el período
      const acum = (Math.exp(r.reduce<number>((s, x) => s + (x ?? 0), 0) / 100) - 1) * 100;
      return { ...it, r, acum };
    });
    if (orden === "peso") out.sort((x, y) => (y.peso ?? 0) - (x.peso ?? 0));
    else if (orden === "atraso") out.sort((x, y) => x.acum - y.acum);
    else out.sort((x, y) => x.codigo.localeCompare(y.codigo, "es", { numeric: true }));
    return out;
  }, [data, grupo, serie, a, b, orden]);

  if (error) return <p className="text-sm text-slate-400">Sin dato: no se pudo cargar el mapa de precios relativos.</p>;
  if (!data) return <div ref={ancla} className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />;

  const fechas = data.fechas.slice(a, b + 1);
  const n = fechas.length;
  const cada = Math.max(1, Math.ceil(n / 12));
  const cols = `minmax(150px, 230px) 44px repeat(${n}, minmax(3px, 1fr)) 56px`;

  const btn =
    "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 data-[active=true]:bg-bcra-600 data-[active=true]:text-white";

  return (
    <div className="card card-dark p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Región</span>
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {GRUPOS.map((g) => (
              <button key={g} className={btn} data-active={grupo === g} onClick={() => setGrupo(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Orden</span>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {([["division", "División"], ["peso", "Ponderador"], ["atraso", "Atraso acumulado"]] as [Orden, string][]).map(([key, label]) => (
              <button key={key} className={btn} data-active={orden === key} onClick={() => setOrden(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 mb-1">r_i,t = ln(1+π_i,t) − ln(1+π_t)</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Cada celda es la variación mensual del ítem menos la del nivel general (≈ puntos porcentuales).{" "}
        <span className="text-red-400">Rojo</span>: subió más que el promedio. <span className="text-blue-400">Azul</span>: subió menos.
        La columna «Acum.» es la variación % del precio relativo del ítem frente al nivel general en el período elegido: negativo = precio relativo atrasado. Escala saturada en ±{TOPE} pp.
        {serie === "sa" ? " Series desestacionalizadas." : ""} Fuente: INDEC · {fmtMes(fechas[n - 1])}.
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Encabezado */}
          <div className="grid items-end gap-px mb-1" style={{ gridTemplateColumns: cols }}>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Ítem</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-500 text-right pr-1">Pond.</span>
            {fechas.map((f, j) => (
              <span key={f} className="text-[9px] text-slate-500 whitespace-nowrap overflow-visible" style={{ width: 0 }}>
                {j % cada === 0 ? fmtMes(f) : ""}
              </span>
            ))}
            <span className="text-[10px] uppercase tracking-wide text-slate-500 text-right">Acum.</span>
          </div>

          {filas.map((it) => (
            <div key={it.id} className="grid items-center gap-px mb-px" style={{ gridTemplateColumns: cols }}>
              <span
                className={`text-[11px] truncate pr-2 ${it.residual ? "italic text-slate-500" : "text-slate-700 dark:text-slate-300"}`}
                title={`${it.codigo} · ${it.descripcion}${it.residual ? " (residuo derivado)" : ""}`}
              >
                {it.descripcion}
              </span>
              <span className="text-[10px] font-mono text-slate-500 text-right pr-1">{it.peso != null ? fmt(it.peso, 1) : ""}</span>
              {it.r.map((x, j) => (
                <span
                  key={j}
                  className="h-4 rounded-[1px]"
                  style={{ backgroundColor: color(x) }}
                  title={`${it.descripcion} · ${fmtMes(fechas[j])}: ${x == null ? "sin dato" : `${x > 0 ? "+" : ""}${fmt(x, 2)} pp`}`}
                />
              ))}
              <span className={`text-[11px] font-mono text-right ${it.acum < 0 ? "text-blue-400" : "text-red-400"}`}>
                {it.acum > 0 ? "+" : ""}
                {fmt(it.acum, 1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Escala */}
      <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-500">
        <span>−{TOPE} pp</span>
        <div className="h-2 w-40 rounded" style={{ background: `linear-gradient(to right, ${color(-TOPE)}, ${color(-1)}, ${color(0)}, ${color(1)}, ${color(TOPE)})` }} />
        <span>+{TOPE} pp</span>
        <span className="ml-3">Pond. = % de la canasta {grupo === "Nacional" ? "de las 27 aperturas" : "de la región"} (base dic-2016)</span>
      </div>
    </div>
  );
}
