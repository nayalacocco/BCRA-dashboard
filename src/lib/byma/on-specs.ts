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
    issuer:          "YPF S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    "2039-01-01", // ← verificar
    amortization:    "bullet",
    currency:        "USD",
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
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null, // ← completar
    amortization:    "bullet",
    currency:        "USD",
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
    issuer:          "Pluspetrol Capital Corp.",  // ← verificar emisor
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
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
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
  },
  "TLCP": {
    issuer:          "Telecom Argentina S.A.",
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
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

  // ── LOC6 (Loma Negra / Llobregat?) ───────────────────────────────────────
  "LOC6": {
    issuer:          "— completar emisor",  // ← verificar
    couponRate:      null,
    couponFrequency: 2,
    maturityDate:    null,
    amortization:    "bullet",
    currency:        "USD",
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
  if (bymaTicker.length > 2 && /[DC]$/.test(bymaTicker)) {
    return bymaTicker.slice(0, -1);
  }
  return bymaTicker;
}

/** Retorna la spec para un símbolo BYMA (con o sin sufijo de moneda). */
export function getONSpec(bymaTicker: string): ONSpec | null {
  const base = getBaseSymbol(bymaTicker);
  return ON_SPECS[base] ?? null;
}
