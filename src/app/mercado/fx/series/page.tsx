import type { Metadata } from "next";
import { FxClient } from "./FxClient";

export const metadata: Metadata = {
  title: "Tipo de cambio · series históricas",
  description: "Vista anterior: evolución histórica de oficial, mayorista, MEP, CCL, blue y cripto.",
};

export default function FxSeriesPage() {
  return <FxClient />;
}
