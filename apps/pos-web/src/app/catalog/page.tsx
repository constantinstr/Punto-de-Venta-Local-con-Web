"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCategories, useProducts, useStores, useLowStock } from "@/hooks/useCatalog";

const TYPE_LABELS: Record<string, string> = { SIMPLE: "Simple", VARIABLE: "Variable", BUNDLE: "Combo" };

export default function CatalogPage() {
  const user = useRequireAuth();
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [storeId, setStoreId] = useState("");

  const { data: categories } = useCategories();
  const { data: stores } = useStores();
  const { data: products, isLoading } = useProducts({ categoryId, type, q });
  const { data: lowStockRows } = useLowStock(lowStockOnly ? storeId : undefined);

  if (!user) return null;

  const lowStockProductIds = new Set((lowStockRows ?? []).map((r) => r.productId).filter(Boolean));
  const visibleProducts = lowStockOnly
    ? (products ?? []).filter((p) => lowStockProductIds.has(p.id))
    : (products ?? []);

  return (
    <div className="mx-auto max-w-5xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Catálogo</h1>
        <Link href="/catalog/new" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          + Nuevo producto
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <input
          placeholder="Buscar por nombre o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Todas las categorías</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Todos los tipos</option>
          <option value="SIMPLE">Simple</option>
          <option value="VARIABLE">Variable</option>
          <option value="BUNDLE">Combo</option>
        </select>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Local para stock bajo…</option>
          {stores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={lowStockOnly}
            disabled={!storeId}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Solo stock bajo
        </label>
      </div>

      {isLoading && <p className="text-zinc-400">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-2">Nombre</th>
            <th className="py-2">SKU</th>
            <th className="py-2">Tipo</th>
            <th className="py-2">Categoría</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2"></th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {visibleProducts.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">{p.name}</td>
              <td className="py-2 font-mono text-xs">{p.sku}</td>
              <td className="py-2">{TYPE_LABELS[p.type]}</td>
              <td className="py-2">{p.category?.name ?? "—"}</td>
              <td className="py-2 text-right">${Number(p.price).toLocaleString("es-AR")}</td>
              <td className="py-2">{p.wooProductId && <WooBadge />}</td>
              <td className="py-2 text-right">
                <Link href={`/catalog/${p.id}`} className="underline">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {visibleProducts.length === 0 && !isLoading && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-zinc-400">
                No hay productos que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WooBadge() {
  return (
    <span
      title="Vinculado con WooCommerce"
      className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
    >
      Woo
    </span>
  );
}
