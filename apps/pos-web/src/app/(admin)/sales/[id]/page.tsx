"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  findSaleInvoice,
  findCreditNote,
  type OrderInvoiceSummary,
} from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useOrder, useCancelOrder } from "@/hooks/useOrders";
import { useInvoiceByOrder } from "@/hooks/useInvoices";
import { useStores } from "@/hooks/useCatalog";
import { useFiscalConfig } from "@/hooks/useFiscalConfig";
import { ThermalReceipt } from "@/components/pos/ThermalReceipt";
import { ApiError } from "@/lib/api";

function describeInvoice(invoice: OrderInvoiceSummary | null): string {
  if (!invoice) return "—";
  return `${invoice.invoiceType}${invoice.cbteNro ? ` #${invoice.cbteNro}` : ""}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useRequireAuth();
  const { data: order, isLoading } = useOrder(id);
  const { data: invoice } = useInvoiceByOrder(id);
  const { data: stores } = useStores();
  const store = stores?.find((s) => s.id === order?.storeId);
  const { data: fiscalConfig } = useFiscalConfig(order?.storeId);
  const cancelOrder = useCancelOrder();

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (isLoading || !order) return <p className="p-8 text-muted">Cargando…</p>;

  const canCancel = order.status === "COMPLETED" && (user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER");

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await cancelOrder.mutateAsync({ id, reason });
      setCancelling(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular la venta");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/sales" className="text-sm text-muted underline">
            ← Ventas
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Venta #{order.orderNumber}</h1>
        </div>
        {order.status === "CANCELLED" && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
            Anulada
          </span>
        )}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted">Fecha</p>
            <p>{new Date(order.createdAt).toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Cajero</p>
            <p>{order.user.fullName}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Cliente</p>
            <p>{order.customer?.name ?? "Consumidor final"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Comprobante</p>
            <p>{describeInvoice(findSaleInvoice(order))}</p>
          </div>
          {findCreditNote(order) && (
            <div>
              <p className="text-xs text-muted">Anulado con</p>
              <p className="text-red-600">
                {describeInvoice(findCreditNote(order))}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 className="mb-2 font-medium text-foreground">Ítems</h2>
        <ul className="space-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between">
              <span>
                {item.quantity} × {item.productName}
                {/* Sin esto, una venta con descuento por línea se ve como si
                    el producto valiera menos de lo que dice el catálogo, y no
                    hay forma de auditar quién lo autorizó. */}
                {Number(item.discountAmount) > 0 && (
                  <span className="ml-2 text-xs text-muted">
                    (desc. ${Number(item.discountAmount).toLocaleString("es-AR")} sobre $
                    {Number(item.subtotal).toLocaleString("es-AR")})
                  </span>
                )}
              </span>
              <span>${Number(item.total).toLocaleString("es-AR")}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-border pt-2 text-right">
          {Number(order.discountAmount) > 0 && (
            <div className="text-sm text-muted">
              Descuentos: -${Number(order.discountAmount).toLocaleString("es-AR")}
            </div>
          )}
          <div className="font-medium text-foreground">
            Total: ${Number(order.total).toLocaleString("es-AR")}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 className="mb-2 font-medium text-foreground">Pagos</h2>
        <ul className="space-y-1">
          {order.payments.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
              <span>${Number(p.amount).toLocaleString("es-AR")}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => window.print()} className="rounded border border-border px-4 py-2 text-sm">
          Reimprimir comprobante
        </button>
        {canCancel && !cancelling && (
          <button
            onClick={() => setCancelling(true)}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 dark:border-red-800"
          >
            Anular venta
          </button>
        )}
      </div>

      {cancelling && (
        <form onSubmit={handleCancel} className="space-y-3 rounded-lg border border-red-300 bg-surface p-4 text-sm dark:border-red-800">
          <label className="block">
            Motivo de la anulación
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Ej: error de carga, producto equivocado"
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            />
          </label>
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelling(false)} className="rounded px-4 py-2">
              Volver
            </button>
            <button
              type="submit"
              disabled={cancelOrder.isPending}
              className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
            >
              Confirmar anulación
            </button>
          </div>
        </form>
      )}

      {store && (
        <ThermalReceipt
          order={order}
          invoice={invoice ?? null}
          store={store}
          fiscalConfig={fiscalConfig ?? null}
          paperSize="80mm"
        />
      )}
    </div>
  );
}
