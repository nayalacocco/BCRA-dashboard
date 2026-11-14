/**
 * GET /api/inflacion/heatmap — cambio de precio relativo r_{i,t} por ítem (M2).
 * Estático: se genera en el build a partir de data/inflacion/heatmap.json (pipeline de inflación).
 */
import { NextResponse } from "next/server";
import heatmap from "../../../../../data/inflacion/heatmap.json";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(heatmap);
}
