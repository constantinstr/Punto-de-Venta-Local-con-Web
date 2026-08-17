"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores, useStockLevels, useAdjustStock } from "@/hooks/useCatalog";
import { ApiError } from "@/lib/api";
import type { StockRow } from "@pos/shared-types";

export default function StockPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const { data: rows, isLoading } = useStockLevels(storeId || undefined);
  const [editing, setEditing] = useState<StockRow | null>(null);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground  ">Stock por local</h1>

      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="mb-6 rounded border border-border px-3 py-2 text-sm   bg-surface"
      >
        <option value="">Elegí un local…</option>
        {stores?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {!storeId && <p className="text-muted">Seleccioná un local para ver su stock.</p>}
      {isLoading && <p className="text-muted">Cargando…</p>}

      {storeId && rows && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted  ">
              <th className="py-2">Producto</th>
              <th className="py-2">SKU</th>
              <th className="py-2 text-right">Stock</th>
              <th className="py-2 text-right">Alerta mín.</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const low = row.minAlertStock !== null && row.quantity <= row.minAlertStock;
              return (
                <tr
                  key={`${row.productId ?? ""}-${row.variantId ?? ""}`}
                  className={`border-b border-border   ${low ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                >
                  <td className="py-2">
                    {row.name}
                    {row.attributes && (
                      <span className="text-muted"> ({Object.values(row.attributes).join(" / ")})</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs">{row.sku}</td>
                  <td className="py-2 text-right">{row.isUnlimitedStock ? "∞" : row.quantity}</td>
                  <td className="py-2 text-right text-muted">{row.minAlertStock ?? "—"}</td>
                  <td className="py-2 text-right">
                    {row.variantId || row.productId ? (
                      <button onClick={() => setEditing(row)} className="underline">
                        Ajustar
                      </button>
                    ) : (
                      <span className="text-xs text-muted">combo</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted">
                  Sin movimientos de stock en este local todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editing && storeId && (
        <AdjustModal storeId={storeId} row={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function AdjustModal({ storeId, row, onClose }: { storeId: string; row: StockRow; onClose: () => void }) {
  const adjust = useAdjustStock();
  const [quantity, setQuantity] = useState(String(row.quantity));
  const [minAlertStock, setMinAlertStock] = useState(row.minAlertStock !== null ? String(row.minAlertStock) : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adjust.mutateAsync({
        storeId,
        productId: row.variantId ? undefined : (row.productId ?? undefined),
        variantId: row.variantId ?? undefined,
        absoluteQuantity: Number(quantity),
        minAlertStock: minAlertStock === "" ? undefined : Number(minAlertStock),
        reason,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo ajustar el stock");
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-3 rounded-lg bg-surface p-6 bg-surface"
      >
        <h2 className="text-lg font-medium">Ajustar stock — {row.name}</h2>
        <label className="block text-sm">
          Cantidad real
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
          />
        </label>
        <label className="block text-sm">
          Alerta de stock bajo (opcional)
          <input
            type="number"
            min={0}
            value={minAlertStock}
            onChange={(e) => setMinAlertStock(e.target.value)}
            placeholder="Ej: 5"
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-surface"
          />
        </label>
        <label className="block text-sm">
          Motivo
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Ej: conteo físico, rotura, ajuste de ingreso"
            className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={adjust.isPending}
            className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-50  "
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
