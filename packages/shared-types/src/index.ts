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

export type WooSyncStatus = "SYNCED" | "PENDING" | "ERROR" | "IGNORED";

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
  wooProductId: number | null;
  wooSyncStatus: WooSyncStatus;
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

// ──────────────────────────────────────────────────────────────────────────
// FACTURACIÓN AFIP (Sprint 6)
// ──────────────────────────────────────────────────────────────────────────

export type FiscalTaxCondition = "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | "EXENTO";
export type CustomerDocType = "CUIT" | "DNI" | "PASAPORTE" | "FINAL_CONSUMER";
export type CustomerTaxCondition = "CONSUMIDOR_FINAL" | "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO";
export type InvoiceType =
  | "FACTURA_A"
  | "FACTURA_B"
  | "FACTURA_C"
  | "NOTA_CREDITO_A"
  | "NOTA_CREDITO_B"
  | "NOTA_CREDITO_C"
  | "TICKET_X";
export type InvoiceStatus = "ISSUED" | "REJECTED" | "CANCELLED";
// Factura C nunca es seleccionable por el cajero — el servidor la fuerza
// solo si el emisor es Monotributo (ver invoice-type.util.ts en la API).
export type RequestedInvoiceType = "TICKET_X" | "FACTURA_A" | "FACTURA_B";

export interface FiscalConfig {
  id: string;
  storeId: string;
  cuit: string;
  taxCondition: FiscalTaxCondition;
  grossIncomeNumber: string | null;
  activityStartDate: string | null;
  ptoVta: number;
  isProduction: boolean;
}

export interface CreateFiscalConfigInput {
  storeId: string;
  cuit: string;
  taxCondition: FiscalTaxCondition;
  grossIncomeNumber?: string;
  activityStartDate?: string;
  ptoVta: number;
  crtCertificate: string;
  keyCertificate: string;
  isProduction?: boolean;
}

export interface Customer {
  id: string;
  docType: CustomerDocType;
  docNumber: string | null;
  name: string;
  businessName: string | null;
  taxCondition: CustomerTaxCondition;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface CreateCustomerInput {
  docType?: CustomerDocType;
  docNumber?: string;
  name: string;
  businessName?: string;
  taxCondition?: CustomerTaxCondition;
  address?: string;
  email?: string;
  phone?: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  customerId: string | null;
  customer: Customer | null;
  invoiceType: InvoiceType;
  ptoVta: number;
  cbteNro: number | null;
  cae: string | null;
  caeVto: string | null;
  afipQrUrl: string | null;
  status: InvoiceStatus;
  subtotalNeto: string;
  vatAmount: string;
  total: string;
  errorMessage: string | null;
  issuedAt: string | null;
  createdAt: string;
}

export interface CreateInvoiceInput {
  orderId: string;
  customerId?: string;
  requestedType?: RequestedInvoiceType;
}

// ──────────────────────────────────────────────────────────────────────────
// SINCRONIZACIÓN WOOCOMMERCE (Sprint 7)
// ──────────────────────────────────────────────────────────────────────────

export interface WooCommerceConfig {
  id: string;
  storeId: string;
  apiUrl: string;
  syncStockOutbound: boolean;
  syncStockInbound: boolean;
  isActive: boolean;
  lastSyncAt: string | null;
  webhookUrl: string;
}

export interface CreateWooConfigInput {
  storeId: string;
  apiUrl: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string;
  syncStockOutbound?: boolean;
  syncStockInbound?: boolean;
  isActive?: boolean;
}

export interface UpdateWooConfigInput {
  apiUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
  syncStockOutbound?: boolean;
  syncStockInbound?: boolean;
  isActive?: boolean;
}

export type SyncEntityType = "PRODUCT" | "STOCK" | "ORDER";
export type SyncDirection = "OUTBOUND_TO_WOO" | "INBOUND_FROM_WOO";
export type SyncStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface SyncLog {
  id: string;
  entityType: SyncEntityType;
  direction: SyncDirection;
  status: SyncStatus;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
}

export interface TestConnectionResult {
  success: boolean;
  storeName?: string;
  message?: string;
}

export interface CatalogSyncSummary {
  scanned: number;
  matched: number;
  created: number;
  skipped: number;
  errors: number;
}

// ──────────────────────────────────────────────────────────────────────────
// REPORTES Y MÉTRICAS (Sprint 8)
// ──────────────────────────────────────────────────────────────────────────

export interface ReportRangeInput {
  from: string;
  to: string;
  storeId?: string;
}

export interface VatBreakdownEntry {
  rate: number;
  amount: number;
}

export interface SalesSummaryReport {
  from: string;
  to: string;
  grossRevenue: number;
  netRevenue: number;
  vatByRate: VatBreakdownEntry[];
  totalDiscounts: number;
  totalCost: number;
  grossMargin: number;
  averageTicket: number;
  completedCount: number;
  cancelledCount: number;
  timeSeries: { date: string; grossRevenue: number; ticketCount: number }[];
}

export interface PaymentMethodBreakdownEntry {
  method: PaymentMethod;
  count: number;
  total: number;
  percentage: number;
}

export interface PaymentMethodsReport {
  from: string;
  to: string;
  breakdown: PaymentMethodBreakdownEntry[];
  grandTotal: number;
}

export interface TopProductEntry {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  posUnits: number;
  onlineUnits: number;
}

export interface TopProductsReport {
  from: string;
  to: string;
  products: TopProductEntry[];
}

export interface CashShiftHistoryEntry {
  id: string;
  storeId: string;
  cashRegisterName: string;
  userFullName: string;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
}

export interface CashShiftsHistoryReport {
  from: string;
  to: string;
  shifts: CashShiftHistoryEntry[];
}
