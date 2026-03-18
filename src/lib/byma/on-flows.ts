/**
 * on-flows.ts — Flujos de caja construidos desde prospectos oficiales
 *
 * Cada entrada contiene el calendario exacto de pagos (renta + amortización)
 * derivado del prospecto publicado en CNV/emisor. La clave del mapa es el
 * símbolo BASE de BYMA (sin sufijos D/C/O).
 *
 * AMORTIZACIÓN — convención "pct como monto absoluto sobre 100 VN":
 *   amortSchedule[i].pct = monto a pagar por cada 100 VN de nominal original
 *   Ejemplo YMCX: 20+20+60 = 100. NO es % del VR residual.
 *   La renta se calcula sobre VR VIGENTE (correcto para bonds amortizables).
 *
 * VERIFICACIÓN:
 *   Cuando existe flujo de MAE marketdata, el modal compara cada cupón
 *   contra esta tabla. Si coinciden (tolerancia ±0.02 en renta y amort),
 *   muestra badge "Prospecto ✓ MAE". Si difieren, muestra "Prospecto ⚠ MAE".
 */

export interface ProspectusFlowCupon {
  fechaPago:    string;   // "YYYY-MM-DD"
  numeroCupon:  string;
  vr:           number;   // VR al inicio del período
  renta:        number;   // cupón de ese período (sobre 100 VN)
  amortizacion: number;   // capital pagado en esta fecha
  amasR:        number;   // amortizacion + renta
  cashFlow:     number;   // total (= amasR)
  vrCartera:    number;   // VR al cierre (= vr - amortizacion)
}

export interface ProspectusFlow {
  moneda:          "USD" | "ARS";
  couponRate:      number;          // % anual
  couponFrequency: 1 | 2 | 4;      // pagos por año
  maturityDate:    string;          // "YYYY-MM-DD"
  dayCount:        "30/360" | "Actual/365" | "Actual/Actual";
  amortization:    "bullet" | "amortizing";
  source:          string;          // URL o descripción del prospecto
  detalle:         ProspectusFlowCupon[];
}

// ─── Helper: build periodic flows ─────────────────────────────────────────────
// amortSchedule.pct = monto ABSOLUTO sobre 100 VN original (NO % de VR actual)
// periodsPerYear: 2 = semi-anual, 4 = trimestral
function buildPeriodic(params: {
  couponRate:     number;        // % anual
  payDates:       string[];      // todas las fechas de pago en orden
  periodsPerYear: 2 | 4;
  amortSchedule?: { date: string; pct: number }[];
}): ProspectusFlowCupon[] {
  const { couponRate, payDates, periodsPerYear, amortSchedule = [] } = params;
  const periodRate = couponRate / periodsPerYear / 100;

  // Mapa date → monto absoluto a amortizar (sobre 100 VN original)
  const amortMap = new Map<string, number>(amortSchedule.map(a => [a.date, a.pct]));

  let vr = 100;
  return payDates.map((date, i) => {
    const renta        = parseFloat((vr * periodRate).toFixed(6));
    // amortizacion = monto absoluto (no % de VR vigente)
    const amortizacion = parseFloat((amortMap.get(date) ?? 0).toFixed(6));
    const amasR        = parseFloat((amortizacion + renta).toFixed(6));
    const vrCartera    = parseFloat((vr - amortizacion).toFixed(6));
    const entry: ProspectusFlowCupon = {
      fechaPago:    date,
      numeroCupon:  String(i + 1),
      vr:           parseFloat(vr.toFixed(6)),
      renta,
      amortizacion,
      amasR,
      cashFlow:     amasR,
      vrCartera,
    };
    vr = vrCartera;
    return entry;
  });
}

// ─── Mapa principal: base-ticker → flujo desde prospecto ─────────────────────
export const PROSPECTUS_FLOWS: Record<string, ProspectusFlow> = {

  // ── YPF S.A. — ON Clase XXXI (YMCX) ─────────────────────────────────────
  // Fuente: Aviso de Resultados ON Clase XXXI, YPF S.A. (sept 2024)
  //   Tasa: 8.75% nominal anual fija · Semestral (11-mar / 11-sep)
  //   Amortización: 20 abr-2029, 20 sep-2030, 60 sep-2031 (sobre 100 VN)
  //   Base: 30/360 · Moneda: USD Hard Dollar · Ley: Nueva York
  //   ISIN 144A: US984245AY67 · Reg S: USP989MJBV29
  "YMCX": {
    moneda:          "USD",
    couponRate:      8.75,
    couponFrequency: 2,
    maturityDate:    "2031-09-11",
    dayCount:        "30/360",
    amortization:    "amortizing",
    source:          "https://investors.ypf.com/documents/emisiones/internacionales/YPF-ONs-Clase-XXXI-Aviso-de-Resultados-(EXE).pdf",
    detalle: buildPeriodic({
      couponRate: 8.75,
      periodsPerYear: 2,
      payDates: [
        "2025-03-11", "2025-09-11",
        "2026-03-11", "2026-09-11",
        "2027-03-11", "2027-09-11",
        "2028-03-11", "2028-09-11",
        "2029-03-11", "2029-09-11",   // amort 20 VN
        "2030-03-11", "2030-09-11",   // amort 20 VN
        "2031-03-11", "2031-09-11",   // amort 60 VN (final)
      ],
      amortSchedule: [
        { date: "2029-09-11", pct: 20 },
        { date: "2030-09-11", pct: 20 },
        { date: "2031-09-11", pct: 60 },
      ],
    }),
  },

  // ── Telecom Argentina S.A. — ON Clase P (TLCP) ───────────────────────────
  // Fuente: BYMA hoja técnica confirmada · Clase P (REGS)
  //   Tasa: 9.25% anual fija · Semestral (~28-may / ~28-nov)
  //   Bullet · Ley NY · Vto: 28/05/2033
  "TLCP": {
    moneda:          "USD",
    couponRate:      9.25,
    couponFrequency: 2,
    maturityDate:    "2033-05-28",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "BYMA hoja técnica · Telecom Argentina Clase P (REGS)",
    detalle: buildPeriodic({
      couponRate: 9.25,
      periodsPerYear: 2,
      payDates: [
        "2021-11-28", "2022-05-28", "2022-11-28", "2023-05-28",
        "2023-11-28", "2024-05-28", "2024-11-28", "2025-05-28",
        "2025-11-28", "2026-05-28", "2026-11-28", "2027-05-28",
        "2027-11-28", "2028-05-28", "2028-11-28", "2029-05-28",
        "2029-11-28", "2030-05-28", "2030-11-28", "2031-05-28",
        "2031-11-28", "2032-05-28", "2032-11-28", "2033-05-28",
      ],
      amortSchedule: [
        { date: "2033-05-28", pct: 100 },
      ],
    }),
  },

  // ── Telecom Argentina S.A. — ON Clase M / Clase 21 (TLCM) ───────────────
  // Fuente: Aviso de Resultados Clase 21 (jul 2024) · infobae.com + iol
  //   Tasa: 9.50% anual fija · Semestral (18-ene / 18-jul)
  //   Bullet · USD 500 M · Vto: 18/07/2031
  "TLCM": {
    moneda:          "USD",
    couponRate:      9.50,
    couponFrequency: 2,
    maturityDate:    "2031-07-18",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "Aviso de Resultados Telecom Argentina Clase 21 (jul 2024)",
    detalle: buildPeriodic({
      couponRate: 9.50,
      periodsPerYear: 2,
      payDates: [
        "2025-01-18", "2025-07-18",
        "2026-01-18", "2026-07-18",
        "2027-01-18", "2027-07-18",
        "2028-01-18", "2028-07-18",
        "2029-01-18", "2029-07-18",
        "2030-01-18", "2030-07-18",
        "2031-01-18", "2031-07-18",
      ],
      amortSchedule: [
        { date: "2031-07-18", pct: 100 },
      ],
    }),
  },

  // ── Telecom Argentina S.A. — ON Clase 27 / Clase T (TLCT) ───────────────
  // Fuente: Aviso de Resultados Clase 27 (ene 2026) · infobae.com, TradingView
  //   Tasa: 8.50% anual fija · Semestral (20-ene / 20-jul)
  //   Bullet · USD 600 M · Vto: 20/01/2036 · Ley NY
  "TLCT": {
    moneda:          "USD",
    couponRate:      8.50,
    couponFrequency: 2,
    maturityDate:    "2036-01-20",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "Aviso de Resultados Telecom Argentina Clase 27 (ene 2026)",
    detalle: buildPeriodic({
      couponRate: 8.50,
      periodsPerYear: 2,
      payDates: [
        "2026-07-20",
        "2027-01-20", "2027-07-20",
        "2028-01-20", "2028-07-20",
        "2029-01-20", "2029-07-20",
        "2030-01-20", "2030-07-20",
        "2031-01-20", "2031-07-20",
        "2032-01-20", "2032-07-20",
        "2033-01-20", "2033-07-20",
        "2034-01-20", "2034-07-20",
        "2035-01-20", "2035-07-20",
        "2036-01-20",
      ],
      amortSchedule: [
        { date: "2036-01-20", pct: 100 },
      ],
    }),
  },

  // ── YPF S.A. — ON Clase XL / Clase XXXIX Adicional (YM39) ───────────────
  // Fuente: Aviso de Suscripción Clase XXXIX Adicional y XL (jul 2025) · YPF
  //   Tasa: 8.75% anual fija · Semestral (22-ene / 22-jul)
  //   Bullet · Vto: 22/07/2030
  //   NOTA: "39" en el ticker refiere a Clase XXXIX (número de serie), NO año 2039
  "YM39": {
    moneda:          "USD",
    couponRate:      8.75,
    couponFrequency: 2,
    maturityDate:    "2030-07-22",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "https://investors.ypf.com/documents/emisiones/locales/YPF-Clase-XXXIX-Adicional-y-XL-Aviso-de-Suscripcion-(EXE).pdf",
    detalle: buildPeriodic({
      couponRate: 8.75,
      periodsPerYear: 2,
      payDates: [
        "2026-01-22", "2026-07-22",
        "2027-01-22", "2027-07-22",
        "2028-01-22", "2028-07-22",
        "2029-01-22", "2029-07-22",
        "2030-01-22", "2030-07-22",
      ],
      amortSchedule: [
        { date: "2030-07-22", pct: 100 },
      ],
    }),
  },

  // ── YPF S.A. — ON Clase XLII (YM42) ─────────────────────────────────────
  // Fuente: Suplemento de Prospecto Clase XLII (feb 2026) · inversores.ypf.com
  //         Bruchou & Funes de Rioja (closing notice)
  //   Tasa: 7.00% anual fija · Semestral (2-jun / 2-dic) con short first/last
  //   Bullet · USD 194.9 M · Vto: 02/03/2029
  //   Primer período: 19/02/2026→02/06/2026 = 103 días (30/360) → renta = 2.002778
  //   Último período: 02/12/2028→02/03/2029 = 90 días (30/360) → renta = 1.75
  "YM42": {
    moneda:          "USD",
    couponRate:      7.00,
    couponFrequency: 2,
    maturityDate:    "2029-03-02",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "https://inversores.ypf.com/documents/emisiones/locales/YPF-Clase-XLII-Suplemento-de-Prospecto.pdf",
    detalle: [
      // Período 1 (short first): 19/02/2026 → 02/06/2026 = 103 días → 100 × 7% × 103/360
      { fechaPago: "2026-06-02", numeroCupon: "1",  vr: 100, renta: 2.002778, amortizacion:   0, amasR:   2.002778, cashFlow:   2.002778, vrCartera: 100 },
      // Períodos regulares (semi-anual = 180 días → 3.5)
      { fechaPago: "2026-12-02", numeroCupon: "2",  vr: 100, renta: 3.5,      amortizacion:   0, amasR:   3.5,      cashFlow:   3.5,      vrCartera: 100 },
      { fechaPago: "2027-06-02", numeroCupon: "3",  vr: 100, renta: 3.5,      amortizacion:   0, amasR:   3.5,      cashFlow:   3.5,      vrCartera: 100 },
      { fechaPago: "2027-12-02", numeroCupon: "4",  vr: 100, renta: 3.5,      amortizacion:   0, amasR:   3.5,      cashFlow:   3.5,      vrCartera: 100 },
      { fechaPago: "2028-06-02", numeroCupon: "5",  vr: 100, renta: 3.5,      amortizacion:   0, amasR:   3.5,      cashFlow:   3.5,      vrCartera: 100 },
      { fechaPago: "2028-12-02", numeroCupon: "6",  vr: 100, renta: 3.5,      amortizacion:   0, amasR:   3.5,      cashFlow:   3.5,      vrCartera: 100 },
      // Período 7 (short last): 02/12/2028 → 02/03/2029 = 90 días → 100 × 7% × 90/360 = 1.75
      { fechaPago: "2029-03-02", numeroCupon: "7",  vr: 100, renta: 1.75,     amortizacion: 100, amasR: 101.75,     cashFlow: 101.75,     vrCartera:   0 },
    ],
  },

  // ── Loma Negra C.I.A.S.A. — ON Clase 5 (LOC5) ───────────────────────────
  // Fuente: MAE marketdata + TradingView BCBA:LOC5D + LexLatin (jul 2025)
  //   Tasa: 8.00% anual fija · Semestral (24-ene / 24-jul)
  //   Bullet · USD 112.9 M · Vto: 24/07/2027
  "LOC5": {
    moneda:          "USD",
    couponRate:      8.00,
    couponFrequency: 2,
    maturityDate:    "2027-07-24",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "TradingView BCBA:LOC5D · MAE marketdata (jul 2025)",
    detalle: buildPeriodic({
      couponRate: 8.00,
      periodsPerYear: 2,
      payDates: [
        "2026-01-24", "2026-07-24",
        "2027-01-24", "2027-07-24",
      ],
      amortSchedule: [
        { date: "2027-07-24", pct: 100 },
      ],
    }),
  },

  // ── Pluspetrol S.A. — ON Clase 5 (PLC5) ─────────────────────────────────
  // Fuente: Bruchou & Funes de Rioja (closing notice nov 2025) · TradingView
  //   Tasa: 8.125% anual fija · Semestral (18-may / 18-nov)
  //   Bullet · USD 500 M · Vto: 18/05/2031 · Ley NY
  "PLC5": {
    moneda:          "USD",
    couponRate:      8.125,
    couponFrequency: 2,
    maturityDate:    "2031-05-18",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "https://bruchoufunes.com/en/pluspetrol-completes-us500m-notes-8-125-due-2031/",
    detalle: buildPeriodic({
      couponRate: 8.125,
      periodsPerYear: 2,
      payDates: [
        "2026-05-18", "2026-11-18",
        "2027-05-18", "2027-11-18",
        "2028-05-18", "2028-11-18",
        "2029-05-18", "2029-11-18",
        "2030-05-18", "2030-11-18",
        "2031-05-18",
      ],
      amortSchedule: [
        { date: "2031-05-18", pct: 100 },
      ],
    }),
  },

  // ── Petroquímica Comodoro Rivadavia S.A. — ON Clase O (PQCO) ─────────────
  // Fuente: TradingView BCBA:PQCOD · Aviso de Suscripción Clase O (sep 2023)
  //   Tasa: 0% — Zero-coupon · Bullet · Vto: 22/09/2027
  //   USD-denominado, liquidable en pesos al tipo de cambio aplicable
  //   ISIN: ARPETQ5600N8
  "PQCO": {
    moneda:          "USD",
    couponRate:      0,
    couponFrequency: 2,    // irrelevante (zero-coupon), campo requerido por interface
    maturityDate:    "2027-09-22",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "TradingView BCBA:PQCOD · Aviso de Suscripción PCR Clase O (sep 2023)",
    detalle: [
      // Zero-coupon: único pago al vencimiento = 100 VN
      {
        fechaPago: "2027-09-22", numeroCupon: "1",
        vr: 100, renta: 0, amortizacion: 100, amasR: 100, cashFlow: 100, vrCartera: 0,
      },
    ],
  },

  // ── FCA Compañía Financiera S.A. — ON Clase XXII Serie I (FTN1) ──────────
  // Fuente: TradingView BCBA:FTN1D · LexLatin · PAGBAM (feb 2026)
  //   Tasa: 8.99% anual fija sobre VR en UVA · Trimestral (24-feb/may/ago/nov)
  //   Amortización: 33.33% trim 18 (ago-27) + 33.33% trim 21 (nov-27) + 33.34% trim 24 (feb-28)
  //   ARS / UVA — liquida en pesos ajustados por UVA · ISIN: AR0436510025
  //   NOTA: moneda ARS porque el subyacente es UVA (inflation-indexed pesos)
  "FTN1": {
    moneda:          "ARS",
    couponRate:      8.99,
    couponFrequency: 4,
    maturityDate:    "2028-02-24",
    dayCount:        "30/360",
    amortization:    "amortizing",
    source:          "TradingView BCBA:FTN1D · LexLatin · PAGBAM Clase XXII Serie I (feb 2026)",
    detalle: [
      // Q1–Q5: VR=100, renta = 100 × 8.99/4/100 = 2.2475
      { fechaPago: "2026-05-24", numeroCupon: "1", vr: 100,      renta: 2.247500, amortizacion:  0,       amasR:  2.247500, cashFlow:  2.247500, vrCartera: 100      },
      { fechaPago: "2026-08-24", numeroCupon: "2", vr: 100,      renta: 2.247500, amortizacion:  0,       amasR:  2.247500, cashFlow:  2.247500, vrCartera: 100      },
      { fechaPago: "2026-11-24", numeroCupon: "3", vr: 100,      renta: 2.247500, amortizacion:  0,       amasR:  2.247500, cashFlow:  2.247500, vrCartera: 100      },
      { fechaPago: "2027-02-24", numeroCupon: "4", vr: 100,      renta: 2.247500, amortizacion:  0,       amasR:  2.247500, cashFlow:  2.247500, vrCartera: 100      },
      { fechaPago: "2027-05-24", numeroCupon: "5", vr: 100,      renta: 2.247500, amortizacion:  0,       amasR:  2.247500, cashFlow:  2.247500, vrCartera: 100      },
      // Q6 (mes 18): amort 33.3333 VN → VR→66.6667; renta sobre VR=100
      { fechaPago: "2027-08-24", numeroCupon: "6", vr: 100,      renta: 2.247500, amortizacion: 33.3333, amasR: 35.580800, cashFlow: 35.580800, vrCartera:  66.6667 },
      // Q7 (mes 21): amort 33.3333 VN → VR→33.3334; renta sobre VR=66.6667
      { fechaPago: "2027-11-24", numeroCupon: "7", vr:  66.6667, renta: 1.498334, amortizacion: 33.3333, amasR: 34.831634, cashFlow: 34.831634, vrCartera:  33.3334 },
      // Q8 (mes 24): amort 33.3334 VN → VR→0; renta sobre VR=33.3334
      { fechaPago: "2028-02-24", numeroCupon: "8", vr:  33.3334, renta: 0.749169, amortizacion: 33.3334, amasR: 34.082569, cashFlow: 34.082569, vrCartera:   0      },
    ],
  },

};

/**
 * Retorna el flujo de fondos desde el prospecto para un ticker BYMA (con o sin
 * sufijo de liquidación). Retorna null si el bono no está en la base.
 */
export function getProspectusFlow(bymaTicker: string): ProspectusFlow | null {
  // Strip standard settlement suffix (D, C, O)
  const base = bymaTicker.length > 2 && /[DCO]$/.test(bymaTicker)
    ? bymaTicker.slice(0, -1)
    : bymaTicker;
  return PROSPECTUS_FLOWS[base] ?? null;
}

/**
 * Compara flujo MAE vs flujo prospecto.
 * Retorna "match" si todos los flujos futuros coinciden (tolerancia ±0.02),
 * "diff" si hay diferencias materiales, o "prospectus-only" si no hay MAE.
 */
export type FlowCompareResult = "match" | "diff" | "prospectus-only" | "mae-only";

export function compareFlows(
  prospectusFlow: ProspectusFlowCupon[],
  maeFlow: ProspectusFlowCupon[] | { fechaPago: string; renta: number; amortizacion: number }[],
): FlowCompareResult {
  if (maeFlow.length === 0) return "prospectus-only";
  if (prospectusFlow.length === 0) return "mae-only";

  const today = new Date().toISOString().slice(0, 10);
  // Solo comparar cupones futuros
  const futureProsp = prospectusFlow.filter(c => c.fechaPago >= today);
  const futureMae   = maeFlow.filter(c => c.fechaPago >= today);

  if (futureProsp.length === 0 || futureMae.length === 0) return "match";

  // Alinear por fechaPago
  const maeByDate = new Map(futureMae.map(c => [c.fechaPago.slice(0, 10), c]));
  let diffs = 0;

  for (const pc of futureProsp) {
    const mc = maeByDate.get(pc.fechaPago);
    if (!mc) { diffs++; continue; }
    if (Math.abs(pc.renta - mc.renta) > 0.02 || Math.abs(pc.amortizacion - mc.amortizacion) > 0.02) {
      diffs++;
    }
  }

  return diffs === 0 ? "match" : "diff";
}
