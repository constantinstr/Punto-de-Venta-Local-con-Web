import type { CatalogProduct } from "@/hooks/usePosCatalog";
import { StockBadge } from "./StockBadge";

const TYPE_LABELS: Record<string, string> = { SIMPLE: "", VARIABLE: "Variantes", BUNDLE: "Combo" };

export function ProductGrid({
  products,
  onSelect,
}: {
  products: CatalogProduct[];
  onSelect: (product: CatalogProduct) => void;
}) {
  if (products.length === 0) {
    return <p className="p-8 text-center text-muted">No hay productos que coincidan.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => {
        const outOfStock = !product.isUnlimitedStock && !product.hasVariants && product.totalStock <= 0;
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product)}
            disabled={outOfStock}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40    "
          >
            {TYPE_LABELS[product.type] && (
              <span className="text-[10px] uppercase tracking-wide text-muted">{TYPE_LABELS[product.type]}</span>
            )}
            <span className="line-clamp-2 text-sm font-medium text-foreground  ">{product.name}</span>
            <span className="font-mono text-xs text-muted">{product.sku}</span>
            <div className="mt-auto flex w-full items-center justify-between pt-2">
              <span className="text-sm font-semibold">${product.price.toLocaleString("es-AR")}</span>
              <StockBadge quantity={product.totalStock} isUnlimited={product.isUnlimitedStock} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
