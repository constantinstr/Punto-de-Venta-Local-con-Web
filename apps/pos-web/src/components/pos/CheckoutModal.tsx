"use client";

import { useEffect, useRef, useState } from "react";
import type { Order, PaymentMethod } from "@pos/shared-types";
import type { CartTotals } from "@/stores/cart-calculations";
import type { OrderItemPayload } from "@/stores/cart-calculations";
import { sumPayments, remainingToPay, computeChange, validatePayments, type PaymentLine } from "@/stores/payment-calculations";
import { useCreateOrder } from "@/hooks/useOrders";
import { ApiError } from "@/lib/api";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

export function CheckoutModal({
  totals,
  orderItemsPayload,
  storeId,
  cashShiftId,
  onNewSale,
  onClose,
}: {
  totals: CartTotals;
  orderItemsPayload: OrderItemPayload[];
  storeId: string;
  cashShiftId: string;
  onNewSale: () => void;
  onClose: () => void;
}) {
  const createOrder = useCreateOrder();
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "CASH", amount: totals.total }]);
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (completedOrder) onNewSale();
      else onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [completedOrder, onNewSale, onClose]);

  const validation = validatePayments(payments, totals.total);
  const paid = sumPayments(payments);
  const remaining = remainingToPay(payments, totals.total);
  const change = computeChange(payments, totals.total);

  function updateLine(i: number, patch: Partial<PaymentLine>) {
    setPayments(payments.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function addLine() {
    setPayments([...payments, { method: "CASH", amount: Math.max(remaining, 0) }]);
  }

  function removeLine(i: number) {
    setPayments(payments.filter((_, idx) => idx !== i));
  }

  async function handleConfirm() {
    setError(null);
    try {
      const order = await createOrder.mutateAsync({
        storeId,
        cashShiftId,
        items: orderItemsPayload,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
      });
      setCompletedOrder(order);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la venta");
    }
  }

  if (completedOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 text-center dark:bg-zinc-900">
          <div className="text-4xl">✓</div>
          <h2 className="text-lg font-medium">Venta #{completedOrder.orderNumber} registrada</h2>
          <div className="space-y-1 text-sm text-zinc-500">
            <div className="flex justify-between">
              <span>Total</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                ${Number(completedOrder.total).toLocaleString("es-AR")}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between">
                <span>Vuelto</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">${change.toLocaleString("es-AR")}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={onNewSale}
              className="rounded bg-green-600 py-2 font-medium text-white"
            >
              Nueva venta (F2)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border border-zinc-300 py-2 dark:border-zinc-700"
            >
              Imprimir ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Cobrar</h2>

        <div className="flex items-baseline justify-between rounded bg-zinc-100 p-3 dark:bg-zinc-800">
          <span className="text-sm text-zinc-500">Total a cobrar</span>
          <span className="text-2xl font-bold">${totals.total.toLocaleString("es-AR")}</span>
        </div>

        <div className="space-y-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={p.method}
                onChange={(e) => updateLine(i, { method: e.target.value as PaymentMethod })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.amount}
                onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
                className="w-28 rounded border border-zinc-300 px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              {p.method !== "CASH" && (
                <input
                  placeholder="Nro. operación"
                  value={p.reference ?? ""}
                  onChange={(e) => updateLine(i, { reference: e.target.value })}
                  className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              )}
              {payments.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} className="text-red-600">
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm underline">
            + Agregar medio de pago
          </button>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-500">
            <span>Pagado</span>
            <span>${paid.toLocaleString("es-AR")}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Falta</span>
              <span>${remaining.toLocaleString("es-AR")}</span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Vuelto</span>
              <span>${change.toLocaleString("es-AR")}</span>
            </div>
          )}
        </div>

        {!validation.valid && validation.reason === "OVERPAID_WITHOUT_CASH" && (
          <p className="text-sm text-red-600">
            El vuelto solo puede darse en efectivo — ajustá el monto para que no supere el total.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cancelar (Esc)
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={!validation.valid || createOrder.isPending}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {createOrder.isPending ? "Registrando…" : "Confirmar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}
