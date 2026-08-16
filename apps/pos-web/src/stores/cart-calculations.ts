import type { VatCondition } from "@pos/shared-types";
import type { CartItem, Discount } from "./cart-types";

// Los precios en el catálogo son "precio de venta" (IVA incluido), como se
// exhiben al consumidor final en Argentina. Por eso el desglose de IVA se
// calcula "hacia atrás": neto = total / (1 + alícuota).
const VAT_RATES: Record<VatCondition, number> = {
  IVA_21: 0.21,
  IVA_10_5: 0.105,
  IVA_0: 0,
  EXENTO: 0,
  NO_GRAVADO: 0,
};

export interface VatBreakdownEntry {
  condition: VatCondition;
  net: number;
  vat: number;
  gross: number;
}

export interface CartTotals {
  subtotalBruto: number; // suma de unitPrice*quantity, sin ningún descuento
  lineDiscountsTotal: number;
  globalDiscountAmount: number;
  totalDiscount: number;
  vatBreakdown: VatBreakdownEntry[];
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function discountAmount(discount: Discount | undefined, base: number): number {
  if (!discount || base <= 0) return 0;
  const amount = discount.type === "PERCENTAGE" ? (base * discount.value) / 100 : discount.value;
  return Math.min(Math.max(amount, 0), base);
}

// Calcula subtotal, descuentos (por línea + global) y el desglose de IVA
// agrupado por condición fiscal. El descuento global se prorratea entre
// líneas según su peso en el subtotal post-descuento-de-línea, para poder
// discriminar el IVA correctamente en un carrito con alícuotas mixtas.
export function computeCartTotals(items: CartItem[], globalDiscount?: Discount): CartTotals {
  const grossLines = items.map((item) => item.unitPrice * item.quantity);
  const subtotalBruto = grossLines.reduce((sum, g) => sum + g, 0);

  const lineDiscounts = items.map((item, i) => discountAmount(item.discount, grossLines[i]));
  const lineDiscountsTotal = lineDiscounts.reduce((sum, d) => sum + d, 0);

  const netAfterLineDiscount = items.map((_, i) => grossLines[i] - lineDiscounts[i]);
  const subtotalAfterLineDiscounts = netAfterLineDiscount.reduce((sum, n) => sum + n, 0);

  const globalDiscountAmount = discountAmount(globalDiscount, subtotalAfterLineDiscounts);

  const finalLineAmounts = netAfterLineDiscount.map((net) =>
    subtotalAfterLineDiscounts > 0 ? net - globalDiscountAmount * (net / subtotalAfterLineDiscounts) : 0,
  );

  const byCondition = new Map<VatCondition, { net: number; vat: number; gross: number }>();
  items.forEach((item, i) => {
    const gross = finalLineAmounts[i];
    const rate = VAT_RATES[item.vatCondition];
    const net = rate > 0 ? gross / (1 + rate) : gross;
    const vat = gross - net;

    const acc = byCondition.get(item.vatCondition) ?? { net: 0, vat: 0, gross: 0 };
    acc.net += net;
    acc.vat += vat;
    acc.gross += gross;
    byCondition.set(item.vatCondition, acc);
  });

  const vatBreakdown: VatBreakdownEntry[] = Array.from(byCondition.entries()).map(([condition, v]) => ({
    condition,
    net: round2(v.net),
    vat: round2(v.vat),
    gross: round2(v.gross),
  }));

  const total = subtotalAfterLineDiscounts - globalDiscountAmount;

  return {
    subtotalBruto: round2(subtotalBruto),
    lineDiscountsTotal: round2(lineDiscountsTotal),
    globalDiscountAmount: round2(globalDiscountAmount),
    totalDiscount: round2(lineDiscountsTotal + globalDiscountAmount),
    vatBreakdown,
    total: round2(total),
  };
}

// Un ítem "excede stock" si su cantidad supera el stock disponible conocido
// al momento de agregarlo (para BUNDLE, ese número ya es el mínimo
// calculado por el backend entre todos los componentes — no se re-deriva
// acá para no duplicar esa lógica y desincronizarse del backend).
export function itemExceedsStock(item: CartItem): boolean {
  if (item.isUnlimitedStock) return false;
  return item.quantity > item.stockAvailable;
}

export function cartHasStockIssues(items: CartItem[]): boolean {
  return items.some(itemExceedsStock);
}
