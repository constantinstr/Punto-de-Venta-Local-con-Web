import type { VatCondition } from "@pos/shared-types";

export type DiscountType = "PERCENTAGE" | "FIXED";

export interface Discount {
  type: DiscountType;
  value: number;
}

// Solo para mostrar qué trae un combo en la línea del carrito. No lleva ids a
// propósito: el descuento de stock de los componentes lo resuelve el backend
// a partir de BundleItem, así que el POS no necesita conocerlos — y el
// catálogo del POS (que se guarda como snapshot offline en cada terminal) no
// los transporta justamente para no engordar ese payload.
export interface CartBundleComponent {
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
