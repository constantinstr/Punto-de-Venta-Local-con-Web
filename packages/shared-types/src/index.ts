// Tipos compartidos entre apps/api y apps/pos-web.
// Se van a ir poblando sprint a sprint a medida que se implementen los
// módulos correspondientes — ver docs/ROADMAP.md.

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

// Espejo del enum UserRole de prisma/schema.prisma. Se redefine acá (en vez
// de importar @pos/database) para que pos-web no dependa del paquete que
// trae el motor nativo de Prisma.
export type UserRole = "SUPERADMIN" | "OWNER" | "ADMIN" | "MANAGER" | "CASHIER";

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ──────────────────────────────────────────────────────────────────────────
// CATÁLOGO (Sprint 2)
// ──────────────────────────────────────────────────────────────────────────

export type ProductType = "SIMPLE" | "VARIABLE" | "BUNDLE";

export type VatCondition = "IVA_21" | "IVA_10_5" | "IVA_0" | "EXENTO" | "NO_GRAVADO";

export interface Store {
  id: string;
  name: string;
  address: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  price: string | null;
  costPrice: string | null;
}

export interface BundleItem {
  id: string;
  componentProductId: string;
  componentVariantId: string | null;
  componentProduct: { id: string; name: string; sku: string };
  componentVariant: { id: string; sku: string; attributes: Record<string, string> } | null;
  quantity: string;
}

export interface Product {
  id: string;
  categoryId: string | null;
  category: Category | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  type: ProductType;
  costPrice: string;
  price: string;
  vatCondition: VatCondition;
  trackStock: boolean;
  isActive: boolean;
  variants: ProductVariant[];
  bundleComponents?: BundleItem[];
}

export interface StockEntryInput {
  storeId: string;
  quantity: number;
}

export interface CreateVariantInput {
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  price?: number;
  costPrice?: number;
  initialStock?: StockEntryInput[];
}

export interface CreateBundleItemInput {
  componentProductId: string;
  componentVariantId?: string;
  quantity: number;
}

export interface CreateProductInput {
  categoryId?: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  type: ProductType;
  costPrice: number;
  price: number;
  vatCondition: VatCondition;
  trackStock?: boolean;
  variants?: CreateVariantInput[];
  bundleItems?: CreateBundleItemInput[];
  initialStock?: StockEntryInput[];
}

export interface UpdateProductInput {
  categoryId?: string;
  barcode?: string;
  name?: string;
  description?: string;
  costPrice?: number;
  price?: number;
  vatCondition?: VatCondition;
  isActive?: boolean;
}

export interface StockRow {
  productId: string | null;
  variantId: string | null;
  name: string;
  sku: string;
  attributes: Record<string, string> | null;
  quantity: number;
  reservedQuantity?: number;
  minAlertStock: number | null;
  isUnlimitedStock: boolean;
}

export interface PosSearchResult {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string> | null;
  price: number;
  availableStock: number;
  isUnlimitedStock: boolean;
}

export interface AdjustStockInput {
  storeId: string;
  productId?: string;
  variantId?: string;
  delta?: number;
  absoluteQuantity?: number;
  reason: string;
}
