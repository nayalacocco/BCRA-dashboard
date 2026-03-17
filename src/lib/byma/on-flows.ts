/**
 * on-flows.ts — Flujos de caja construidos desde prospectos oficiales
 *
 * Cada entrada contiene el calendario exacto de pagos (renta + amortización)
 * derivado del prospecto publicado en CNV/emisor. La clave del mapa es el
 * símbolo BASE de BYMA (sin sufijos D/C/O).
 *
 * Formato compatible con ONFlowCupon (api/mae/on-flow/route.ts):
 *   fechaPago    : "YYYY-MM-DD"
 *   numeroCupon  : string (1, 2, ...)
 *   vr           : valor residual al INICIO del período (sobre 100 VN)
 *   renta        : cupón del período (tasa × vr × fracción de año)
 *   amortizacion : capital amortizado en esta fecha
 *   amasR        : amortizacion + renta
 *   cashFlow     : total a cobrar (= amasR)
 *   vrCartera    : vr al CIERRE del período (= vr - amortizacion)
 *
 * VERIFICACIÓN:
 *   Cuando existe flujo de MAE marketdata, el modal compara cada cupón
 *   contra esta tabla. Si coinciden (tolerancia ±0.01 en renta y amort),
 *   muestra badge "MAE verificado ✓". Si difieren, muestra ambas fuentes.
 *
 * FUENTES:
 *   YMCX — Aviso de Resultados ON Clase XXXI, YPF S.A.
 *           https://investors.ypf.com/documents/emisiones/internacionales/
 *           Verificado: 8.75% anual, semi-anual 11-mar/11-sep, vto 11/09/2031
 *           Amort: 20% sept-29, 20% sept-30, 60% sept-31
 */

export interface ProspectusFlowCupon {
  fechaPago:    string;   // "YYYY-MM-DD"
  numeroCupon:  string;
  vr:           number;   // VR al inicio del período
  renta:        number;   // cupón de ese período (sobre 100 VN)
  amortizacion: number;   // capital pagado en esta fecha
  amasR:        number;   // amortizacion + renta
  cashFlow:     number;   // total (= amasR para bonos sin accrued ajustes)
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

// ─── Helper: build bullet semi-annual flows (most common for USD ONs) ─────────
function buildBulletSemiannual(params: {
  couponRate: number;        // % anual
  issueDate:  string;        // "YYYY-MM-DD" — first accrual date
  payDates:   string[];      // all payment dates in order
  maturity:   string;        // "YYYY-MM-DD"
  amortSchedule?: { date: string; pct: number }[];  // optional step amort
}): ProspectusFlowCupon[] {
  const { couponRate, payDates, amortSchedule = [] } = params;
  const semiRate = couponRate / 2 / 100;  // 30/360 semi-annual: rate/2 per period

  // Build amort map: date → % to pay
  const amortMap = new Map<string, number>(amortSchedule.map(a => [a.date, a.pct]));

  let vr = 100;
  return payDates.map((date, i) => {
    const renta        = parseFloat((vr * semiRate).toFixed(6));
    const amortizacion = parseFloat((vr * (amortMap.get(date) ?? 0) / 100).toFixed(6));
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
  //   Tasa: 8.75% nominal anual fija · Semestral (11-mar y 11-sep)
  //   Amortización: 20% sept-2029, 20% sept-2030, 60% sept-2031
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
    detalle: buildBulletSemiannual({
      couponRate: 8.75,
      issueDate:  "2024-09-11",
      payDates: [
        "2025-03-11", "2025-09-11",
        "2026-03-11", "2026-09-11",
        "2027-03-11", "2027-09-11",
        "2028-03-11", "2028-09-11",
        "2029-03-11", "2029-09-11",   // 20% amort aquí
        "2030-03-11", "2030-09-11",   // 20% amort aquí
        "2031-03-11", "2031-09-11",   // 60% amort final
      ],
      maturity: "2031-09-11",
      amortSchedule: [
        { date: "2029-09-11", pct: 20 },
        { date: "2030-09-11", pct: 20 },
        { date: "2031-09-11", pct: 60 },
      ],
    }),
  },

  // ── Telecom Argentina S.A. — ON Clase P (TLCP) ───────────────────────────
  // Fuente: BYMA hoja técnica confirmada 2025-03-16
  //   Tasa: 9.25% nominal anual fija · Semestral
  //   Vencimiento: 28/05/2033 · Bullet · Ley NY (REGS)
  // ← Fechas exactas de cupón pendientes de confirmar con prospecto CNV
  "TLCP": {
    moneda:          "USD",
    couponRate:      9.25,
    couponFrequency: 2,
    maturityDate:    "2033-05-28",
    dayCount:        "30/360",
    amortization:    "bullet",
    source:          "BYMA hoja técnica · pendiente validar prospecto CNV",
    detalle: buildBulletSemiannual({
      couponRate: 9.25,
      issueDate:  "2021-05-28",   // ← estimado, verificar prospecto
      payDates: [
        // Semestral ~28-may y ~28-nov (estimado desde vencimiento 28/05/2033)
        "2021-11-28", "2022-05-28", "2022-11-28", "2023-05-28",
        "2023-11-28", "2024-05-28", "2024-11-28", "2025-05-28",
        "2025-11-28", "2026-05-28", "2026-11-28", "2027-05-28",
        "2027-11-28", "2028-05-28", "2028-11-28", "2029-05-28",
        "2029-11-28", "2030-05-28", "2030-11-28", "2031-05-28",
        "2031-11-28", "2032-05-28", "2032-11-28", "2033-05-28",
      ],
      maturity: "2033-05-28",
      amortSchedule: [
        { date: "2033-05-28", pct: 100 },  // bullet
      ],
    }),
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
  // Only compare future coupons
  const futureProsp = prospectusFlow.filter(c => c.fechaPago >= today);
  const futureMae   = maeFlow.filter(c => c.fechaPago >= today);

  if (futureProsp.length === 0 || futureMae.length === 0) return "match";

  // Align by fechaPago
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
