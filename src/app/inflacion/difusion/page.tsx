import type { Metadata } from "next";
import difusion from "../../../../data/inflacion/difusion.json";
import items from "../../../../data/inflacion/items.json";
import manifest from "../../../../data/inflacion/manifest.json";
import precios from "../../../../data/inflacion/precios_relativos.json";
import reconciliacion from "../../../../data/inflacion/reconciliacion.json";
import type { DifusionData, PreciosRelativosData, Validacion } from "@/lib/inflacion/difusion-types";
import { DifusionClient } from "./DifusionClient";

export const metadata: Metadata = {
  title: "Difusión y rotación de la inflación",
  description: "Difusión, rotación de precios relativos, variance ratio, precios relativos con anclas y régimen inflacionario — INDEC",
};

/** Resumen de la validación del universo y la reconciliación; se calcula en el build (no viaja al cliente). */
function validacion(): Validacion {
  const its = items as { peso_nacional: number; residual: boolean }[];
  const rec = (reconciliacion as { fecha: string; scope: string; publicado: number; recomputado: number; desvio_pp: number | null }[]).filter(
    (r) => r.desvio_pp != null
  );
  const nac = rec.filter((r) => r.scope === "Nacional");
  const abs = nac.map((r) => Math.abs(r.desvio_pp as number));
  const regionMaxPp: Record<string, number> = {};
  for (const r of rec) if (r.scope !== "Nacional") regionMaxPp[r.scope] = Math.max(regionMaxPp[r.scope] ?? 0, Math.abs(r.desvio_pp as number));
  return {
    items: its.length,
    publicados: its.filter((i) => !i.residual).length,
    restos: its.filter((i) => i.residual).length,
    sumaPesos: its.reduce((s, i) => s + i.peso_nacional, 0),
    reconciliacion: {
      meses: nac.length,
      maxPp: Math.max(...abs),
      maePp: abs.reduce((s, x) => s + x, 0) / abs.length,
      fueraDeTolerancia: abs.filter((x) => x > 0.05).length,
      peores: [...nac]
        .sort((a, b) => Math.abs(b.desvio_pp as number) - Math.abs(a.desvio_pp as number))
        .slice(0, 3)
        .map((r) => ({ fecha: r.fecha, publicado: r.publicado, recomputado: r.recomputado, desvio: r.desvio_pp as number })),
      regionMaxPp,
    },
  };
}

export default function DifusionPage() {
  return (
    <DifusionClient
      data={difusion as unknown as DifusionData}
      precios={precios as unknown as PreciosRelativosData}
      validacion={validacion()}
      generado={manifest.generado_utc}
    />
  );
}
