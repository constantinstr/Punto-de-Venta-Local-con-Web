import { describe, expect, it } from "vitest";
import { computeCartTotals, computeOrderItemsPayload, itemExceedsStock, cartHasStockIssues } from "./cart-calculations";
import type { CartItem } from "./cart-types";

function item(overrides: Partial<CartItem>): CartItem {
  return {
    lineId: "p1",
    productId: "p1",
    name: "Producto",
    sku: "SKU-1",
    unitPrice: 100,
    quantity: 1,
    vatCondition: "IVA_21",
    stockAvailable: 10,
    isUnlimitedStock: false,
    isBundle: false,
    ...overrides,
  };
}

describe("computeCartTotals", () => {
  it("un solo ítem IVA 21%, sin descuentos", () => {
    const totals = computeCartTotals([item({ unitPrice: 121, quantity: 1 })]);

    expect(totals.subtotalBruto).toBe(121);
    expect(totals.total).toBe(121);
    expect(totals.vatBreakdown).toHaveLength(1);
    expect(totals.vatBreakdown[0].condition).toBe("IVA_21");
    // 121 (con IVA incluido) -> neto 100, IVA 21
    expect(totals.vatBreakdown[0].net).toBe(100);
    expect(totals.vatBreakdown[0].vat).toBe(21);
  });

  it("descuento de línea por porcentaje reduce el neto y el IVA proporcionalmente", () => {
    const totals = computeCartTotals([
      item({ unitPrice: 121, quantity: 1, discount: { type: "PERCENTAGE", value: 10 } }),
    ]);

    // 121 - 10% = 108.9 con IVA incluido
    expect(totals.total).toBe(108.9);
    expect(totals.lineDiscountsTotal).toBe(12.1);
    expect(totals.vatBreakdown[0].gross).toBe(108.9);
  });

  it("descuento global se prorratea entre líneas con distinta alícuota", () => {
    const totals = computeCartTotals(
      [
        item({ lineId: "a", productId: "a", unitPrice: 100, quantity: 1, vatCondition: "IVA_21" }),
        item({ lineId: "b", productId: "b", unitPrice: 100, quantity: 1, vatCondition: "EXENTO" }),
      ],
      { type: "FIXED", value: 20 },
    );

    // Subtotal 200, descuento global 20 prorrateado 50/50 -> cada línea baja 10
    expect(totals.subtotalBruto).toBe(200);
    expect(totals.globalDiscountAmount).toBe(20);
    expect(totals.total).toBe(180);

    const iva21 = totals.vatBreakdown.find((v) => v.condition === "IVA_21")!;
    const exento = totals.vatBreakdown.find((v) => v.condition === "EXENTO")!;
    expect(iva21.gross).toBe(90);
    expect(exento.gross).toBe(90);
    // Exento no discrimina IVA: todo es "neto" (no hay alícuota que restar)
    expect(exento.vat).toBe(0);
    expect(exento.net).toBe(90);
  });

  it("el descuento nunca deja un total negativo (se clampea a la base)", () => {
    const totals = computeCartTotals([item({ unitPrice: 100, quantity: 1, discount: { type: "FIXED", value: 500 } })]);
    expect(totals.total).toBe(0);
    expect(totals.lineDiscountsTotal).toBe(100);
  });

  it("carrito vacío da totales en cero sin explotar", () => {
    const totals = computeCartTotals([]);
    expect(totals.total).toBe(0);
    expect(totals.subtotalBruto).toBe(0);
    expect(totals.vatBreakdown).toHaveLength(0);
  });
});

describe("computeOrderItemsPayload", () => {
  it("incluye el descuento de línea + la porción prorrateada del global", () => {
    const payload = computeOrderItemsPayload(
      [
        item({ lineId: "a", productId: "a", unitPrice: 100, quantity: 1, vatCondition: "IVA_21" }),
        item({ lineId: "b", productId: "b", unitPrice: 100, quantity: 1, vatCondition: "EXENTO" }),
      ],
      { type: "FIXED", value: 20 },
    );

    expect(payload).toHaveLength(2);
    // Subtotal 200, descuento global 20 -> 10 por línea (mismo peso)
    expect(payload[0].discountAmount).toBe(10);
    expect(payload[1].discountAmount).toBe(10);
    expect(payload[0].productId).toBe("a");
    expect(payload[0].quantity).toBe(1);
  });

  it("nunca manda el precio: solo productId/variantId/quantity/discountAmount", () => {
    const payload = computeOrderItemsPayload([item({ unitPrice: 999, quantity: 2 })]);
    expect(Object.keys(payload[0]).sort()).toEqual(["discountAmount", "productId", "quantity", "variantId"].sort());
  });
});

describe("validación de stock", () => {
  it("marca un ítem que supera el stock disponible", () => {
    const i = item({ quantity: 5, stockAvailable: 3 });
    expect(itemExceedsStock(i)).toBe(true);
    expect(cartHasStockIssues([i])).toBe(true);
  });

  it("no marca stock ilimitado aunque la cantidad sea alta", () => {
    const i = item({ quantity: 999, stockAvailable: 0, isUnlimitedStock: true });
    expect(itemExceedsStock(i)).toBe(false);
  });

  it("carrito sin problemas de stock", () => {
    const i = item({ quantity: 2, stockAvailable: 10 });
    expect(cartHasStockIssues([i])).toBe(false);
  });
});
