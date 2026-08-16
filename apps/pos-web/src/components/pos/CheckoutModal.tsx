"use client";

import { useEffect, useRef } from "react";
import type { CartTotals } from "@/stores/cart-calculations";

export function CheckoutModal({
  totals,
  onConfirm,
  onClose,
}: {
  totals: CartTotals;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-6 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-medium">Confirmar cobro</h2>

        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-sm text-zinc-500">Total a cobrar</span>
          <span className="text-3xl font-bold">${totals.total.toLocaleString("es-AR")}</span>
        </div>

        <p className="mb-4 rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Los medios de pago combinados, el registro de la venta y la impresión del
          comprobante se implementan en el Sprint 5. Por ahora, confirmar vacía el
          carrito localmente.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cancelar (Esc)
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
