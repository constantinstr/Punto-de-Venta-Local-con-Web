import { useMemo } from "react";
import type { ProductType, VatCondition } from "@pos/shared-types";
import { useProducts, useStockLevels } from "./useCatalog";

// Una unidad vendible: un producto SIMPLE/BUNDLE, o una variante puntual de
// un producto VARIABLE. Es la forma que usa tanto la grilla como la
// resolución de escaneos — junta catálogo (Sprint 2) + stock del local
// activo (también Sprint 2) en una sola estructura "precargada".
export interface SellableUnit {
  productId: string;
  variantId: string | null;
  productType: ProductType;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  vatCondition: VatCondition;
  stockAvailable: number;
  isUnlimitedStock: boolean;
  attributes: Record<string, string> | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  type: ProductType;
  price: number;
  categoryId: string | null;
  categoryName: string | null;
  hasVariants: boolean;
  totalStock: number;
  isUnlimitedStock: boolean;
  variants: SellableUnit[];
}

export function usePosCatalog(storeId: string | undefined) {
  const { data: products, isLoading: loadingProducts } = useProducts({});
  const { data: stockRows, isLoading: loadingStock } = useStockLevels(storeId);

  const catalog = useMemo(() => {
    if (!products) return { products: [] as CatalogProduct[], units: [] as SellableUnit[] };

    const stockByKey = new Map<string, { quantity: number; isUnlimited: boolean }>();
    for (const row of stockRows ?? []) {
      const key = row.variantId ?? row.productId ?? "";
      stockByKey.set(key, { quantity: row.quantity, isUnlimited: row.isUnlimitedStock });
    }

    const catalogProducts: CatalogProduct[] = [];
    const units: SellableUnit[] = [];

    for (const product of products) {
      if (!product.isActive) continue;

      if (product.variants.length > 0) {
        const variantUnits: SellableUnit[] = product.variants.map((v) => {
          const stock = stockByKey.get(v.id) ?? { quantity: 0, isUnlimited: false };
          return {
            productId: product.id,
            variantId: v.id,
            productType: product.type,
            name: product.name,
            sku: v.sku,
            barcode: v.barcode,
            price: Number(v.price ?? product.price),
            vatCondition: product.vatCondition,
            stockAvailable: stock.quantity,
            isUnlimitedStock: stock.isUnlimited,
            attributes: v.attributes,
          };
        });
        units.push(...variantUnits);
        catalogProducts.push({
          id: product.id,
          name: product.name,
          sku: product.sku,
          type: product.type,
          price: Number(product.price),
          categoryId: product.categoryId,
          categoryName: product.category?.name ?? null,
          hasVariants: true,
          totalStock: variantUnits.reduce((sum, v) => sum + v.stockAvailable, 0),
          isUnlimitedStock: variantUnits.some((v) => v.isUnlimitedStock),
          variants: variantUnits,
        });
        continue;
      }

      const stock = stockByKey.get(product.id) ?? { quantity: 0, isUnlimited: false };
      const unit: SellableUnit = {
        productId: product.id,
        variantId: null,
        productType: product.type,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: Number(product.price),
        vatCondition: product.vatCondition,
        stockAvailable: stock.quantity,
        isUnlimitedStock: stock.isUnlimited,
        attributes: null,
      };
      units.push(unit);
      catalogProducts.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
        price: Number(product.price),
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        hasVariants: false,
        totalStock: unit.stockAvailable,
        isUnlimitedStock: unit.isUnlimitedStock,
        variants: [],
      });
    }

    return { products: catalogProducts, units };
  }, [products, stockRows]);

  function findByBarcode(barcode: string): SellableUnit | undefined {
    return catalog.units.find((u) => u.barcode === barcode);
  }

  return { ...catalog, findByBarcode, isLoading: loadingProducts || loadingStock };
}
