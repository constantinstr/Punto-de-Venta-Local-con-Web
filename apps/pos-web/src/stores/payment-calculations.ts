import type { PaymentMethod } from "@pos/shared-types";

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

const AMOUNT_EPSILON = 0.01;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumPayments(payments: PaymentLine[]): number {
  return round2(payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0));
}

export function remainingToPay(payments: PaymentLine[], total: number): number {
  return round2(Math.max(0, total - sumPayments(payments)));
}

// El vuelto solo existe si el excedente viene de efectivo — una tarjeta o
// transferencia siempre cobra el monto exacto, nunca "da vuelto".
export function computeChange(payments: PaymentLine[], total: number): number {
  const excess = sumPayments(payments) - total;
  if (excess <= AMOUNT_EPSILON) return 0;
  return round2(excess);
}

export interface PaymentValidation {
  valid: boolean;
  reason?: "INSUFFICIENT" | "OVERPAID_WITHOUT_CASH";
}

export function validatePayments(payments: PaymentLine[], total: number): PaymentValidation {
  const sum = sumPayments(payments);
  if (sum < total - AMOUNT_EPSILON) {
    return { valid: false, reason: "INSUFFICIENT" };
  }
  if (sum > total + AMOUNT_EPSILON) {
    const hasCash = payments.some((p) => p.method === "CASH");
    if (!hasCash) return { valid: false, reason: "OVERPAID_WITHOUT_CASH" };
  }
  return { valid: true };
}
