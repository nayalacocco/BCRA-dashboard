/**
 * BYMA (Bolsas y Mercados Argentinos) — free public API.
 * Source: open.bymadata.com.ar (the same API used by BYMA's own website)
 * No authentication or API key required.
 *
 * ⚠️  Server-side only — call via Next.js API route, not from browser.
 *     The endpoint requires a session cookie from the BYMA dashboard to work,
 *     and may have CORS restrictions.
 *
 * Rate strategy: ISR revalidate=300 (5 min during market hours).
 * Since there's no documented rate limit and no cost, this maximizes freshness
 * while keeping fetches to ~90/day during trading hours.
 */

const BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

const BROWSER_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Origin": "https://open.bymadata.com.ar",
  "Referer": "https://open.bymadata.com.ar/",
};

// ---- Types ----

export interface BymaQuote {
  symbol:          string;
  description:     string;
  lastPrice:       number | null;
  previousClosingPrice: number | null;
  changePercent:   number | null;
  volume:          number | null;
  openingPrice:    number | null;
  maxPrice:        number | null;
  minPrice:        number | null;
  closingPrice:    number | null;
  tradeDate:       string | null;   // ISO date
  settlementType:  string | null;   // "CI", "24HS", "48HS"
  currency:        string | null;   // "ARS", "USD"
  marketValue:     number | null;
  technicalPrice:  number | null;   // par value / price technical
  yieldToMaturity: number | null;   // TIR for bonds
  duration:        number | null;   // modified duration
}

export interface BymaIndex {
  symbol:       string;
  description:  string;
  lastValue:    number;
  changePercent: number;
  openingValue:  number | null;
  maxValue:      number | null;
  minValue:      number | null;
  date:          string | null;
}

export interface BymaData {
  publicBonds:       BymaQuote[];   // Bonos soberanos (GD30, AL30, AE38, etc.)
  negotiableObligations: BymaQuote[]; // ONs corporativas
  indices:           BymaIndex[];   // Merval, etc.
  leadingEquity:     BymaQuote[];   // Acciones líderes (Panel Merval)
  cedears:           BymaQuote[];   // CEDEARs
  fetchedAt:         string;        // ISO timestamp
  marketOpen:        boolean;
}

// ---- Session cookie getter ----
// BYMA requires a session cookie from the dashboard page before API calls work.

async function getSessionCookie(): Promise<string> {
  const res = await fetch("https://open.bymadata.com.ar/", {
    headers: {
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";

  // Extract cookie name=value pairs (strip directives like Path, Secure, SameSite)
  return setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

// ---- Fetch helpers ----

async function bymaGet(path: string, cookie = ""): Promise<unknown> {
  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    next: { revalidate: 300 }, // ISR: 5-minute cache
  });

  if (!res.ok) {
    throw new Error(`BYMA ${res.status} ${res.statusText} — ${path}`);
  }

  return res.json();
}

// ---- Normalizers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeQuote(raw: Record<string, any>): BymaQuote {
  return {
    symbol:               raw.symbol          ?? raw.ticker ?? "",
    description:          raw.description     ?? raw.nombre ?? "",
    lastPrice:            raw.lastPrice        ?? raw.ultimoPrecio ?? null,
    previousClosingPrice: raw.previousClosingPrice ?? raw.precioAnterior ?? null,
    changePercent:        raw.changePercent    ?? raw.variacionPorcentual ?? null,
    volume:               raw.volume           ?? raw.volumen ?? null,
    openingPrice:         raw.openingPrice     ?? raw.precioApertura ?? null,
    maxPrice:             raw.maxPrice         ?? raw.precioMaximo ?? null,
    minPrice:             raw.minPrice         ?? raw.precioMinimo ?? null,
    closingPrice:         raw.closingPrice     ?? raw.precioCierre ?? null,
    tradeDate:            raw.tradeDate        ?? raw.fecha ?? null,
    settlementType:       raw.settlementType   ?? raw.plazo ?? null,
    currency:             raw.currency         ?? raw.moneda ?? null,
    marketValue:          raw.marketValue      ?? null,
    technicalPrice:       raw.technicalPrice   ?? raw.precioTecnico ?? null,
    yieldToMaturity:      raw.yieldToMaturity  ?? raw.tir ?? null,
    duration:             raw.duration         ?? raw.duracion ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractQuoteArray(raw: unknown): BymaQuote[] {
  const arr = Array.isArray(raw)
    ? raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (raw as any)?.data ?? (raw as any)?.content ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (arr as Record<string, any>[]).map(normalizeQuote);
}

// ---- Main fetch ----

export async function fetchBymaData(): Promise<BymaData> {
  // Get session cookie first
  let cookie = "";
  try {
    cookie = await getSessionCookie();
  } catch (err) {
    console.warn("[BYMA] Could not get session cookie:", err);
  }

  const [bondsRes, onsRes, indicesRes, equityRes, cdearsRes] = await Promise.allSettled([
    bymaGet("/public-bonds",           cookie),
    bymaGet("/negociable-obligations", cookie),
    bymaGet("/index-price",            cookie),
    bymaGet("/leading-equity",         cookie),
    bymaGet("/cedears",                cookie),
  ]);

  const publicBonds  = bondsRes.status   === "fulfilled" ? extractQuoteArray(bondsRes.value)    : [];
  const ons          = onsRes.status     === "fulfilled" ? extractQuoteArray(onsRes.value)       : [];
  const indicesRaw   = indicesRes.status === "fulfilled" ? (indicesRes.value as unknown)         : null;
  const equity       = equityRes.status  === "fulfilled" ? extractQuoteArray(equityRes.value)    : [];
  const cedears      = cdearsRes.status  === "fulfilled" ? extractQuoteArray(cdearsRes.value)    : [];

  // Log errors for debugging
  if (bondsRes.status  === "rejected") console.error("[BYMA] bonds:",   bondsRes.reason);
  if (onsRes.status    === "rejected") console.error("[BYMA] ONs:",     onsRes.reason);
  if (indicesRes.status === "rejected") console.error("[BYMA] indices:", indicesRes.reason);
  if (equityRes.status === "rejected") console.error("[BYMA] equity:",  equityRes.reason);
  if (cdearsRes.status === "rejected") console.error("[BYMA] cedears:", cdearsRes.reason);

  // Parse indices
  const indices: BymaIndex[] = [];
  if (indicesRaw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = Array.isArray(indicesRaw) ? indicesRaw : (indicesRaw as any)?.data ?? (indicesRaw as any)?.content ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of arr as Record<string, any>[]) {
      indices.push({
        symbol:       r.symbol      ?? r.indice ?? "",
        description:  r.description ?? r.nombre ?? "",
        lastValue:    r.lastValue   ?? r.ultimoValor ?? r.value ?? 0,
        changePercent: r.changePercent ?? r.variacion ?? 0,
        openingValue: r.openingValue ?? null,
        maxValue:     r.maxValue    ?? null,
        minValue:     r.minValue    ?? null,
        date:         r.date        ?? r.fecha ?? null,
      });
    }
  }

  // Determine if market is open: if any bond has today's date
  const today = new Date().toISOString().split("T")[0];
  const marketOpen = publicBonds.some(
    (b) => b.tradeDate && b.tradeDate.startsWith(today)
  );

  return {
    publicBonds,
    negotiableObligations: ons,
    indices,
    leadingEquity: equity,
    cedears,
    fetchedAt: new Date().toISOString(),
    marketOpen,
  };
}
