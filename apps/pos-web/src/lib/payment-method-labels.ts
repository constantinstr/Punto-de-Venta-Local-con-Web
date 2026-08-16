import type { PaymentMethod } from "@pos/shared-types";

// Mismo mapeo que CheckoutModal.tsx — orden fijo, coincide con el orden de
// asignación de color categórico en los gráficos de reportes.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "TRANSFER",
  "MERCADO_PAGO",
  "CURRENT_ACCOUNT",
];
