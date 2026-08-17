"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores, useProducts } from "@/hooks/useCatalog";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useCreatePurchase } from "@/hooks/usePurchases";
import { ApiError } from "@/lib/api";

interface DraftLine {
  key: string;
  productId: string;
  variantId?: string;
  label: string;
  quantity: number;
  unitCost: number;
}

export default function NewPurchasePage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { data: stores } = useStores();
  const { data: suppliers } = useSuppliers();
  const createPurchase = useCreatePurchase();

  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: matches } = useProducts({ q: query });

  if (!user) return null;

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  function addLine(productId: string, variantId: string | undefined, label: string, unitCost: number) {
    const key = `${productId}:${variantId ?? ""}`;
    if (lines.some((l) => l.key === key)) return;
    setLines([...lines, { key, productId, variantId, label, quantity: 1, unitCost }]);
    setQuery("");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines(lines.filter((l) => l.key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeId || !supplierId) {
      setError("Elegí un local y un proveedor");
      return;
    }
    if (lines.length === 0) {
      setError("Agregá al menos un producto");
      return;
    }
    try {
      const purchase = await createPurchase.mutateAsync({
        storeId,
        supplierId,
        invoiceNumber: invoiceNumber || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      router.push(`/purchases/${purchase.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la compra");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <Link href="/purchases" className="text-sm text-muted underline">
          ← Compras
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Nueva compra</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="text-xs text-muted">
            Local
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
            >
              <option value="">Seleccionar…</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Proveedor
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
            >
              <option value="">Seleccionar…</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Link href="/settings/suppliers" className="mt-1 block text-xs underline">
              + Nuevo proveedor
            </Link>
          </label>
          <label className="text-xs text-muted">
            Nro. factura/remito (opcional)
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
          <label className="text-xs text-muted">
            Notas (opcional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
        </div>

        <div className="relative">
          <label className="text-xs text-muted">
            Buscar producto para agregar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o SKU…"
              className="mt-0.5 block w-full rounded border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          {query.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-border bg-surface shadow-lg">
              {matches
                ?.filter((p) => p.type !== "BUNDLE")
                .map((p) =>
                  p.variants.length > 0 ? (
                    p.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() =>
                          addLine(p.id, v.id, `${p.name} (${Object.values(v.attributes).join(" / ")})`, Number(v.costPrice ?? p.costPrice))
                        }
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-muted"
                      >
                        {p.name} ({Object.values(v.attributes).join(" / ")}) — {v.sku}
                      </button>
                    ))
                  ) : (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addLine(p.id, undefined, p.name, Number(p.costPrice))}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-muted"
                    >
                      {p.name} — {p.sku}
                    </button>
                  ),
                )}
              {matches?.length === 0 && <p className="p-2 text-xs text-muted">Sin resultados.</p>}
            </div>
          )}
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-1.5 pr-3">Producto</th>
              <th className="py-1.5 pr-3 text-right">Cantidad</th>
              <th className="py-1.5 pr-3 text-right">Costo unit.</th>
              <th className="py-1.5 pr-3 text-right">Subtotal</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-border">
                <td className="py-1.5 pr-3">{l.label}</td>
                <td className="py-1.5 pr-3 text-right">
                  <input
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                    className="w-20 rounded border border-border bg-surface px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitCost}
                    onChange={(e) => updateLine(l.key, { unitCost: Number(e.target.value) })}
                    className="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3 text-right">${(l.quantity * l.unitCost).toLocaleString("es-AR")}</td>
                <td className="py-1.5 text-right">
                  <button type="button" onClick={() => removeLine(l.key)} className="text-red-600">
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted">
                  Sin productos agregados.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="text-right text-lg font-medium text-foreground">
          Total: ${total.toLocaleString("es-AR")}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={createPurchase.isPending}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {createPurchase.isPending ? "Registrando…" : "Registrar compra"}
          </button>
        </div>
      </form>
    </div>
  );
}
