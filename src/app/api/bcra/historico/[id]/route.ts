/**
 * GET /api/bcra/historico/[id]
 *
 * Alias de /api/bcra/variables/[id] con limit mayor por defecto.
 * Pensado para el comparador de series que necesita más datos.
 *
 * Query params:
 *   - desde?: fecha inicio "YYYY-MM-DD"
 *   - hasta?: fecha fin "YYYY-MM-DD"
 *   - limit?: cantidad de resultados (default: 1000)
 */

import { NextRequest, NextResponse } from "next/server";
import { getVariableHistorico, BCRAError } from "@/lib/bcra/client";
import { CACHE_TTL_SECONDS } from "@/lib/bcra/constants";

export const revalidate = CACHE_TTL_SECONDS;

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const idVariable = parseInt(id, 10);

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
        : 1000,
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

    console.error(`[API /bcra/historico/${idVariable}]`, error);
    return NextResponse.json(
      { error: "Error interno al consultar el BCRA" },
      { status: 500 }
    );
  }
}
