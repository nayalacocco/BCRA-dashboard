/**
 * GET /api/bcra/variables/[id]
 *
 * Retorna datos históricos de una variable específica del BCRA.
 *
 * Query params:
 *   - desde?: fecha inicio "YYYY-MM-DD"
 *   - hasta?: fecha fin "YYYY-MM-DD"
 *   - limit?: cantidad de resultados (default: 365)
 *   - offset?: paginación
 */

import { NextRequest, NextResponse } from "next/server";
import { getVariableHistorico, BCRAError } from "@/lib/bcra/client";
import { CACHE_TTL_SECONDS, DEFAULT_HISTORY_LIMIT } from "@/lib/bcra/constants";

export const revalidate = CACHE_TTL_SECONDS;

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const idVariable = parseInt(params.id, 10);

  if (isNaN(idVariable) || idVariable <= 0) {
    return NextResponse.json(
      { error: "ID de variable inválido" },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    const histParams = {
      desde: searchParams.get("desde") ?? undefined,
      hasta: searchParams.get("hasta") ?? undefined,
      limit: searchParams.has("limit")
        ? parseInt(searchParams.get("limit")!, 10)
        : DEFAULT_HISTORY_LIMIT,
      offset: searchParams.has("offset")
        ? parseInt(searchParams.get("offset")!, 10)
        : 0,
    };

    const { data, totalCount } = await getVariableHistorico(idVariable, histParams);

    return NextResponse.json(
      { data, totalCount },
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

    console.error(`[API /bcra/variables/${idVariable}]`, error);
    return NextResponse.json(
      { error: "Error interno al consultar el BCRA" },
      { status: 500 }
    );
  }
}
