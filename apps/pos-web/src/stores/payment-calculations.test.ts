import { describe, expect, it } from "vitest";
import { sumPayments, remainingToPay, computeChange, validatePayments } from "./payment-calculations";
import type { PaymentLine } from "./payment-calculations";

describe("sumPayments / remainingToPay", () => {
  it("suma pagos combinados", () => {
    const payments: PaymentLine[] = [
      { method: "CASH", amount: 300 },
      { method: "DEBIT_CARD", amount: 200 },
    ];
    expect(sumPayments(payments)).toBe(500);
  });

  it("calcula cuánto falta cubrir", () => {
    const payments: PaymentLine[] = [{ method: "CASH", amount: 300 }];
    expect(remainingToPay(payments, 500)).toBe(200);
  });

  it("no da un resto negativo si ya está cubierto", () => {
    const payments: PaymentLine[] = [{ method: "CASH", amount: 600 }];
    expect(remainingToPay(payments, 500)).toBe(0);
  });
});

describe("computeChange", () => {
  it("calcula vuelto cuando el efectivo supera el total", () => {
    expect(computeChange([{ method: "CASH", amount: 1000 }], 850)).toBe(150);
  });

  it("sin vuelto si el pago es exacto", () => {
    expect(computeChange([{ method: "CASH", amount: 850 }], 850)).toBe(0);
  });

  it("sin vuelto si falta pagar", () => {
    expect(computeChange([{ method: "CASH", amount: 500 }], 850)).toBe(0);
  });
});

describe("validatePayments", () => {
  it("inválido si no cubre el total", () => {
    const result = validatePayments([{ method: "CASH", amount: 400 }], 500);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INSUFFICIENT");
  });

  it("válido si cubre exacto con tarjeta", () => {
    const result = validatePayments([{ method: "DEBIT_CARD", amount: 500 }], 500);
    expect(result.valid).toBe(true);
  });

  it("inválido si se paga de más solo con tarjeta (no hay vuelto posible)", () => {
    const result = validatePayments([{ method: "DEBIT_CARD", amount: 600 }], 500);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("OVERPAID_WITHOUT_CASH");
  });

  it("válido si se paga de más pero hay efectivo de por medio (vuelto)", () => {
    const result = validatePayments([{ method: "CASH", amount: 600 }], 500);
    expect(result.valid).toBe(true);
  });

  it("válido con pago combinado exacto", () => {
    const result = validatePayments(
      [
        { method: "CASH", amount: 200 },
        { method: "MERCADO_PAGO", amount: 300 },
      ],
      500,
    );
    expect(result.valid).toBe(true);
  });
});
