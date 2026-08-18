"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useQuote, useCancelQuote } from "@/hooks/useQuotes";
import { usePosCatalog } from "@/hooks/usePosCatalog";
import { useCartStore } from "@/stores/useCartStore";
import { makeLineId } from "@/stores/cart-types";
import { ApiError, downloadFile } from "@/lib/api";

const STATE_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  EXPIRED: "Vencido",
  CONVERTED: "Convertido",
  CANCELLED: "Anulado",
};

const STATE_STYLES: Record<string, string> = {
  OPEN: "text-foreground",
  EXPIRED: "text-amber-600",
  CONVERTED: "text-green-600",
  CANCELLED: "text-red-600",
};

function money(n: string | number): string {
  return `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useRequireAuth();
  const router = useRouter();
  const { data: quote, isLoading } = useQuote(id);
  const cancelQuote = useCancelQuote();
  const catalog = usePosCatalog(quote?.storeId);
  const setStoreId = useCartStore((s) => s.setStoreId);
  const clearCart = useCartStore((s) => s.clearCart);
  const addItem = useCartStore((s) => s.addItem);
  const setLineDiscount = useCartStore((s) => s.setLineDiscount);
  const setQuoteId = useCartStore((s) => s.setQuoteId);

  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  if (!user) return null;
  if (user.role === "CASHIER") {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">No tenés permiso para esta sección.</p>
      </div>
    );
  }
  if (isLoading || !quote) return <p className="p-8 text-muted">Cargando…</p>;

  const canManage = user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER";
  const canConvert = quote.state === "OPEN" || quote.state === "EXPIRED";

  async function handleDownload() {
    try {
      await downloadFile(`/quotes/${id}/pdf`, `presupuesto-${quote!.quoteNumber}.pdf`);
    } catch {
      setError("No se pudo descargar el PDF");
    }
  }

  async function handleCancel() {
    if (!window.confirm("¿Anular este presupuesto?")) return;
    setError(null);
    try {
      await cancelQuote.mutateAsync(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular el presupuesto");
    }
  }

  function handleConvert() {
    if (!quote) return;
    setError(null);
    setConverting(true);
    try {
      // Siempre se vacía el carrito antes de cargar el presupuesto: si el
      // cajero ya tenía productos cargados (aunque sea del mismo local),
      // setStoreId por sí solo no los limpia — solo lo hace cuando el local
      // CAMBIA — y convertir terminaría mezclando cantidades ajenas al
      // presupuesto sin que el cajero se dé cuenta.
      clearCart();
      setStoreId(quote.storeId);
      const missing: string[] = [];
      for (const item of quote.items) {
        const unit = catalog.units.find(
          (u) => u.productId === item.productId && u.variantId === (item.variantId ?? null),
        );
        if (!unit) {
          missing.push(item.productName);
          continue;
        }
        addItem({
          productId: unit.productId,
          variantId: unit.variantId,
          name: unit.name,
          attributesLabel: unit.attributes ? Object.values(unit.attributes).join(" / ") : undefined,
          sku: unit.sku,
          barcode: unit.barcode,
          unitPrice: unit.price,
          vatCondition: unit.vatCondition,
          stockAvailable: unit.stockAvailable,
          isUnlimitedStock: unit.isUnlimitedStock,
          isBundle: unit.productType === "BUNDLE",
          bundleComponents: unit.bundleComponents,
          quantity: Number(item.quantity),
        });
        if (Number(item.discountAmount) > 0) {
          setLineDiscount(makeLineId(unit.productId, unit.variantId), {
            type: "FIXED",
            value: Number(item.discountAmount),
          });
        }
      }
      setQuoteId(quote.id);
      if (missing.length > 0) {
        setError(
          `No se pudieron cargar al carrito (ya no están disponibles): ${missing.join(", ")}. El resto sí se cargó — revisá el carrito antes de cobrar.`,
        );
        setConverting(false);
        return;
      }
      router.push("/pos");
    } catch {
      setError("No se pudo cargar el presupuesto en el carrito");
      setConverting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <Link href="/quotes" className="text-sm text-muted underline">
          ← Presupuestos
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Presupuesto Nº {quote.quoteNumber}</h1>
          <span className={`text-sm font-medium ${STATE_STYLES[quote.state] ?? ""}`}>
            {STATE_LABELS[quote.state] ?? quote.state}
          </span>
        </div>
        <p className="text-sm text-muted">
          {new Date(quote.createdAt).toLocaleString("es-AR")} · Válido hasta el{" "}
          {new Date(quote.validUntil).toLocaleDateString("es-AR")} · {quote.user.fullName}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="text-xs text-muted">Cliente</p>
        <p>
          {quote.customer
            ? `${quote.customer.name} ${quote.customer.lastName ?? ""}`.trim()
            : "Consumidor Final"}
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-3">Producto</th>
              <th className="py-2 pr-3 text-right">Cant.</th>
              <th className="py-2 pr-3 text-right">Precio</th>
              <th className="py-2 pr-3 text-right">Desc.</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-2 pr-3">
                  {item.productName} <span className="text-xs text-muted">({item.sku})</span>
                </td>
                <td className="py-2 pr-3 text-right">{Number(item.quantity).toLocaleString("es-AR")}</td>
                <td className="py-2 pr-3 text-right">{money(item.unitPrice)}</td>
                <td className="py-2 pr-3 text-right">{money(item.discountAmount)}</td>
                <td className="py-2 text-right">{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 space-y-1 text-right text-sm">
          <p className="text-muted">Subtotal: {money(quote.subtotal)}</p>
          {Number(quote.discountAmount) > 0 && (
            <p className="text-muted">Descuento: -{money(quote.discountAmount)}</p>
          )}
          <p className="text-lg font-semibold text-foreground">Total: {money(quote.total)}</p>
        </div>

        {quote.notes && (
          <div className="mt-3">
            <p className="text-xs text-muted">Notas</p>
            <p className="whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void handleDownload()}
          className="rounded border border-border px-3 py-1.5 text-sm"
        >
          Descargar PDF
        </button>
        {canConvert && (
          <button
            onClick={handleConvert}
            disabled={converting || catalog.isLoading}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {catalog.isLoading ? "Cargando catálogo…" : "Convertir en venta"}
          </button>
        )}
        {canManage && canConvert && (
          <button
            onClick={() => void handleCancel()}
            disabled={cancelQuote.isPending}
            className="rounded border border-danger px-3 py-1.5 text-sm text-danger disabled:opacity-50"
          >
            Anular
          </button>
        )}
      </div>
    </div>
  );
}
