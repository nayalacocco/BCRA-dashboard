/**
 * BCRA API Client — Principales Variables v4.0
 *
 * Endpoint base: https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias
 *
 * - GET /Monetarias                → lista todas las variables (con último valor)
 * - GET /Monetarias/{id}           → datos históricos de una variable
 *   Params: limit (10–3000), offset, desde (YYYY-MM-DD), hasta (YYYY-MM-DD)
 *
 * Nota: La API no requiere autenticación para endpoints públicos.
 * Se usa `next: { revalidate, tags }` de Next.js fetch para ISR + on-demand revalidation.
 */

import { unstable_cache } from "next/cache";
import type {
  BCRAResponse,
  BCRAVariable,
  BCRAVariableData,
  HistoricoParams,
} from "./types";
import { BCRA_API_BASE, CACHE_TTL_SECONDS, DEFAULT_HISTORY_LIMIT } from "./constants";

// ---- Helpers ----

function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(`${BCRA_API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
}

async function fetchBCRA<T>(url: string): Promise<BCRAResponse<T>> {
  const res = await fetch(url, {
    // ISR: revalidar cada hora, tag para revalidación on-demand
    next: {
      revalidate: CACHE_TTL_SECONDS,
      tags: ["bcra-data"],
    },
    headers: {
      Accept: "application/json",
      "User-Agent": "BCRA-Dashboard/1.0 (Next.js)",
    },
  });

  if (!res.ok) {
    // Intentar leer el mensaje de error de la API
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = { message: res.statusText };
    }
    throw new BCRAError(
      `BCRA API error ${res.status}`,
      res.status,
      errorBody
    );
  }

  const data = (await res.json()) as BCRAResponse<T>;

  if (data.status && data.status >= 400) {
    throw new BCRAError(
      data.errorMessages?.join(", ") ?? "Error desconocido de la API",
      data.status,
      data
    );
  }

  return data;
}

// ---- Error class ----

export class BCRAError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly raw?: unknown
  ) {
    super(message);
    this.name = "BCRAError";
  }
}

// ---- Cached fetchers (server-side only) ----

/**
 * Obtiene la lista completa de variables con sus últimos valores.
 * Cacheado con ISR (revalidate: 1h) y tag "bcra-data" para invalidación on-demand.
 */
export const getAllVariables = unstable_cache(
  async (): Promise<BCRAVariable[]> => {
    const url = buildUrl("", { limit: 3000, offset: 0 });
    const response = await fetchBCRA<BCRAVariable>(url);
    return response.results;
  },
  ["bcra-all-variables"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["bcra-data"],
  }
);

/**
 * Obtiene datos históricos de una variable específica.
 */
export const getVariableHistorico = unstable_cache(
  async (
    idVariable: number,
    params: HistoricoParams = {}
  ): Promise<{ data: BCRAVariableData; totalCount: number }> => {
    const queryParams: Record<string, string | number> = {
      limit: params.limit ?? DEFAULT_HISTORY_LIMIT,
      offset: params.offset ?? 0,
    };
    if (params.desde) queryParams.desde = params.desde;
    if (params.hasta) queryParams.hasta = params.hasta;

    const url = buildUrl(`/${idVariable}`, queryParams);
    const response = await fetchBCRA<BCRAVariableData>(url);

    const data = response.results[0] ?? { idVariable, detalle: [] };
    return {
      data,
      totalCount: response.metadata?.resultset?.count ?? 0,
    };
  },
  ["bcra-variable-historico"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["bcra-data"],
  }
);

/**
 * Obtiene el último valor de una variable específica.
 */
export const getVariableLatest = unstable_cache(
  async (idVariable: number): Promise<{ fecha: string; valor: number } | null> => {
    const url = buildUrl(`/${idVariable}`, { limit: 1, offset: 0 });
    const response = await fetchBCRA<BCRAVariableData>(url);
    const data = response.results[0];
    if (!data?.detalle?.length) return null;
    return data.detalle[0];
  },
  ["bcra-variable-latest"],
  {
    revalidate: CACHE_TTL_SECONDS,
    tags: ["bcra-data"],
  }
);

/**
 * Obtiene datos históricos de múltiples variables (para el comparador de series).
 * Cada variable se fetcha individualmente con su propia caché.
 */
export async function getMultipleVariablesHistorico(
  ids: number[],
  params: HistoricoParams = {}
): Promise<Map<number, BCRAVariableData>> {
  const results = await Promise.allSettled(
    ids.map((id) => getVariableHistorico(id, params))
  );

  const map = new Map<number, BCRAVariableData>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      map.set(ids[index], result.value.data);
    }
  });
  return map;
}
