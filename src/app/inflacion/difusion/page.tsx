import type { Metadata } from "next";
import difusion from "../../../../data/inflacion/difusion.json";
import manifest from "../../../../data/inflacion/manifest.json";
import type { DifusionData } from "@/lib/inflacion/difusion-types";
import { DifusionClient } from "./DifusionClient";

export const metadata: Metadata = {
  title: "Difusión y rotación de la inflación",
  description: "Difusión, rotación de precios relativos, variance ratio y régimen inflacionario — INDEC",
};

export default function DifusionPage() {
  const recon = (manifest.checks as { nombre: string; datos: Record<string, unknown> }[]).find(
    (c) => c.nombre === "reconciliacion_headline"
  );
  return (
    <DifusionClient
      data={difusion as unknown as DifusionData}
      generado={manifest.generado_utc}
      reconciliacionMaxPp={(recon?.datos?.nacional_max_abs_pp as number | undefined) ?? null}
    />
  );
}
