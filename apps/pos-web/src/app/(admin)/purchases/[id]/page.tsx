"use client";

import { use } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePurchase } from "@/hooks/usePurchases";

export default function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useRequireAuth();
  const { data: purchase, isLoading } = usePurchase(id);

  if (!user) return null;
  if (isLoading || !purchase) return <p className="p-8 text-muted">Cargando…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <Link href="/purchases" className="text-sm text-muted underline">
          ← Compras
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Compra #{purchase.purchaseNumber}</h1>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted">Fecha</p>
            <p>{new Date(purchase.createdAt).toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Cargado por</p>
            <p>{purchase.user.fullName}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Proveedor</p>
            <p>{purchase.supplier.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Nro. factura/remito</p>
            <p>{purchase.invoiceNumber ?? "—"}</p>
          </div>
        </div>
        {purchase.notes && (
          <div className="mt-3">
            <p className="text-xs text-muted">Notas</p>
            <p>{purchase.notes}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 className="mb-2 font-medium text-foreground">Ítems</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-1.5 pr-3">Producto</th>
              <th className="py-1.5 pr-3 text-right">Cantidad</th>
              <th className="py-1.5 pr-3 text-right">Costo unit.</th>
              <th className="py-1.5 pr-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-1.5 pr-3">{item.productName}</td>
                <td className="py-1.5 pr-3 text-right">{Number(item.quantity).toLocaleString("es-AR")}</td>
                <td className="py-1.5 pr-3 text-right">${Number(item.unitCost).toLocaleString("es-AR")}</td>
                <td className="py-1.5 pr-3 text-right">${Number(item.subtotal).toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 border-t border-border pt-2 text-right font-medium text-foreground">
          Total: ${Number(purchase.total).toLocaleString("es-AR")}
        </div>
      </section>
    </div>
  );
}
