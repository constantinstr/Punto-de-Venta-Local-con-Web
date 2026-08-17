import { describe, expect, it } from "vitest";
import {
  computeCartTotals,
  computeOrderItemsPayload,
  itemExceedsStock,
  cartHasStockIssues,
  lineDiscountAmount,
} from "./cart-calculations";
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

// El carrito muestra los dos descuentos como filas separadas, así que la
// distinción entre lineDiscountsTotal y globalDiscountAmount tiene que ser
// exacta: antes CartSummary mostraba el total combinado rotulado como
// "Descuento global", y con descuentos por línea eso pasó a ser un número
// directamente equivocado.
describe("descuento de línea + descuento global juntos", () => {
  const items = [
    item({ lineId: "a", productId: "a", unitPrice: 1000, quantity: 1, discount: { type: "PERCENTAGE", value: 10 } }),
    item({ lineId: "b", productId: "b", unitPrice: 500, quantity: 2 }),
  ];

  it("separa el descuento de línea del global sin contarlos dos veces", () => {
    const totals = computeCartTotals(items, { type: "FIXED", value: 190 });

    expect(totals.subtotalBruto).toBe(2000);
    expect(totals.lineDiscountsTotal).toBe(100); // 10% de 1000
    expect(totals.globalDiscountAmount).toBe(190);
    // La suma de las dos filas es exactamente lo que se descuenta del total.
    expect(totals.totalDiscount).toBe(290);
    expect(totals.total).toBe(1710);
    expect(totals.lineDiscountsTotal + totals.globalDiscountAmount).toBe(
      totals.totalDiscount,
    );
  });

  it("el payload por línea lleva el descuento propio más su parte del global", () => {
    const payload = computeOrderItemsPayload(items, { type: "FIXED", value: 190 });

    // Post-descuento-de-línea: a = 900, b = 1000, subtotal 1900.
    // El global de 190 (10%) se reparte proporcional: 90 a "a", 100 a "b".
    expect(payload[0].discountAmount).toBe(190); // 100 propio + 90 del global
    expect(payload[1].discountAmount).toBe(100); // 0 propio + 100 del global
    // Lo que el backend termina descontando coincide con lo que vio el cajero.
    const suma = payload.reduce((s, p) => s + p.discountAmount, 0);
    expect(suma).toBe(290);
  });

  it("un descuento de línea en pesos se clampea al bruto de esa línea", () => {
    const totals = computeCartTotals([
      item({ unitPrice: 100, quantity: 1, discount: { type: "FIXED", value: 500 } }),
    ]);

    expect(totals.lineDiscountsTotal).toBe(100);
    expect(totals.total).toBe(0);
  });
});

describe("lineDiscountAmount", () => {
  it("devuelve solo el descuento propio de la línea, sin la parte del global", () => {
    const linea = item({ unitPrice: 1000, quantity: 1, discount: { type: "PERCENTAGE", value: 25 } });
    expect(lineDiscountAmount(linea)).toBe(250);
  });

  it("es cero cuando la línea no tiene descuento propio", () => {
    expect(lineDiscountAmount(item({ unitPrice: 1000, quantity: 1 }))).toBe(0);
  });
});
