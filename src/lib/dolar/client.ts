/**
 * dolarapi.com — free, public, CORS-enabled FX rates for Argentina.
 * Docs: https://dolarapi.com
 *
 * No authentication required. Rates update ~every 15 minutes during market hours.
 */

export interface DolarRate {
  nombre: string;        // "Oficial", "Blue", "Bolsa", "Contado con liquidación", etc.
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string; // ISO timestamp
}

const BASE = "https://dolarapi.com/v1";

async function fetchDolar(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Accept": "application/json" },
    // No caching — always fetch latest rate
  });
  if (!res.ok) throw new Error(`dolarapi ${res.status} — ${path}`);
  return res.json();
}

export async function fetchAllRates(): Promise<DolarRate[]> {
  return fetchDolar("/dolares") as Promise<DolarRate[]>;
}

export interface DolarSnapshot {
  oficial:   DolarRate | null;
  mep:       DolarRate | null;
  ccl:       DolarRate | null;
  blue:      DolarRate | null;
  cripto:    DolarRate | null;
  mayorista: DolarRate | null;
}

export async function fetchDolarSnapshot(): Promise<DolarSnapshot> {
  const all = await fetchAllRates();

  function find(nombre: string) {
    return all.find((r) =>
      r.nombre.toLowerCase().includes(nombre.toLowerCase())
    ) ?? null;
  }

  return {
    oficial:   find("oficial"),
    mep:       find("bolsa"),
    ccl:       find("contado con liquidación") ?? find("ccl"),
    blue:      find("blue") ?? find("informal"),
    cripto:    find("cripto"),
    mayorista: find("mayorista"),
  };
}

/** Brecha porcentual vs oficial (venta) */
export function brecha(rate: DolarRate | null, oficial: DolarRate | null): number | null {
  if (!rate?.venta || !oficial?.venta || oficial.venta === 0) return null;
  return ((rate.venta - oficial.venta) / oficial.venta) * 100;
}
