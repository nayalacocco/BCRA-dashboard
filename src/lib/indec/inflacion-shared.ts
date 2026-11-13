/**
 * Tipos y constantes de la página Inflación compartidos con el cliente.
 * Sin imports de servidor (inflacion.ts usa read-excel-file/node, que no puede ir al bundle del navegador).
 */

import type { SeriesPoint } from "./client";

export type { SeriesPoint };

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

