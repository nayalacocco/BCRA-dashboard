"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartFrame } from "@/components/ds/Chart";
import { Control, Segmented } from "@/components/ds/Controls";
import { Formula } from "@/components/ds/Typography";
import { useTokens } from "@/components/theme/ThemeProvider";
import { diverging } from "@/design/tokens";
import { fmt, fmtMes, fmtSigno } from "@/lib/inflacion/formato";
import type { HeatmapData, SerieKey } from "@/lib/inflacion/difusion-types";

type Orden = "division" | "peso" | "atraso";
const GRUPOS = ["Nacional", "GBA", "Pampeana", "Noreste", "Noroeste", "Cuyo", "Patagonia"];
/** Saturación de la escala: |r| ≥ 4 pp se pinta con el color pleno. */
const TOPE = 4;

export function Heatmap({ serie, a, b, fuente }: { serie: SerieKey; a: number; b: number; fuente: string }) {
  const T = useTokens();
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
      { rootMargin: "300px" }
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

  const color = (r: number | null) => (r == null ? "transparent" : diverging(T, r / TOPE));
  const se = serie === "sa";

  if (error) return <p className="text-sm text-ds-muted border-t border-ds-head pt-3">Sin dato: no se pudo cargar el mapa de precios relativos.</p>;
  if (!data) return <div ref={ancla} className="h-64 border-t border-ds-head bg-ds-soft animate-pulse" />;

  const fechas = data.fechas.slice(a, b + 1);
  const n = fechas.length;
  const cada = Math.max(1, Math.ceil(n / 8));
  const cols = `minmax(150px, 230px) 44px repeat(${n}, minmax(3px, 1fr)) 60px`;
  const extremos = [...filas].sort((x, y) => x.acum - y.acum);
  const atrasado = extremos[0];
  const adelantado = extremos[extremos.length - 1];

  return (
    <ChartFrame
      title={`Precio relativo de cada ítem frente al nivel general, ${grupo}`}
      sub={
        atrasado && adelantado
          ? `Entre ${fmtMes(fechas[0])} y ${fmtMes(fechas[n - 1])}, el precio relativo más atrasado es ${atrasado.descripcion.toLowerCase()} (${fmtSigno(atrasado.acum)} %) y el más adelantado, ${adelantado.descripcion.toLowerCase()} (${fmtSigno(adelantado.acum)} %).`
          : undefined
      }
      source={`${fuente} Pond. = % de la canasta ${grupo === "Nacional" ? "de las 27 aperturas" : "de la región"} (base dic-2016).`}
      lastData={fmtMes(fechas[n - 1])}
      howTo={
        <>
          <p>
            Cada celda es la variación mensual del ítem menos la del nivel general (≈ puntos porcentuales){se ? ", con series desestacionalizadas" : ""}.
            Rojo: subió más que el promedio; azul: subió menos. Escala saturada en ±{TOPE} pp. «Acum.» es la variación % del precio relativo del
            ítem frente al nivel general en el período elegido: negativo = precio relativo atrasado.
          </p>
          <Formula>r_i,t = ln(1+π_i,t) − ln(1+π_t)</Formula>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 my-2">
        <Control label="Región">
          <Segmented ariaLabel="Región" value={grupo} onChange={setGrupo} options={GRUPOS.map((g) => ({ key: g, label: g }))} />
        </Control>
        <Control label="Orden">
          <Segmented
            ariaLabel="Orden"
            value={orden}
            onChange={setOrden}
            options={[
              { key: "division", label: "División" },
              { key: "peso", label: "Ponderador" },
              { key: "atraso", label: "Atraso acumulado" },
            ]}
          />
        </Control>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid items-end gap-px mb-1" style={{ gridTemplateColumns: cols }}>
            <span className="smallcaps text-ds-text-2">Ítem</span>
            <span className="smallcaps text-ds-text-2 text-right pr-1">Pond.</span>
            {fechas.map((f, j) => (
              <span key={f} className="text-[10px] text-ds-muted whitespace-nowrap overflow-visible" style={{ width: 0 }}>
                {j % cada === 0 ? fmtMes(f) : ""}
              </span>
            ))}
            <span className="smallcaps text-ds-text-2 text-right">Acum.</span>
          </div>

          {filas.map((it) => (
            <div key={it.id} className="grid items-center gap-px mb-px" style={{ gridTemplateColumns: cols }}>
              <span
                className={`text-[12px] truncate pr-2 ${it.residual ? "italic text-ds-muted" : "text-ds-text"}`}
                title={`${it.codigo} · ${it.descripcion}${it.residual ? " (residuo derivado)" : ""}`}
              >
                {it.descripcion}
              </span>
              <span className="tnum text-[11px] text-ds-muted text-right pr-1">{it.peso != null ? fmt(it.peso, 1) : ""}</span>
              {it.r.map((x, j) => (
                <span
                  key={j}
                  className="h-4"
                  style={{ backgroundColor: color(x) }}
                  title={`${it.descripcion} · ${fmtMes(fechas[j])}: ${x == null ? "sin dato" : `${fmtSigno(x, 2)} pp`}`}
                />
              ))}
              <span className="tnum text-[12px] text-right text-ds-text">{fmtSigno(it.acum)} %</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[11px] text-ds-muted">
        <span>Subió menos</span>
        <span className="tnum">−{TOPE} pp</span>
        <div
          className="h-2 w-40"
          style={{ background: `linear-gradient(to right, ${color(-TOPE)}, ${color(-TOPE / 2)}, ${color(0)}, ${color(TOPE / 2)}, ${color(TOPE)})` }}
        />
        <span className="tnum">+{TOPE} pp</span>
        <span>Subió más</span>
      </div>
    </ChartFrame>
  );
}
