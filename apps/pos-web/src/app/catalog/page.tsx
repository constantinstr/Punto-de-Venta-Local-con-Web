"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCategories, useProducts, useStores, useLowStock } from "@/hooks/useCatalog";
import { apiFileUrl } from "@/lib/api";

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
        <h1 className="text-2xl font-semibold text-foreground  ">Catálogo</h1>
        <Link href="/catalog/new" className="rounded bg-accent px-4 py-2 text-sm text-white  ">
          + Nuevo producto
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <input
          placeholder="Buscar por nombre o SKU…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded border border-border px-3 py-1.5   bg-surface"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-border px-3 py-1.5   bg-surface"
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
          className="rounded border border-border px-3 py-1.5   bg-surface"
        >
          <option value="">Todos los tipos</option>
          <option value="SIMPLE">Simple</option>
          <option value="VARIABLE">Variable</option>
          <option value="BUNDLE">Combo</option>
        </select>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border border-border px-3 py-1.5   bg-surface"
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

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted  ">
            <th className="py-2"></th>
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
            <tr key={p.id} className="border-b border-border  ">
              <td className="py-2">
                <div className="h-9 w-9 overflow-hidden rounded border border-border bg-surface">
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica servida por la API, no un asset del build
                    <img src={apiFileUrl(p.imageUrl)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              </td>
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
              <td colSpan={8} className="py-6 text-center text-muted">
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
