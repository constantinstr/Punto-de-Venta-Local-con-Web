import type { VatCondition } from "@pos/shared-types";

export type DiscountType = "PERCENTAGE" | "FIXED";

export interface Discount {
  type: DiscountType;
  value: number;
}

export interface CartBundleComponent {
  componentProductId: string;
  componentVariantId?: string | null;
  name: string;
  quantity: number;
}

export interface CartItem {
  // productId:variantId (o solo productId si no hay variante) — clave de línea,
  // así escanear el mismo producto dos veces suma cantidad en vez de duplicar fila.
  lineId: string;
  productId: string;
  variantId?: string | null;
  name: string;
  // Ej: "Verde / M" — para variantes, mostrado debajo del nombre en el carrito.
  attributesLabel?: string;
  sku: string;
  barcode?: string | null;
  unitPrice: number; // precio de venta, IVA incluido (como se muestra al público)
  quantity: number;
  vatCondition: VatCondition;
  discount?: Discount;
  stockAvailable: number;
  isUnlimitedStock: boolean;
  isBundle: boolean;
  bundleComponents?: CartBundleComponent[];
}

export function makeLineId(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}
