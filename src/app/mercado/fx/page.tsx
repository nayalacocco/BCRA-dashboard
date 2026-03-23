import type { Metadata } from "next";
import { FxClient } from "./FxClient";

export const metadata: Metadata = {
  title: "FX — Series Históricas",
  description: "Evolución histórica de tipos de cambio en Argentina: oficial, mayorista, MEP, CCL, blue y cripto. TCRM y Dollar Index.",
};

export default function FxPage() {
  return <FxClient />;
}
