/**
 * GET /api/bcra/variables
 *
 * Retorna todas las variables del BCRA con sus últimos valores.
 * Actúa como proxy server-side para no exponer lógica al cliente.
 *
 * Query params:
 *   - category?: filtrar por categoría
 *   - ids?: lista de IDs separados por coma (ej: "1,5,7")
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllVariables, BCRAError } from "@/lib/bcra/client";
import { CACHE_TTL_SECONDS } from "@/lib/bcra/constants";

export const dynamic = "force-static";
export const revalidate = CACHE_TTL_SECONDS;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const idsParam = searchParams.get("ids");

    let variables = await getAllVariables();

    // Filtros opcionales
    if (category) {
      variables = variables.filter(
        (v) => v.categoria?.toLowerCase() === category.toLowerCase()
      );
    }

    if (idsParam) {
      const ids = idsParam.split(",").map(Number).filter(Boolean);
      variables = variables.filter((v) => ids.includes(v.idVariable));
    }

    return NextResponse.json(
      { data: variables, count: variables.length },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 2}`,
        },
      }
    );
  } catch (error) {
    if (error instanceof BCRAError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status ?? 500 }
      );
    }

    console.error("[API /bcra/variables]", error);
    return NextResponse.json(
      { error: "Error interno al consultar el BCRA" },
      { status: 500 }
    );
  }
}
