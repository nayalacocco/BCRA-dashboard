/**
 * MAE MarketData API client.
 * https://api.mae.com.ar/MarketData/v1
 *
 * Authentication: x-api-key header (server-side only — never exposed to client).
 * Rate limits: not documented; use conservative pagination.
 */

const BASE_URL = "https://api.mae.com.ar/MarketData/v1";

function getApiKey(): string {
  const key = process.env.MAE_API_KEY;
  if (!key) throw new Error("MAE_API_KEY environment variable is not set");
  return key;
}

/**
 * Generic authenticated GET to the MAE API.
 * Throws on non-200 or missing API key.
 */
export async function fetchMAE(
  path: string,
  params: Record<string, string | number> = {},
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": getApiKey() },
    // No ISR cache here — callers control caching via next.revalidate or server component
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`MAE API ${res.status} ${res.statusText} — ${path}`);
  }

  return res.json();
}
