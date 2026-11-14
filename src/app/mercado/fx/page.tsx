import type { Metadata } from "next";
import compras from "../../../../data/fx/compras.json";
import cotizaciones from "../../../../data/fx/cotizaciones.json";
import manifest from "../../../../data/fx/manifest.json";
import reservas from "../../../../data/fx/reservas.json";
import type { ComprasData, CotizacionesData, FxManifest, ReservasData } from "@/lib/fx/types";
import { TipoCambioClient } from "./TipoCambioClient";

export const metadata: Metadata = {
  title: "Tipo de cambio",
  description: "Oficial dentro de la banda, distancia al techo, compras del BCRA y reservas netas en dos perímetros (BCRA y consolidado).",
};

export default function TipoCambioPage() {
  return (
    <TipoCambioClient
      cot={cotizaciones as unknown as CotizacionesData}
      compras={compras as unknown as ComprasData}
      reservas={reservas as unknown as ReservasData}
      manifest={manifest as unknown as FxManifest}
    />
  );
}
