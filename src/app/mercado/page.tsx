import type { Metadata } from "next";
import { MercadoClient } from "./MercadoClient";

export const metadata: Metadata = {
  title: "Mercado",
  description: "Repos MAE, renta fija, cauciones bursátiles y FX de mercado — Mercado Abierto Electrónico",
};

export default function MercadoPage() {
  return <MercadoClient />;
}
