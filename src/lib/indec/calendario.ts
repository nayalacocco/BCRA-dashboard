import calendario from "../../../data/indec/calendario-ipc.json";

/**
 * Calendario de publicación del IPC (INDEC), cargado a mano desde el calendario oficial
 * (data/indec/calendario-ipc.json). Se evalúa en el cliente: la página es estática y "hoy" cambia.
 */

export interface Publicacion {
  periodo: string; // "YYYY-MM"
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM" ART
}

const PUBS: Publicacion[] = [...calendario.publicaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
export const CALENDARIO_FUENTE = calendario.fuente;

/** Instante de publicación (ART = UTC−3, sin horario de verano). */
const instante = (p: Publicacion) => new Date(`${p.fecha}T${p.hora}:00-03:00`);

/** Próxima publicación después de `ahora`; null si el calendario cargado no llega ("sin dato"). */
export function proximaPublicacion(ahora: Date = new Date()): Publicacion | null {
  return PUBS.find((p) => instante(p) > ahora) ?? null;
}

/**
 * true si ya debió publicarse un período posterior al último que tenemos (el pipeline no lo levantó).
 * Se da 1 día de gracia: el refresh corre a las 16:40 y 18:40 ART del día de publicación.
 */
export function atrasado(ultimoPeriodo: string, ahora: Date = new Date()): boolean {
  const gracia = 24 * 3600 * 1000;
  return PUBS.some((p) => p.periodo > ultimoPeriodo && instante(p).getTime() + gracia < ahora.getTime());
}

/** "15/12/2026" */
export const fmtFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
