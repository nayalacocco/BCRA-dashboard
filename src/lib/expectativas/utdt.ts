/**
 * Expectativas de inflación a 12 meses (promedio) — UTDT / CIF, directo de la web de la Di Tella.
 *
 * Por qué: la réplica en datos.gob.ar (431.1_EXPECTATIVDIO_M_0_0_30_56) dejó de
 * actualizarse en ene-2026. La página "Informes EI" del CIF lista cada mes con el titular
 * "EL PROMEDIO DE EXPECTATIVAS DE INFLACIÓN ES DE 35,9% EN OCTUBRE" (desde jun-2023).
 * El histórico anterior se completa con datos.gob.ar.
 */

import type { SeriesPoint } from "@/lib/indec/client";

const UTDT_INFORMES_EI_URL =
  "https://www.utdt.edu/ver_contenido.php?id_contenido=2591&id_item_menu=5006";

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function parseUtdtHtml(html: string): SeriesPoint[] {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&Oacute;/g, "Ó")
    .replace(/\s+/g, " ");
  const re =
    /(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})\s+EL PROMEDIO DE EXPECTATIVAS DE INFLACI(?:Ó|O|&Oacute;)N ES DE\s+([\d.,]+)\s*%/gi;

  const byMonth = new Map<string, number>();
  for (const m of text.matchAll(re)) {
    const mes = MESES[m[1].toLowerCase()];
    const valor = Number(m[3].replace(".", "").replace(",", "."));
    if (!mes || !Number.isFinite(valor)) continue;
    byMonth.set(`${m[2]}-${String(mes).padStart(2, "0")}-01`, valor);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, valor]) => ({ fecha, valor }));
}

export async function fetchUtdt(): Promise<SeriesPoint[] | null> {
  try {
    const res = await fetch(UTDT_INFORMES_EI_URL, {
      next: { revalidate: 6 * 3600 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`UTDT ${res.status}`);
    // La página se sirve en ISO-8859-15
    const html = new TextDecoder("latin1").decode(await res.arrayBuffer());
    const pts = parseUtdtHtml(html);
    if (!pts.length) throw new Error("UTDT: no se encontraron titulares");
    return pts;
  } catch (err) {
    console.error("[UTDT] fallback a datos.gob.ar:", err);
    return null;
  }
}

/** Une el histórico de datos.gob.ar con lo scrapeado; ante superposición gana la fuente directa. */
export function mergeSeries(base: SeriesPoint[], override: SeriesPoint[]): SeriesPoint[] {
  const m = new Map(base.map((p) => [p.fecha, p.valor]));
  for (const p of override) m.set(p.fecha, p.valor);
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, valor]) => ({ fecha, valor }));
}
