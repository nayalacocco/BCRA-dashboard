/**
 * argentinadatos.com — historical daily FX rates for Argentina (ARS per USD).
 * Free, no auth required.
 *
 * Endpoints:
 *   GET /v1/cotizaciones/dolares/{tipo}
 *   → [{ fecha: "YYYY-MM-DD", compra: number | null, venta: number | null }]
 *
 * Available tipos:
 *   oficial, mayorista, bolsa (MEP), contadoconliqui (CCL), blue, cripto
 */

const BASE = "https://api.argentinadatos.com/v1";

export interface ArgDatosPoint {
  fecha: string;         // "YYYY-MM-DD"
  compra: number | null;
  venta: number | null;
}

const FX_ENDPOINTS: Record<FxKey, string> = {
  oficial:   "oficial",
  mayorista: "mayorista",
  mep:       "bolsa",
  ccl:       "contadoconliqui",
  blue:      "blue",
  cripto:    "cripto",
};

export type FxKey = "oficial" | "mayorista" | "mep" | "ccl" | "blue" | "cripto";

export interface AllFxHistorico {
  oficial:   ArgDatosPoint[];
  mayorista: ArgDatosPoint[];
  mep:       ArgDatosPoint[];
  ccl:       ArgDatosPoint[];
  blue:      ArgDatosPoint[];
  cripto:    ArgDatosPoint[];
}

async function fetchTipo(tipo: string): Promise<ArgDatosPoint[]> {
  const res = await fetch(`${BASE}/cotizaciones/dolares/${tipo}`, {
    headers: { "Accept": "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`argentinadatos ${res.status} — ${tipo}`);
  return res.json();
}

export async function fetchAllFxHistorico(): Promise<AllFxHistorico> {
  const [oficial, mayorista, mep, ccl, blue, cripto] = await Promise.allSettled([
    fetchTipo(FX_ENDPOINTS.oficial),
    fetchTipo(FX_ENDPOINTS.mayorista),
    fetchTipo(FX_ENDPOINTS.mep),
    fetchTipo(FX_ENDPOINTS.ccl),
    fetchTipo(FX_ENDPOINTS.blue),
    fetchTipo(FX_ENDPOINTS.cripto),
  ]);

  return {
    oficial:   oficial.status   === "fulfilled" ? oficial.value   : [],
    mayorista: mayorista.status === "fulfilled" ? mayorista.value : [],
    mep:       mep.status       === "fulfilled" ? mep.value       : [],
    ccl:       ccl.status       === "fulfilled" ? ccl.value       : [],
    blue:      blue.status      === "fulfilled" ? blue.value      : [],
    cripto:    cripto.status    === "fulfilled" ? cripto.value    : [],
  };
}

/** Compute daily change % for venta (last vs second-to-last point) */
export function dailyChangePct(series: ArgDatosPoint[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].venta;
  const prev = series[series.length - 2].venta;
  if (!last || !prev || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}
