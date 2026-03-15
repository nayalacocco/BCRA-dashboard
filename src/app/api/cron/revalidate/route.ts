/**
 * GET /api/cron/revalidate
 *
 * Endpoint protegido para invalidar la caché de datos del BCRA.
 * Llamado desde GitHub Actions dos veces por día:
 *   - 20:30 ART (~23:30 UTC) — cierre de operaciones
 *   - 01:00 ART (~04:00 UTC) — verificación nocturna
 *
 * Autenticación: Bearer token via header Authorization
 * o query param ?secret=CRON_SECRET
 *
 * Variables de entorno requeridas:
 *   CRON_SECRET — string aleatorio (ej: generado con `openssl rand -hex 32`)
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verificación del secret
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[CRON] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Aceptar el secret via query param o Authorization header
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const providedSecret = querySecret ?? bearerSecret;

  if (!providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Invalidar todas las caché tagged con "bcra-data"
    revalidateTag("bcra-data");

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Caché invalidada exitosamente a las ${timestamp}`);

    return NextResponse.json({
      success: true,
      revalidated: true,
      timestamp,
      message: "Caché BCRA invalidada. Los próximos requests traerán datos frescos.",
    });
  } catch (error) {
    console.error("[CRON] Error al invalidar caché:", error);
    return NextResponse.json(
      { error: "Error al invalidar caché", detail: String(error) },
      { status: 500 }
    );
  }
}

// También aceptar POST para más flexibilidad
export async function POST(request: NextRequest) {
  return GET(request);
}
