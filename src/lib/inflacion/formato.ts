/** Formato de números y fechas del sistema v5 (es-AR, meses en minúscula: "oct-26"). */

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10" → "oct-26" */
export const fmtMes = (f: string) => `${MES[parseInt(f.slice(5, 7), 10) - 1]}-${f.slice(2, 4)}`;
/** "2026-10" → "octubre" */
export const mesLargo = (f: string) => MES_LARGO[parseInt(f.slice(5, 7), 10) - 1];
/** "2026-10" → "octubre de 2026" */
export const mesLargoAnio = (f: string) => `${mesLargo(f)} de ${f.slice(0, 4)}`;

export const fmt = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Con signo explícito: "+0,3", "−1,2" (signo menos tipográfico). */
export const fmtSigno = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), d)}`;
