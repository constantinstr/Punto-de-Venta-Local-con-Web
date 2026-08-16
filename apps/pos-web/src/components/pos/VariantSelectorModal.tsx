"use client";

import { useEffect, useRef } from "react";
import type { CatalogProduct, SellableUnit } from "@/hooks/usePosCatalog";
import { StockBadge } from "./StockBadge";

export function VariantSelectorModal({
  product,
  onSelect,
  onClose,
}: {
  product: CatalogProduct;
  onSelect: (unit: SellableUnit) => void;
  onClose: () => void;
}) {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButtonRef.current?.focus();
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
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-medium">{product.name}</h2>
        <p className="mb-4 text-sm text-zinc-400">Elegí la variante (Esc para cancelar)</p>

        <div className="space-y-2">
          {product.variants.map((v, i) => {
            const outOfStock = !v.isUnlimitedStock && v.stockAvailable <= 0;
            return (
              <button
                key={v.variantId}
                ref={i === 0 ? firstButtonRef : undefined}
                type="button"
                disabled={outOfStock}
                onClick={() => onSelect(v)}
                className="flex w-full items-center justify-between rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span>
                  {v.attributes ? Object.values(v.attributes).join(" / ") : v.sku}
                  <span className="ml-2 text-zinc-400">${v.price.toLocaleString("es-AR")}</span>
                </span>
                <StockBadge quantity={v.stockAvailable} isUnlimited={v.isUnlimitedStock} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
