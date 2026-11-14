/**
 * Waterfalls de reservas netas para cualquier fecha de la serie (misma lógica que pipeline/fx/reservas.py).
 * Los datos diarios (brutas, encajes, depósitos del Tesoro) se combinan con los componentes mensuales de la
 * última planilla NEDD-FMI disponible a esa fecha.
 */
import type { FilaDiaria, FilaMensual } from "./types";

export type Perimetro = "A" | "B";

export interface Linea {
  id: string;
  tipo: "base" | "resta" | "total";
  monto: number;
  /** Fecha del dato de este componente. */
  fecha: string;
}

export const ROTULO: Record<string, { corto: string; largo: string }> = {
  brutas: { corto: "Brutas", largo: "Reservas brutas" },
  encajes: { corto: "Encajes", largo: "Encajes en USD (depósitos de entidades en el BCRA)" },
  swaps: { corto: "Swaps", largo: "Swaps de monedas (línea completa con China y otros activados)" },
  pases: { corto: "Pases", largo: "Pases en ME con bancos, ≤ 12 meses" },
  swaps_pases: { corto: "Swaps+pases", largo: "Swap con China y pases (agrupados en la planilla)" },
  netas_a: { corto: "Netas", largo: "Reservas netas BCRA" },
  otros_bcra: { corto: "Otros ≤12m", largo: "BOPREAL, organismos y otros pasivos del BCRA, ≤ 12 meses" },
  otros_bcra_mas_tesoro: { corto: "Otros+Tes.", largo: "BOPREAL, organismos, otros pasivos del BCRA y depósitos del Tesoro" },
  dep_tesoro: { corto: "Dep. Tes.", largo: "Depósitos en USD del Tesoro en el BCRA" },
  super_a: { corto: "Super netas", largo: "Reservas super netas BCRA" },
  deuda_tesoro_12m: { corto: "Deuda Tes.", largo: "Deuda en ME del Tesoro, vencimientos ≤ 12 meses" },
  netas_b: { corto: "Consolid.", largo: "Reservas netas consolidadas (BCRA + Tesoro)" },
};

export const TOTAL_PERIMETRO: Record<Perimetro, "super_a" | "netas_b"> = { A: "super_a", B: "netas_b" };

/** Fila diaria o mensual + componentes mensuales → líneas del waterfall. Devuelve null si el perímetro no se puede calcular. */
export function waterfall(
  fila: { f: string; brutas: number; encajes: number | null; dep_tesoro: number | null },
  comp: FilaMensual,
  per: Perimetro
): Linea[] | null {
  if (fila.encajes == null) return null;
  const L: Linea[] = [];
  let acum = fila.brutas;
  L.push({ id: "brutas", tipo: "base", monto: fila.brutas, fecha: fila.f });
  const resta = (id: string, monto: number, fecha: string) => {
    L.push({ id, tipo: "resta", monto, fecha });
    acum -= monto;
  };
  resta("encajes", fila.encajes, fila.f);
  if (comp.agrupado) resta("swaps_pases", comp.swaps + comp.pases, comp.f);
  else {
    resta("swaps", comp.swaps, comp.f);
    resta("pases", comp.pases, comp.f);
  }
  L.push({ id: "netas_a", tipo: "total", monto: acum, fecha: fila.f });
  if (per === "A") {
    if (comp.otros_bcra != null && fila.dep_tesoro != null) {
      resta("otros_bcra", comp.otros_bcra, comp.f);
      resta("dep_tesoro", fila.dep_tesoro, fila.f);
    } else if (comp.otros_bcra == null) {
      resta("otros_bcra_mas_tesoro", comp.otros_bcra_mas_tesoro, comp.f);
    } else return null;
    L.push({ id: "super_a", tipo: "total", monto: acum, fecha: fila.f });
  } else {
    if (comp.otros_bcra == null) return null;
    resta("otros_bcra", comp.otros_bcra, comp.f);
    resta("deuda_tesoro_12m", comp.deuda_tesoro_12m, comp.f);
    L.push({ id: "netas_b", tipo: "total", monto: acum, fecha: fila.f });
  }
  return L;
}

/** Fila mensual cuyos componentes rigen para una fila diaria. */
export function componentesDe(fila: FilaDiaria, mensual: FilaMensual[]): FilaMensual | undefined {
  return mensual.find((m) => m.f === fila.planilla);
}
