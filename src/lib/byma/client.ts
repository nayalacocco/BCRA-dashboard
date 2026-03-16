/**
 * BYMA (Bolsas y Mercados Argentinos) — free public API.
 * Source: open.bymadata.com.ar (same API used by BYMA's own website)
 * No authentication required.
 *
 * ⚠️  Server-side only — call via Next.js API route.
 *     All endpoints require POST with JSON body.
 *
 * ⚠️  SSL: open.bymadata.com.ar uses an intermediate CA cert not in Node's
 *     built-in bundle. We use https.request with rejectUnauthorized:false
 *     (same approach as the PyOBD library). This is safe because we're only
 *     reading public market data with no auth credentials at risk.
 *
 * Rate strategy: ISR revalidate=300 (5 min).
 * ~90 fetches/day during 7.5h market hours. Cost = $0.
 *
 * Response shapes:
 *  - /public-bonds, /leading-equity  → { content: {...}, data: [...] }
 *  - /cedears, /negociable-obligations → [...] (array directly)
 *  - /index-price → { content: {...}, data: [] } (empty outside market hours)
 */

import https from "https";

const BASE_HOST = "open.bymadata.com.ar";
const BASE_PATH = "/vanoms-be-core/rest/api/bymadata/free";
const BASE      = `https://${BASE_HOST}${BASE_PATH}`;

// POST body: include all settlement types, including zero-price records
const DEFAULT_BODY = JSON.stringify({
  excludeZeroPxAndQty: false,
  T2: true,
  T1: true,
  T0: true,
});

const HEADERS = {
  "Accept":       "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Origin":       "https://open.bymadata.com.ar",
  "Referer":      "https://open.bymadata.com.ar/",
};

// ---- Types ----

export interface BymaQuote {
  symbol:               string;
  description:          string;
  lastPrice:            number | null;   // best available price
  previousClosingPrice: number | null;   // previous day's close
  changePercent:        number | null;   // % change vs prev close (null if no trading today)
  volume:               number | null;   // number of contracts/shares
  volumeAmount:         number | null;   // nominal value traded (ARS)
  openingPrice:         number | null;
  maxPrice:             number | null;
  minPrice:             number | null;
  closingPrice:         number | null;   // today's closing (0 = no trading yet)
  settlementType:       string | null;   // "CI" | "24HS" | "48HS"
  currency:             string | null;   // "ARS" | "USD"
  maturityDate:         string | null;   // ISO date for bonds
  daysToMaturity:       number | null;
  securityType:         string | null;   // "GO"=govt bond, "CS"=stock, "CD"=CEDEAR, "CORP"=ON
}

export interface BymaIndex {
  symbol:        string;
  description:   string;
  lastValue:     number;
  changePercent: number;
  openingValue:  number | null;
  maxValue:      number | null;
  minValue:      number | null;
  date:          string | null;
}

export interface BymaData {
  publicBonds:            BymaQuote[];   // Bonos soberanos
  negotiableObligations:  BymaQuote[];   // ONs corporativas
  indices:                BymaIndex[];   // Merval, etc. (empty outside market hours)
  leadingEquity:          BymaQuote[];   // Acciones líderes (Panel Merval)
  cedears:                BymaQuote[];   // CEDEARs
  fetchedAt:              string;        // ISO timestamp
  marketOpen:             boolean;
}

// ---- Fetch helper ----
// Uses https.request (not fetch) to allow rejectUnauthorized:false
// for BYMA's non-standard SSL cert.

// Singleton agent — reuse across requests in the same Lambda invocation
const bymaAgent = new https.Agent({ rejectUnauthorized: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bymaPost(path: string): Promise<Record<string, any>[]> {
  const json = await new Promise<unknown>((resolve, reject) => {
    const req = https.request(
      {
        hostname: BASE_HOST,
        path:     BASE_PATH + path,
        method:   "POST",
        headers:  {
          ...HEADERS,
          "Content-Length": Buffer.byteLength(DEFAULT_BODY),
        },
        agent: bymaAgent,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`BYMA ${res.statusCode} — ${path}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(DEFAULT_BODY);
    req.end();
  });

  // Some endpoints return a raw array; others wrap in { data: [...] }
  if (Array.isArray(json)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return json as Record<string, any>[];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json as Record<string, unknown>)?.data ?? []) as Record<string, any>[];
}

// ---- Normalizers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeQuote(raw: Record<string, any>): BymaQuote {
  const prevPx = raw.previousClosingPrice || raw.previousSettlementPrice || null;

  // Best "current" price: today's closing → VWAP → last trade → prev close
  const todayPx: number | null =
    raw.closingPrice > 0 ? (raw.closingPrice as number)
    : raw.vwap       > 0 ? (raw.vwap        as number)
    : raw.trade      > 0 ? (raw.trade       as number)
    : null;

  const lastPrice = todayPx ?? prevPx;

  // Change % vs previous close (only meaningful when there's trading today)
  let changePercent: number | null = null;
  if (todayPx != null && prevPx != null && prevPx !== 0) {
    changePercent = ((todayPx - prevPx) / Math.abs(prevPx)) * 100;
  }

  // Settlement type numeric → string
  const settlementMap: Record<string, string> = { "1": "CI", "2": "24HS", "3": "48HS" };

  return {
    symbol:               raw.symbol                                    ?? "",
    description:          (raw.securityDesc || raw.symbol || ""),
    lastPrice,
    previousClosingPrice: prevPx,
    changePercent,
    volume:               raw.volume       > 0 ? raw.volume       : null,
    volumeAmount:         raw.volumeAmount > 0 ? raw.volumeAmount : null,
    openingPrice:         raw.openingPrice > 0 ? raw.openingPrice : null,
    maxPrice:             raw.tradingHighPrice > 0 ? raw.tradingHighPrice : null,
    minPrice:             raw.tradingLowPrice  > 0 ? raw.tradingLowPrice  : null,
    closingPrice:         raw.closingPrice > 0 ? raw.closingPrice : null,
    settlementType:       settlementMap[String(raw.settlementType)] ?? raw.settlementType ?? null,
    currency:             raw.denominationCcy === "EXT" ? "USD" : (raw.denominationCcy ?? null),
    maturityDate:         raw.maturityDate ?? null,
    daysToMaturity:       raw.daysToMaturity ?? null,
    securityType:         raw.securityType ?? null,
  };
}

/**
 * Deduplicate quotes: one entry per symbol.
 * Priority for settlement type: 24HS > CI > 48HS
 * (24hs is the most actively traded settlement in Argentina)
 */
function deduplicateBySymbol(quotes: BymaQuote[]): BymaQuote[] {
  const priority: Record<string, number> = { "24HS": 1, "CI": 2, "48HS": 3 };
  const map = new Map<string, BymaQuote>();

  for (const q of quotes) {
    const existing = map.get(q.symbol);
    if (!existing) {
      map.set(q.symbol, q);
    } else {
      const p1 = priority[existing.settlementType ?? ""] ?? 99;
      const p2 = priority[q.settlementType ?? ""]       ?? 99;
      if (p2 < p1) map.set(q.symbol, q);
    }
  }

  return Array.from(map.values());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIndex(raw: Record<string, any>): BymaIndex {
  // Raw BYMA index-price fields (verified from live API):
  //   price              → current / last available value
  //   previousClosingPrice → prior day close
  //   variation          → change as decimal (e.g. -0.0138 = -1.38%) — multiply by 100
  //   trade              → last trade
  //   highValue / minValue → intraday high/low
  //   description        → human-readable name
  const lastValue =
    (raw.price               > 0 ? raw.price               : null) ??
    (raw.trade               > 0 ? raw.trade               : null) ??
    (raw.previousClosingPrice > 0 ? raw.previousClosingPrice : null) ??
    0;

  const changePercent =
    raw.variation != null ? (raw.variation as number) * 100
    : (raw.changePercent ?? 0);

  return {
    symbol:        raw.symbol      ?? "",
    description:   raw.description ?? raw.symbol ?? "",
    lastValue,
    changePercent,
    openingValue:  null, // not in raw response
    maxValue:      raw.highValue > 0 ? raw.highValue : null,
    minValue:      raw.minValue  > 0 ? raw.minValue  : null,
    date:          raw.date ?? null,
  };
}

// ---- Main fetch ----

export async function fetchBymaData(): Promise<BymaData> {
  const [bondsRes, onsRes, indicesRes, equityRes, cdearsRes] = await Promise.allSettled([
    bymaPost("/public-bonds"),
    bymaPost("/negociable-obligations"),
    bymaPost("/index-price"),
    bymaPost("/leading-equity"),
    bymaPost("/cedears"),
  ]);

  if (bondsRes.status   === "rejected") console.error("[BYMA] bonds:",   bondsRes.reason);
  if (onsRes.status     === "rejected") console.error("[BYMA] ONs:",     onsRes.reason);
  if (indicesRes.status === "rejected") console.error("[BYMA] indices:", indicesRes.reason);
  if (equityRes.status  === "rejected") console.error("[BYMA] equity:",  equityRes.reason);
  if (cdearsRes.status  === "rejected") console.error("[BYMA] cedears:", cdearsRes.reason);

  const rawBonds  = bondsRes.status  === "fulfilled" ? bondsRes.value  : [];
  const rawOns    = onsRes.status    === "fulfilled" ? onsRes.value    : [];
  const rawIdx    = indicesRes.status === "fulfilled" ? indicesRes.value : [];
  const rawEquity = equityRes.status === "fulfilled" ? equityRes.value : [];
  const rawCdears = cdearsRes.status === "fulfilled" ? cdearsRes.value : [];

  // Normalize quotes and deduplicate by symbol
  const publicBonds           = deduplicateBySymbol(rawBonds.map(normalizeQuote));
  const negotiableObligations = deduplicateBySymbol(rawOns.map(normalizeQuote));
  const leadingEquity         = deduplicateBySymbol(rawEquity.map(normalizeQuote));
  const cedears               = deduplicateBySymbol(rawCdears.map(normalizeQuote));
  const indices               = rawIdx.map(normalizeIndex);

  // Market is open when we have trading data today
  // (closingPrice > 0 for any bond = market was open today)
  const marketOpen = publicBonds.some((b) => b.closingPrice != null && b.closingPrice > 0)
    || leadingEquity.some((e) => e.closingPrice != null && e.closingPrice > 0);

  return {
    publicBonds,
    negotiableObligations,
    indices,
    leadingEquity,
    cedears,
    fetchedAt: new Date().toISOString(),
    marketOpen,
  };
}
