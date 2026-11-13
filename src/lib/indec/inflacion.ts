/**
 * Inflación, Expectativas y Tasas de Mercado
 *
 * Fuentes (directas, al día) con respaldo en datos.gob.ar (que replica con rezago o dejó de actualizar):
 *   - IPC:          INDEC serie_ipc_divisiones.csv          (respaldo: datos.gob.ar, ~2 meses de rezago)
 *   - REM:          BCRA relevamiento-...-historico.xlsx    (respaldo: datos.gob.ar, sin datos desde dic-2025)
 *   - UTDT 12m:     CIF-UTDT "Informes EI"                  (+ histórico previo de datos.gob.ar, que corta en ene-2026)
 *   - Tasas:        API BCRA v4 (diarias → promedio mensual) (datos.gob.ar quedó en ago-2026; call desde abr-2023)
 */

import { fetchINDECSeries, type SeriesPoint } from "./client";
import { getVariableHistorico } from "@/lib/bcra/client";
import { fetchIpcIndec } from "./ipc-indec";
import { fetchRem } from "@/lib/expectativas/rem";
import { fetchUtdt, mergeSeries } from "@/lib/expectativas/utdt";

export type { SeriesPoint };

// ---- Respaldo: IPC INDEC vía datos.gob.ar (Base Dic-2016) ----
export const IPC_SERIES = {
  VARIACION_MENSUAL: "145.3_INGNACUAL_DICI_M_38",  // fracción (0,0166 = 1,66 %)
  NIVEL_GENERAL:     "148.3_INIVELNAL_DICI_M_26",
  NUCLEO:            "148.3_INUCLEONAL_DICI_M_19",
  REGULADOS:         "148.3_IREGULANAL_DICI_M_22",
  ESTACIONALES:      "148.3_IESTACINAL_DICI_M_25",
} as const;

// ---- Respaldo: REM + UTDT vía datos.gob.ar ----
export const EXPECTATIVAS_SERIES = {
  REM_T:        "430.1_REM_IPC_NAL_T_M_0_0_25_28",  // fracción, indexada por mes del relevamiento
  REM_T1:       "430.1_MEDIANA_IPT_1_M_0_0_31_29",   // fracción, indexada por mes del relevamiento
  UTDT_12M:     "431.1_EXPECTATIVDIO_M_0_0_30_56",   // % (histórico hasta ene-2026)
} as const;

// ---- Tasas: IDs de la API BCRA v4 (diarias, % n.a.) ----
export const TASAS_BCRA = {
  badlar: { id: 7,   label: "BADLAR Privada",         color: "#1971c2" },
  tamar:  { id: 44,  label: "TAMAR Privada",          color: "#4263eb" },
  call:   { id: 148, label: "Call Interbancario",     color: "#1864ab" },
  pases:  { id: 150, label: "Pases entre terceros",   color: "#5c7cfa" },
  pf30:   { id: 12,  label: "Plazo Fijo 30 días",     color: "#2196f3" },
} as const;
export type TasaKey = keyof typeof TASAS_BCRA;

export interface InflacionData {
  // IPC
  ipcMensual:        SeriesPoint[];
  ipcNivel:          SeriesPoint[];
  ipcNucleo:         SeriesPoint[];
  ipcRegulados:      SeriesPoint[];
  ipcEstacional:     SeriesPoint[];
  ipcInteranual:     SeriesPoint[];
  nucleoMensual:     SeriesPoint[];
  reguladosMensual:  SeriesPoint[];
  estacionalMensual: SeriesPoint[];
  ipcFuente: "INDEC" | "datos.gob.ar";
  // Expectativas
  remT:   SeriesPoint[];  // REM: inflación esperada para el mes del relevamiento (indexada por mes objetivo)
  remT1:  SeriesPoint[];  // REM: inflación esperada para el mes siguiente (indexada por mes objetivo)
  remAnuales: { anio: number; valor: number }[]; // proyección dic/dic del último relevamiento
  remFuente: "BCRA" | "datos.gob.ar";
  utdt12m: SeriesPoint[];
  // Tasas: promedio mensual (gráficos) + últimos 2 datos diarios (tarjetas)
  tasasMensual: Record<TasaKey, SeriesPoint[]>;
  tasasUltimos: Record<TasaKey, SeriesPoint[]>;
}

// ---- Helpers ----

function scale(pts: SeriesPoint[] | undefined, k: number): SeriesPoint[] {
  return (pts ?? []).map((p) => ({ ...p, valor: p.valor * k }));
}

function shiftMonths(pts: SeriesPoint[], n: number): SeriesPoint[] {
  return pts.map((p) => {
    const [y, m] = p.fecha.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return { ...p, fecha: d.toISOString().slice(0, 10) };
  });
}

/** Variación % entre cada punto y el de `lag` períodos antes (serie mensual ordenada asc). */
function variacion(index: SeriesPoint[], lag: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = lag; i < index.length; i++) {
    const base = index[i - lag].valor;
    if (base > 0) out.push({ fecha: index[i].fecha, valor: (index[i].valor / base - 1) * 100 });
  }
  return out;
}

/** Serie diaria del BCRA → { mensual: promedio por mes, ultimos: últimos 2 datos } */
async function fetchTasaBcra(id: number): Promise<{ mensual: SeriesPoint[]; ultimos: SeriesPoint[] }> {
  const { data } = await getVariableHistorico(id, { limit: 3000 });
  const diaria = [...(data.detalle ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const byMonth = new Map<string, { sum: number; n: number }>();
  for (const d of diaria) {
    const key = d.fecha.slice(0, 7) + "-01";
    const acc = byMonth.get(key) ?? { sum: 0, n: 0 };
    acc.sum += d.valor;
    acc.n += 1;
    byMonth.set(key, acc);
  }
  return {
    mensual: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, { sum, n }]) => ({ fecha, valor: sum / n })),
    ultimos: diaria.slice(-2),
  };
}

// ---- Main ----

export async function fetchInflacionData(): Promise<InflacionData> {
  const tasaKeys = Object.keys(TASAS_BCRA) as TasaKey[];

  const [indecRes, ipcRes, remRes, utdtRes, expRes, ...tasaRes] = await Promise.allSettled([
    fetchIpcIndec(),
    fetchINDECSeries(Object.values(IPC_SERIES), 500),
    fetchRem(),
    fetchUtdt(),
    fetchINDECSeries(Object.values(EXPECTATIVAS_SERIES), 300),
    ...tasaKeys.map((k) => fetchTasaBcra(TASAS_BCRA[k].id)),
  ]);

  const ipc = ipcRes.status === "fulfilled" ? ipcRes.value : {};
  const exp = expRes.status === "fulfilled" ? expRes.value : {};
  if (ipcRes.status === "rejected") console.error("[Inflacion] IPC datos.gob.ar failed:", ipcRes.reason);
  if (expRes.status === "rejected") console.error("[Inflacion] Expectativas datos.gob.ar failed:", expRes.reason);

  // ---- IPC ----
  const indec = indecRes.status === "fulfilled" ? indecRes.value : null;
  const nivelDg = ipc[IPC_SERIES.NIVEL_GENERAL] ?? [];
  const nucleoDg = ipc[IPC_SERIES.NUCLEO] ?? [];
  const reguladosDg = ipc[IPC_SERIES.REGULADOS] ?? [];
  const estacionalDg = ipc[IPC_SERIES.ESTACIONALES] ?? [];

  const ipcBlock = indec
    ? {
        ipcMensual:        indec.nivelGeneral.mensual,
        ipcNivel:          indec.nivelGeneral.indice,
        ipcNucleo:         indec.nucleo.indice,
        ipcRegulados:      indec.regulados.indice,
        ipcEstacional:     indec.estacional.indice,
        ipcInteranual:     indec.nivelGeneral.interanual,
        nucleoMensual:     indec.nucleo.mensual,
        reguladosMensual:  indec.regulados.mensual,
        estacionalMensual: indec.estacional.mensual,
        ipcFuente:         "INDEC" as const,
      }
    : {
        ipcMensual:        scale(ipc[IPC_SERIES.VARIACION_MENSUAL], 100),
        ipcNivel:          nivelDg,
        ipcNucleo:         nucleoDg,
        ipcRegulados:      reguladosDg,
        ipcEstacional:     estacionalDg,
        ipcInteranual:     variacion(nivelDg, 12),
        nucleoMensual:     variacion(nucleoDg, 1),
        reguladosMensual:  variacion(reguladosDg, 1),
        estacionalMensual: variacion(estacionalDg, 1),
        ipcFuente:         "datos.gob.ar" as const,
      };

  // ---- REM ----
  const rem = remRes.status === "fulfilled" ? remRes.value : null;
  const remBlock = rem
    ? {
        remT: rem.mesCorriente,
        remT1: rem.proximoMes,
        remAnuales: rem.anuales,
        remFuente: "BCRA" as const,
      }
    : {
        remT: scale(exp[EXPECTATIVAS_SERIES.REM_T], 100),
        // datos.gob.ar indexa t+1 por mes del relevamiento → se corre al mes objetivo
        remT1: shiftMonths(scale(exp[EXPECTATIVAS_SERIES.REM_T1], 100), 1),
        remAnuales: [],
        remFuente: "datos.gob.ar" as const,
      };

  // ---- UTDT: histórico de datos.gob.ar + lo publicado por el CIF ----
  const utdtDirecto = utdtRes.status === "fulfilled" ? utdtRes.value : null;
  const utdt12m = mergeSeries(exp[EXPECTATIVAS_SERIES.UTDT_12M] ?? [], utdtDirecto ?? []);

  // ---- Tasas ----
  const tasasMensual = {} as Record<TasaKey, SeriesPoint[]>;
  const tasasUltimos = {} as Record<TasaKey, SeriesPoint[]>;
  tasaKeys.forEach((k, i) => {
    const r = tasaRes[i];
    if (r.status === "fulfilled") {
      tasasMensual[k] = r.value.mensual;
      tasasUltimos[k] = r.value.ultimos;
    } else {
      console.error(`[Inflacion] Tasa ${k} (BCRA ${TASAS_BCRA[k].id}) failed:`, r.reason);
      tasasMensual[k] = [];
      tasasUltimos[k] = [];
    }
  });

  return { ...ipcBlock, ...remBlock, utdt12m, tasasMensual, tasasUltimos };
}
