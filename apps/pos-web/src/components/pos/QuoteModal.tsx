"use client";

import { useEffect, useRef, useState } from "react";
import type { Customer, Quote } from "@pos/shared-types";
import type { CartTotals, OrderItemPayload } from "@/stores/cart-calculations";
import { useCreateQuote } from "@/hooks/useQuotes";
import { ApiError, downloadFile } from "@/lib/api";
import { CustomerPicker } from "./CustomerPicker";

// Modal de "presupuestar" — hermano de CheckoutModal pero mucho más chico:
// no hay pagos, no hay caja, no se mueve stock. Solo arma el presupuesto a
// partir del carrito actual y ofrece descargarlo en PDF.
export function QuoteModal({
  totals,
  quoteItemsPayload,
  storeId,
  onClose,
}: {
  totals: CartTotals;
  quoteItemsPayload: OrderItemPayload[];
  storeId: string;
  onClose: () => void;
}) {
  const createQuote = useCreateQuote();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [validDays, setValidDays] = useState(15);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Quote | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  async function handleCreate() {
    setError(null);
    try {
      const quote = await createQuote.mutateAsync({
        storeId,
        customerId: selectedCustomer?.id,
        validDays,
        notes: notes.trim() || undefined,
        items: quoteItemsPayload.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          discountAmount: i.discountAmount,
        })),
      });
      setCreated(quote);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el presupuesto");
    }
  }

  async function handleDownload() {
    if (!created) return;
    try {
      await downloadFile(`/quotes/${created.id}/pdf`, `presupuesto-${created.quoteNumber}.pdf`);
    } catch {
      setError("No se pudo descargar el PDF");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        {created ? (
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Presupuesto Nº {created.quoteNumber} creado
            </h2>
            <p className="text-sm text-muted">
              Válido hasta el {new Date(created.validUntil).toLocaleDateString("es-AR")}
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => void handleDownload()}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
              >
                Descargar PDF
              </button>
              <button onClick={onClose} className="rounded border border-border px-4 py-2 text-sm">
                Cerrar
              </button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Presupuestar</h2>

            <div>
              <p className="mb-1 text-xs text-muted">Cliente (opcional)</p>
              <CustomerPicker
                selected={selectedCustomer}
                onSelect={setSelectedCustomer}
                placeholder="Buscar o crear cliente…"
              />
            </div>

            <label className="block text-xs text-muted">
              Válido por (días)
              <input
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value) || 1)}
                className="mt-0.5 block w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs text-muted">
              Notas (opcional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm font-medium text-muted">Total</span>
              <span className="text-2xl font-bold text-foreground">
                ${totals.total.toLocaleString("es-AR")}
              </span>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded border border-border px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                ref={confirmRef}
                onClick={() => void handleCreate()}
                disabled={createQuote.isPending}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {createQuote.isPending ? "Creando…" : "Crear presupuesto"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
