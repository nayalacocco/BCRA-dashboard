/**
 * on-specs.ts — Base de datos estática de especificaciones de ONs
 *
 * CÓMO COMPLETAR:
 *   1. couponRate: tasa de cupón anual en % (e.g. 8.75 para 8.75% anual)
 *   2. couponFrequency: pagos por año — 1=anual, 2=semestral, 4=trimestral
 *   3. maturityDate: "YYYY-MM-DD" — fecha de vencimiento del bono
 *   4. amortization: "bullet" si paga todo al vencimiento, "amortizing" si
 *      hace pagos parciales de capital durante la vida. Para amortizing,
 *      completar amortizationSchedule con { date, pct } donde pct es el %
 *      del capital nominal que se paga en esa fecha (deben sumar 100).
 *   5. isin: ISIN argentino (AR + 10 dígitos) — opcional pero útil para lookup.
 *
 * FUENTES para completar:
 *   - A3 Mercados API (ya tenemos la key)
 *   - BYMA OMS / Hoja Técnica en bymadata.com.ar
 *   - Prospecto en cnv.gob.ar
 *
 * La clave del mapa es el SÍMBOLO BASE de BYMA (sin sufijos de moneda:
 *   D=MEP, C=cable). Ej: "YM38D" → clave "YM38".
 */

export interface CouponPayment {
  date: string;  // "YYYY-MM-DD"
  pct:  number;  // % del capital nominal (deben sumar 100 para amortizing)
}

export interface ONSpec {
  issuer:           string;
  // ─── Cupón ────────────────────────────────────────────────────────────
  couponRate:       number | null;  // % anual, e.g. 8.75
  couponFrequency:  1 | 2 | 4 | null;  // pagos/año: 1 anual, 2 sem, 4 trim
  // ─── Amortización ─────────────────────────────────────────────────────
  maturityDate:     string | null;  // "YYYY-MM-DD"
  amortization:     "bullet" | "amortizing" | null;
  /** Solo para amortization:"amortizing" — porcentajes de capital por fecha */
  amortizationSchedule?: CouponPayment[];
  // ─── Extra ────────────────────────────────────────────────────────────
  isin?:            string;
  currency:         "USD" | "ARS";
  /** Texto libre para mostrar en la UI, e.g. "Clase IX · Ley NY" */
  series?:          string;
}

// ─── Mapa: símbolo base → especificaciones ──────────────────────────────────
// TODO: completar los campos null con los datos de A3 / BYMA OMS.
export const ON_SPECS: Record<string, ONSpec> = {

  // ── YPF S.A. (YM prefix) ─────────────────────────────────────────────────
  "YM38": {
    issuer:          "YPF S.A.",
    couponRate:      null, // ← completar desde A3
    couponFrequency: 2,    // típicamente semestral para YPF
    maturityDate:    "2038-01-01", // ← verificar fecha exacta
    amortization:    "bullet",
    currency:        "USD",
  },
  "YMCI": {
    issuer:          "YPF S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null, // ← completar
    amortization:    "bullet",
    currency:        "USD",
  },
  "YM39": {
    // Clase XL / XXXIX Adicional — "39" refiere a Clase XXXIX, NO año 2039
    issuer:          "YPF S.A.",
    couponRate:      8.75,
    couponFrequency: 2,
    maturityDate:    "2030-07-22",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase XL / XXXIX Adicional",
  },
  "YM40": {
    issuer:          "YPF S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2040-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
  },
  "YMCX": {
    issuer:          "YPF S.A.",
    couponRate:      8.75,           // confirmado: Aviso de Resultados Clase XXXI
    couponFrequency: 2,              // semi-anual: 11-mar y 11-sep
    maturityDate:    "2031-09-11",   // confirmado
    amortization:    "amortizing",   // 20% sept-29, 20% sept-30, 60% sept-31
    currency:        "USD",
    series:          "Clase XXXI · Ley NY · ISIN US984245AY67",
    amortizationSchedule: [
      { date: "2029-09-11", pct: 20 },
      { date: "2030-09-11", pct: 20 },
      { date: "2031-09-11", pct: 60 },
    ],
  },
  "YMCJ": {
    issuer:          "YPF S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null, // ← completar
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Vista Oil & Gas S.A.U. (VSC prefix) ──────────────────────────────────
  "VSCR": {
    issuer:          "Vista Oil & Gas S.A.U.",
    couponRate:      null, // ← completar
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "VSCV": {
    issuer:          "Vista Oil & Gas S.A.U.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "VSCT": {
    issuer:          "Vista Oil & Gas S.A.U.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Metrogas S.A. (MTCG prefix) ──────────────────────────────────────────
  "MTCG": {
    issuer:          "Metrogas S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Mastellone Hermanos S.A. / MG (MGCO prefix) ──────────────────────────
  "MGCO": {
    issuer:          "MG — completar nombre",  // ← verificar emisor
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Pampa Energía S.A. (PN prefix) ───────────────────────────────────────
  "PN42": {
    issuer:          "Pampa Energía S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2042-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
  },
  "PN37": {
    issuer:          "Pampa Energía S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2037-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
  },
  "PN35": {
    issuer:          "Pampa Energía S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2035-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
  },
  "PN38": {
    issuer:          "Pampa Energía S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2038-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
  },
  "PNXC": {
    issuer:          "Pampa Energía S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Pluspetrol Capital Corp. / PLC (PLC prefix) ──────────────────────────
  "PLC5": {
    issuer:          "Pluspetrol S.A.",
    couponRate:      8.125,
    couponFrequency: 2,
    maturityDate:    "2031-05-18",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase 5 · Ley NY · USD 500 M",
  },
  "PLC4": {
    issuer:          "Pluspetrol Capital Corp.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Tecpetrol S.A. (TSC prefix) ──────────────────────────────────────────
  "TSC4": {
    issuer:          "Tecpetrol S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "TSC3": {
    issuer:          "Tecpetrol S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── MIC3 ─────────────────────────────────────────────────────────────────
  "MIC3": {
    issuer:          "— completar emisor",  // ← verificar
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── ZPC3 ─────────────────────────────────────────────────────────────────
  "ZPC3": {
    issuer:          "— completar emisor",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── DEC2 ─────────────────────────────────────────────────────────────────
  "DEC2": {
    issuer:          "— completar emisor",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Oleoducto Central S.A. (OZC prefix) ──────────────────────────────────
  "OZC3": {
    issuer:          "Oleoducto Central S.A.",  // ← verificar
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── RUCD ─────────────────────────────────────────────────────────────────
  "RUCD": {
    issuer:          "— completar emisor",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── DNC prefix ───────────────────────────────────────────────────────────
  "DNC5": {
    issuer:          "— completar emisor",  // ← verificar (¿Distribuidora de Gas?)
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "DNC7": {
    issuer:          "— completar emisor",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "DNC3": {
    issuer:          "— completar emisor",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Telecom Argentina S.A. (TLC prefix) ──────────────────────────────────
  "TLCM": {
    issuer:          "Telecom Argentina S.A.",
    couponRate:      9.50,
    couponFrequency: 2,
    maturityDate:    "2031-07-18",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase 21 (M) · Ley NY · USD 500 M",
  },
  "TLCP": {
    issuer:          "Telecom Argentina S.A.",
    couponRate:      9.25,           // REGS 9.25% — confirmado BYMA 2025-03-16
    couponFrequency: 2,              // semi-anual
    maturityDate:    "2033-05-28",   // confirmado BYMA: "V. 28/05/33"
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase P · Ley NY (REGS)",
  },
  "TLCT": {
    issuer:          "Telecom Argentina S.A.",
    couponRate:      8.50,
    couponFrequency: 2,
    maturityDate:    "2036-01-20",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase 27 (T) · Ley NY · USD 600 M",
  },

  // ── IRSA Propiedades Comerciales S.A. (IRC prefix) ───────────────────────
  "IRCP": {
    issuer:          "IRSA Propiedades Comerciales S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── Loma Negra C.I.A.S.A. — Clase 5 (LOC5) ──────────────────────────────
  "LOC5": {
    issuer:          "Loma Negra C.I.A.S.A.",
    couponRate:      8.00,
    couponFrequency: 2,
    maturityDate:    "2027-07-24",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase 5 · USD 112.9 M",
  },

  // ── Loma Negra C.I.A.S.A. — Clase 6 (LOC6) ──────────────────────────────
  "LOC6": {
    issuer:          "Loma Negra C.I.A.S.A.",
    couponRate:      null,  // ← completar
    couponFrequency: 2,
    maturityDate:    null,  // ← completar
    amortization:    "bullet",
    currency:        "USD",
  },

  // ── YPF S.A. — ON Clase XLII (YM42) ──────────────────────────────────────
  // Tasa: 7.00% · Short first (103d) + short last (90d) + 5 regulares
  "YM42": {
    issuer:          "YPF S.A.",
    couponRate:      7.00,
    couponFrequency: 2,
    maturityDate:    "2029-03-02",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase XLII · USD 194.9 M",
  },

  // ── Petroquímica Comodoro Rivadavia S.A. — Clase O (PQCO) ────────────────
  // Zero-coupon — retorno vía descuento al precio de compra. TIR implícita ~13%.
  "PQCO": {
    issuer:          "Petroquímica Comodoro Rivadavia S.A.",
    couponRate:      0,
    couponFrequency: null,
    maturityDate:    "2027-09-22",
    amortization:    "bullet",
    currency:        "USD",
    series:          "Clase O · Zero-coupon · ISIN ARPETQ5600N8",
  },

  // ── FCA Compañía Financiera S.A. — Clase XXII Serie I (FTN1) ─────────────
  // UVA-indexed, trimestral, amortizable en 3 tramos (meses 18/21/24)
  "FTN1": {
    issuer:          "FCA Compañía Financiera S.A.",
    couponRate:      8.99,
    couponFrequency: 4,
    maturityDate:    "2028-02-24",
    amortization:    "amortizing",
    currency:        "ARS",   // UVA → liquida en pesos
    series:          "Clase XXII Serie I · UVA · ISIN AR0436510025",
    amortizationSchedule: [
      { date: "2027-08-24", pct: 33.3333 },
      { date: "2027-11-24", pct: 33.3333 },
      { date: "2028-02-24", pct: 33.3334 },
    ],
  },
};

/**
 * Extrae el símbolo base de BYMA eliminando el sufijo de moneda/liquidación.
 *
 * Regla: si el último carácter es D (MEP) o C (cable), se elimina.
 * Ejemplos:
 *   "YM38D"  → "YM38"
 *   "YMCXD"  → "YMCX"
 *   "TLCMD"  → "TLCM"
 *   "YM34C"  → "YM34"
 *   "AL30"   → "AL30"  (sin sufijo, no se modifica)
 */
export function getBaseSymbol(bymaTicker: string): string {
  if (bymaTicker.length > 2 && /[DCO]$/.test(bymaTicker)) {
    return bymaTicker.slice(0, -1);
  }
  return bymaTicker;
}

/** Retorna la spec para un símbolo BYMA (con o sin sufijo de moneda). */
export function getONSpec(bymaTicker: string): ONSpec | null {
  const base = getBaseSymbol(bymaTicker);
  return ON_SPECS[base] ?? null;
}
