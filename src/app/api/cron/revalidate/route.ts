/**
 * GET /api/cron/revalidate
 *
 * Endpoint protegido para invalidar la caché de datos del BCRA.
 * Llamado desde GitHub Actions:
 *   - 16:00 ART (19:00 UTC) — cierre MAE, solo L-V
 *   - 17:00 ART (20:00 UTC) — cierre mercado, solo L-V
 *   - 18:00 ART (21:00 UTC) — post-cierre / cuadro oficial BCRA en X, solo L-V
 *   - 20:30 ART (23:30 UTC) — segunda verificación
 *   - 01:00 ART (04:00 UTC) — verificación nocturna
 *
 * Smart check: antes de invalidar, consulta el último dato disponible en la API
 * BCRA. Si el dato ya estaba cacheado (misma fecha), responde { skipped: true }
 * para evitar regeneraciones innecesarias. El check es best-effort: si la
 * instancia serverless está fría o la consulta falla, se revalida igual.
 *
 * Autenticación: Bearer token via header Authorization
 * o query param ?secret=CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Caché en memoria (best-effort, vive mientras la instancia serverless esté caliente)
// Clave: id de variable BCRA → última fecha conocida (ej: "2026-03-18")
const latestKnownDate = new Map<string, string>();

async function verifySecret(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const provided = querySecret ?? bearerSecret;
  return provided === cronSecret;
}

async function checkBcraLatestDate(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/1?limit=1",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "Accept": "application/json" },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Estructura: results[0].detalle[0].fecha
    return (data?.results?.[0]?.detalle?.[0]?.fecha as string) ?? null;
  } catch {
    return null; // timeout, red caída, etc.
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[CRON] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (!(await verifySecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timestamp = new Date().toISOString();

    // ─── Smart check ────────────────────────────────────────────────────────
    const bcraLatestDate = await checkBcraLatestDate();
    const knownDate = latestKnownDate.get("1");

    if (bcraLatestDate && knownDate === bcraLatestDate) {
      // El dato no cambió desde la última revalidación en esta instancia
      console.log(
        `[CRON] Saltando revalidación — dato sin cambios (${bcraLatestDate})`
      );
      return NextResponse.json({
        success: true,
        revalidated: false,
        skipped: true,
        reason: "data_unchanged",
        bcraLatestDate,
        timestamp,
      });
    }

    // Actualizar la fecha conocida (para próximos checks en la misma instancia)
    if (bcraLatestDate) {
      latestKnownDate.set("1", bcraLatestDate);
    }

    // ─── Invalidar caché ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (revalidateTag as any)("bcra-data");
    revalidatePath("/", "layout");

    console.log(
      `[CRON] Caché invalidada — ${timestamp}${bcraLatestDate ? ` | BCRA dato más reciente: ${bcraLatestDate}` : ""}`
    );

    return NextResponse.json({
      success: true,
      revalidated: true,
      skipped: false,
      bcraLatestDate: bcraLatestDate ?? "desconocido",
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
