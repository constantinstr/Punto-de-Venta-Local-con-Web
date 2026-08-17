"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePurchasesList } from "@/hooks/usePurchases";

export default function PurchasesPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const { data: suppliers } = useSuppliers();
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePurchasesList({
    storeId: storeId || undefined,
    supplierId: supplierId || undefined,
    page,
    limit: 25,
  });

  if (!user) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-5xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Compras</h1>
        <Link href="/purchases/new" className="rounded bg-accent px-4 py-2 text-sm text-white">
          + Nueva compra
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <select
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        >
          <option value="">Todos los locales</option>
          {stores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        >
          <option value="">Todos los proveedores</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nro</th>
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Proveedor</th>
            <th className="py-2 pr-3">Cargado por</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="py-2 pr-3 font-mono text-xs">#{p.purchaseNumber}</td>
              <td className="py-2 pr-3 text-xs text-muted">{new Date(p.createdAt).toLocaleString("es-AR")}</td>
              <td className="py-2 pr-3">{p.supplier.name}</td>
              <td className="py-2 pr-3 text-xs text-muted">{p.user.fullName}</td>
              <td className="py-2 pr-3 text-right">${Number(p.total).toLocaleString("es-AR")}</td>
              <td className="py-2 text-right">
                <Link href={`/purchases/${p.id}`} className="underline">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted">
                No hay compras que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data && data.total > data.limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {data.page} de {totalPages} — {data.total} compra(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
