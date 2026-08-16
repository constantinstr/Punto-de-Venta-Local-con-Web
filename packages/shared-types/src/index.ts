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
  vatCondition: VatCondition;
  productType: ProductType;
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

// ──────────────────────────────────────────────────────────────────────────
// CAJA (Sprint 4)
// ──────────────────────────────────────────────────────────────────────────

export type CashRegisterStatus = "ACTIVE" | "INACTIVE";
export type CashShiftStatus = "OPEN" | "CLOSED";
export type CashMovementType = "INFLOW" | "OUTFLOW";

export interface CashRegister {
  id: string;
  storeId: string;
  name: string;
  status: CashRegisterStatus;
}

export interface CashShiftUser {
  id: string;
  fullName: string;
  email: string;
}

export interface CashShift {
  id: string;
  storeId: string;
  cashRegisterId: string;
  cashRegister: CashRegister;
  userId: string;
  user: CashShiftUser;
  initialAmount: string;
  actualCash: string | null;
  expectedCash: string | null;
  difference: string | null;
  notes: string | null;
  status: CashShiftStatus;
  openedAt: string;
  closedAt: string | null;
  movements?: CashMovement[];
}

export interface CashMovement {
  id: string;
  cashShiftId: string;
  userId: string;
  user?: { id: string; fullName: string };
  type: CashMovementType;
  amount: string;
  reason: string;
  createdAt: string;
}

export interface CashShiftSummary {
  cashShiftId: string;
  status: CashShiftStatus;
  initialAmount: number;
  totalInflows: number;
  totalOutflows: number;
  cashSalesTotal: number;
  expectedCash: number;
}

export interface OpenShiftInput {
  cashRegisterId: string;
  initialAmount: number;
}

export interface CreateMovementInput {
  type: CashMovementType;
  amount: number;
  reason: string;
}

export interface CloseShiftInput {
  actualCash: number;
  notes?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// ÓRDENES Y PAGOS (Sprint 5)
// ──────────────────────────────────────────────────────────────────────────

export type OrderStatus = "COMPLETED" | "CANCELLED" | "REFUNDED";
export type PaymentMethod = "CASH" | "DEBIT_CARD" | "CREDIT_CARD" | "TRANSFER" | "MERCADO_PAGO" | "CURRENT_ACCOUNT";

export interface CreateOrderItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  discountAmount?: number;
}

export interface CreatePaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateOrderInput {
  storeId: string;
  cashShiftId?: string;
  items: CreateOrderItemInput[];
  payments: CreatePaymentInput[];
  notes?: string;
}

export interface OrderItemBundleComponent {
  id: string;
  componentProductId: string;
  componentVariantId: string | null;
  componentName: string;
  quantity: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productType: ProductType;
  productName: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  vatCondition: VatCondition;
  taxRate: string;
  discountAmount: string;
  subtotal: string;
  total: string;
  bundleComponents: OrderItemBundleComponent[];
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  storeId: string;
  cashShiftId: string | null;
  userId: string;
  user: { id: string; fullName: string };
  status: OrderStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  items: OrderItem[];
  payments: OrderPayment[];
  createdAt: string;
}
