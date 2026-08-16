// Cálculos puros de reportes — separados del acceso a datos para poder
// testear la precisión matemática sin levantar una base de datos (ver
// reports-math.util.spec.ts). El servicio (reports.service.ts) solo arma
// las agregaciones SQL/Prisma y les aplica estas funciones.

export interface TaxRateGroup {
  taxRate: number; // alícuota numérica (21, 10.5, 0, …)
  sumTotal: number; // suma de OrderItem.total (IVA incluido) para ese grupo
}

export interface VatBreakdownEntry {
  rate: number;
  amount: number;
}

// OrderItem.total ya incluye el IVA (precios con impuesto incorporado, no
// discriminado en el checkout — ver orders.service.ts VAT_RATE_MAP). Para
// una alícuota fija, el IVA contenido en un total es total - total/(1+r).
// Es una división exacta dentro de cada grupo porque taxRate es constante
// ahí adentro (es la clave del group by).
export function computeVatByRate(groups: TaxRateGroup[]): VatBreakdownEntry[] {
  return groups
    .filter((g) => g.sumTotal !== 0)
    .map((g) => ({
      rate: g.taxRate,
      amount:
        g.taxRate > 0
          ? round2(g.sumTotal - g.sumTotal / (1 + g.taxRate / 100))
          : 0,
    }));
}

export function computeAverageTicket(
  grossRevenue: number,
  completedCount: number,
): number {
  if (completedCount <= 0) return 0;
  return round2(grossRevenue / completedCount);
}

// (Total Neto - Costo Total) — puede dar negativo (venta bajo costo), no se
// limita a 0: es información real que el dueño necesita ver.
export function computeGrossMargin(
  netRevenue: number,
  totalCost: number,
): number {
  return round2(netRevenue - totalCost);
}

export function computePaymentPercentage(
  amount: number,
  grandTotal: number,
): number {
  if (grandTotal <= 0) return 0;
  return round2((amount / grandTotal) * 100);
}

// Evita artefactos de punto flotante (ej. 10.999999999999998) en montos que
// se muestran directo al usuario — no es redondeo contable/fiscal.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
