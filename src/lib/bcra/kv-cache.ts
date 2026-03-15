/**
 * Server-side KV cache for BCRA dashboard data.
 *
 * Provides a fallback when the BCRA API is down:
 *   - On successful fetch  → saveToKV()   (called from page.tsx)
 *   - On failed fetch      → loadFromKV() (called from page.tsx)
 *
 * Requires Vercel KV (free tier). If env vars are not set the functions
 * are no-ops so the app still works in local dev without KV configured.
 */

export interface DashboardCacheData {
  latestValues: Record<number, { valor: number; fecha: string } | null>;
  historicData: Record<number, Array<{ fecha: string; valor: number }>>;
  lastBCRAUpdate?: string;
  savedAt: string; // ISO timestamp of when this snapshot was taken
}

const KV_KEY = "bcra:dashboard:v1";

/** Returns a connected kv client, or null if env vars are missing. */
async function getKV() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

/**
 * Persist dashboard data to KV.
 * Called after every successful BCRA API fetch.
 */
export async function saveToKV(data: Omit<DashboardCacheData, "savedAt">): Promise<void> {
  const client = await getKV();
  if (!client) return;

  const payload: DashboardCacheData = {
    ...data,
    savedAt: new Date().toISOString(),
  };

  try {
    // Store as JSON string; Upstash handles values up to 100 MB
    await client.set(KV_KEY, JSON.stringify(payload));
  } catch (err) {
    // KV write failure should never break the page render
    console.error("[KV] saveToKV failed:", err);
  }
}

/**
 * Load the last successful dashboard snapshot from KV.
 * Returns null if KV is not configured or has no data.
 */
export async function loadFromKV(): Promise<DashboardCacheData | null> {
  const client = await getKV();
  if (!client) return null;

  try {
    const raw = await client.get<string>(KV_KEY);
    if (!raw) return null;

    // @vercel/kv may auto-parse JSON; handle both cases
    const parsed: DashboardCacheData =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    if (!parsed?.latestValues || Object.keys(parsed.latestValues).length === 0) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[KV] loadFromKV failed:", err);
    return null;
  }
}
