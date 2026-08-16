import type { TransactionClient } from '@pos/database';

export interface StockResult {
  quantity: number;
  // true cuando no hay límite real conocido: producto con trackStock=false,
  // o combo cuyos componentes son todos trackStock=false.
  isUnlimited: boolean;
}

interface StockableProduct {
  id: string;
  type: string; // 'SIMPLE' | 'VARIABLE' | 'BUNDLE'
  trackStock: boolean;
}

// Disponibilidad de un producto/variante en un local. Para combos, se
// calcula en tiempo real a partir del stock de sus componentes — nunca
// tienen una fila propia en StockLevel. Ver docs/ROADMAP.md Sprint 2.
export async function getAvailableStock(
  tx: TransactionClient,
  storeId: string,
  product: StockableProduct,
  variantId?: string | null,
): Promise<StockResult> {
  if (product.type === 'BUNDLE') {
    return getBundleAvailableStock(tx, storeId, product.id);
  }

  if (!product.trackStock) {
    return { quantity: 0, isUnlimited: true };
  }

  const level = await tx.stockLevel.findFirst({
    where: {
      storeId,
      productId: variantId ? null : product.id,
      variantId: variantId ?? null,
    },
  });

  return { quantity: level ? Number(level.quantity) : 0, isUnlimited: false };
}

async function getBundleAvailableStock(
  tx: TransactionClient,
  storeId: string,
  bundleProductId: string,
): Promise<StockResult> {
  const components = await tx.bundleItem.findMany({
    where: { bundleProductId },
    include: { componentProduct: true },
  });

  if (components.length === 0) {
    return { quantity: 0, isUnlimited: false };
  }

  // null = todavía no encontramos ningún componente que trackee stock
  // (todos son trackStock=false hasta ahora) => sin límite conocido.
  let minAvailable: number | null = null;

  for (const item of components) {
    if (!item.componentProduct.trackStock) continue;

    const level = await tx.stockLevel.findFirst({
      where: {
        storeId,
        productId: item.componentVariantId ? null : item.componentProductId,
        variantId: item.componentVariantId,
      },
    });

    const componentQty = level ? Number(level.quantity) : 0;
    const possibleBundles = Math.floor(componentQty / Number(item.quantity));
    minAvailable =
      minAvailable === null
        ? possibleBundles
        : Math.min(minAvailable, possibleBundles);
  }

  if (minAvailable === null) return { quantity: 0, isUnlimited: true };
  return { quantity: Math.max(0, minAvailable), isUnlimited: false };
}
