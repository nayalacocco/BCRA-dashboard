/**
 * IPC directo de INDEC — serie_ipc_divisiones.csv
 *
 * Por qué: datos.gob.ar replica el IPC con 2-3 meses de rezago (nov-2026 tenía hasta ago-2026),
 * mientras que INDEC actualiza este CSV el mismo día de la publicación.
 *
 * Formato (Latin-1, separador ";", decimales con coma, "NA" para faltantes):
 *   Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region
 *   0;NIVEL GENERAL;Nivel general y divisiones COICOP;202610;12785,9321;2,2;33,1;Nacional
 *   Núcleo;;Categorias;202610;12844,6416;1,5;30,7;Nacional
 *
 * v_m_IPC y v_i_a_IPC ya vienen en porcentaje (2,2 = 2,2 %).
 */

import type { SeriesPoint } from "./client";

const INDEC_IPC_CSV_URL =
  "https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv";

export interface IpcSerie {
  indice: SeriesPoint[];
  mensual: SeriesPoint[];
  interanual: SeriesPoint[];
}

export interface IpcIndec {
  nivelGeneral: IpcSerie;
  nucleo: IpcSerie;
  regulados: IpcSerie;
  estacional: IpcSerie;
}

function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "" || t.toUpperCase() === "NA") return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "202610" → "2026-10-01" */
function periodoToFecha(p: string): string | null {
  const m = /^(\d{4})(\d{2})$/.exec(p.trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

function emptySerie(): IpcSerie {
  return { indice: [], mensual: [], interanual: [] };
}

/** Clave de la fila (región Nacional) → serie del resultado */
function keyOf(codigo: string, descripcion: string): keyof IpcIndec | null {
  const c = codigo.trim().toLowerCase();
  if (c === "0" && /nivel general/i.test(descripcion)) return "nivelGeneral";
  if (c.startsWith("n") && c.includes("cleo")) return "nucleo"; // "Núcleo" (tolera encoding)
  if (c === "regulados") return "regulados";
  if (c === "estacional") return "estacional";
  return null;
}

export function parseIpcCsv(text: string): IpcIndec {
  const out: IpcIndec = {
    nivelGeneral: emptySerie(),
    nucleo: emptySerie(),
    regulados: emptySerie(),
    estacional: emptySerie(),
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(";");
    if (cols.length < 8 || cols[7].trim() !== "Nacional") continue;
    const key = keyOf(cols[0], cols[1]);
    if (!key) continue;
    const fecha = periodoToFecha(cols[3]);
    if (!fecha) continue;

    const indice = parseNum(cols[4]);
    const vm = parseNum(cols[5]);
    const via = parseNum(cols[6]);
    if (indice != null) out[key].indice.push({ fecha, valor: indice });
    if (vm != null) out[key].mensual.push({ fecha, valor: vm });
    if (via != null) out[key].interanual.push({ fecha, valor: via });
  }

  for (const s of Object.values(out) as IpcSerie[]) {
    for (const arr of [s.indice, s.mensual, s.interanual]) {
      arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
  }
  return out;
}

/**
 * Descarga y parsea el CSV de INDEC. Devuelve null si falla o si viene vacío,
 * para que el llamador use datos.gob.ar como respaldo.
 */
export async function fetchIpcIndec(): Promise<IpcIndec | null> {
  try {
    const res = await fetch(INDEC_IPC_CSV_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`INDEC CSV ${res.status}`);
    // El archivo viene en Latin-1 (Windows-1252)
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    const parsed = parseIpcCsv(text);
    if (parsed.nivelGeneral.mensual.length === 0) throw new Error("INDEC CSV sin datos de Nivel General");
    return parsed;
  } catch (err) {
    console.error("[IPC INDEC] fallback a datos.gob.ar:", err);
    return null;
  }
}
