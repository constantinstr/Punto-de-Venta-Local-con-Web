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

// OWNER y SUPERADMIN quedan afuera a propósito — nunca asignables por
// /users (ver ASSIGNABLE_ROLES en la API).
export type AssignableRole = "ADMIN" | "MANAGER" | "CASHIER";

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: AssignableRole;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: AssignableRole;
  isActive?: boolean;
  newPassword?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Respuesta de POST /demo/start. `credentials` viaja en claro (sin mailer en
// el repo) para que el visitante pueda volver a entrar desde otro dispositivo
// dentro de los 7 días del sandbox — el frontend la muestra una sola vez.
export interface DemoStartResponse {
  user: AuthUser;
  tokens: AuthTokens;
  credentials: { email: string; password: string };
  demoExpiresAt: string;
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

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string;
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

// Forma liviana que devuelve GET /products (lista y catálogo del POS): solo
// alcanza para responder "¿qué trae este combo?" en el mostrador. El detalle
// completo, con ids y SKU de cada componente, viene en GET /products/:id.
export interface BundleComponentSummary {
  quantity: string;
  componentProduct: { name: string };
  componentVariant: { attributes: Record<string, string> } | null;
}

// Cómo se fija el precio de un combo. Con DERIVED lo calcula el sistema como
// la suma de los componentes menos bundleDiscountPercent, y se recalcula solo
// cuando cambia el precio de un componente.
export type BundlePricingMode = "MANUAL" | "DERIVED";

export type WooSyncStatus = "SYNCED" | "PENDING" | "ERROR" | "IGNORED";

export interface Product {
  id: string;
  categoryId: string | null;
  category: Category | null;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: ProductType;
  costPrice: string;
  price: string;
  vatCondition: VatCondition;
  trackStock: boolean;
  isActive: boolean;
  variants: ProductVariant[];
  // La forma liviana, que es la que devuelve GET /products (lista y catálogo
  // del POS). El detalle completo con ids está en ProductDetail.
  bundleComponents?: BundleComponentSummary[];
  bundlePricingMode: BundlePricingMode;
  bundleDiscountPercent: string | null;
  wooProductId: number | null;
  wooSyncStatus: WooSyncStatus;
}

// Lo que devuelve GET /products/:id: igual que Product pero con los
// componentes completos (ids y SKU), que es lo que necesita la pantalla de
// edición del combo para poder quitarlos. Se separa del listado a propósito:
// ese payload viaja en cada carga del POS y se guarda en cada terminal.
export interface ProductDetail extends Omit<Product, "bundleComponents"> {
  bundleComponents?: BundleItem[];
}

export interface StockEntryInput {
  storeId: string;
  quantity: number;
  minAlertStock?: number;
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
  // Solo para combos. Con DERIVED el backend rechaza que se mande `price`:
  // lo calcula él desde los componentes.
  bundlePricingMode?: BundlePricingMode;
  bundleDiscountPercent?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// IMPORTACIÓN MASIVA Y PRECIOS EN LOTE
// ──────────────────────────────────────────────────────────────────────────

export interface ImportRowResult {
  row: number;
  action: "create" | "update" | "error";
  sku: string | null;
  name: string | null;
  reason?: string;
}

export interface ImportSummary {
  create: number;
  update: number;
  error: number;
}

export interface ImportPreviewResult {
  results: ImportRowResult[];
  summary: ImportSummary;
}

export type BulkPriceMode = "PERCENT" | "FIXED_DELTA";

export interface BulkPriceUpdateInput {
  categoryId?: string;
  mode: BulkPriceMode;
  value: number;
}

export interface BulkPriceSample {
  id: string;
  sku: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

export interface BulkPricePreviewResult {
  affectedCount: number;
  sample: BulkPriceSample[];
}

// ──────────────────────────────────────────────────────────────────────────
// TOPE DE DESCUENTO POR ROL
// ──────────────────────────────────────────────────────────────────────────

// Si el comercio no configuró nada, cada rol arranca con un tope por defecto
// (cajero 0%, encargado 10%, administrador y dueño sin tope). El backend
// devuelve SIEMPRE los cuatro roles con su valor efectivo, así que la pantalla
// no necesita conocer esos defaults ni rellenar huecos.
export interface DiscountPolicy {
  role: UserRole;
  maxPercent: number;
  /** true = es el valor por defecto, el comercio todavía no decidió otro. */
  isDefault: boolean;
}

export interface SetDiscountPolicyInput {
  role: UserRole;
  /**
   * null vuelve al valor por defecto de ese rol. Para dejarlo SIN TOPE se
   * manda 100: un descuento nunca puede superar el bruto de la línea, así que
   * no hay nada más allá del 100%.
   */
  maxPercent: number | null;
}

/** Tope con el que un rol deja de tener límite práctico. */
export const NO_DISCOUNT_LIMIT = 100;

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
  minAlertStock?: number;
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
  customerId?: string;
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
  cashShift?: { id: string; status: string } | null;
  userId: string;
  user: { id: string; fullName: string };
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  status: OrderStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  items: OrderItem[];
  payments: OrderPayment[];
  // Plural desde que existen las notas de crédito: una venta anulada que
  // estaba facturada trae la factura original Y su NC. Para mostrar "el
  // comprobante" usar los helpers de abajo, no invoices[0] — el orden no
  // está garantizado.
  invoices?: OrderInvoiceSummary[];
  createdAt: string;
}

export interface OrderInvoiceSummary {
  id: string;
  invoiceType: InvoiceType;
  cbteNro: number | null;
  cae: string | null;
  status: InvoiceStatus;
}

export const CREDIT_NOTE_INVOICE_TYPES: InvoiceType[] = [
  "NOTA_CREDITO_A",
  "NOTA_CREDITO_B",
  "NOTA_CREDITO_C",
];

/** El comprobante de venta de la orden (excluye notas de crédito). */
export function findSaleInvoice(
  order: Pick<Order, "invoices">,
): OrderInvoiceSummary | null {
  return (
    order.invoices?.find(
      (i) => !CREDIT_NOTE_INVOICE_TYPES.includes(i.invoiceType),
    ) ?? null
  );
}

/** La nota de crédito que anuló la venta, si la orden fue anulada. */
export function findCreditNote(
  order: Pick<Order, "invoices">,
): OrderInvoiceSummary | null {
  return (
    order.invoices?.find((i) =>
      CREDIT_NOTE_INVOICE_TYPES.includes(i.invoiceType),
    ) ?? null
  );
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
  accountBalance: string;
  creditLimit: string | null;
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

export interface UpdateCustomerInput {
  docType?: CustomerDocType;
  docNumber?: string;
  name?: string;
  businessName?: string;
  taxCondition?: CustomerTaxCondition;
  address?: string;
  email?: string;
  phone?: string;
  creditLimit?: number | null;
}

export type AccountMovementType = "CHARGE" | "PAYMENT" | "ADJUSTMENT" | "CHARGE_REVERSAL";

export interface CustomerAccountMovement {
  id: string;
  customerId: string;
  storeId: string | null;
  type: AccountMovementType;
  amount: string;
  balanceAfter: string;
  orderId: string | null;
  cashShiftId: string | null;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  userId: string;
  createdAt: string;
}

export interface CustomerAccount {
  customer: Customer;
  movements: {
    data: CustomerAccountMovement[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface RegisterAccountPaymentInput {
  amount: number;
  method: PaymentMethod;
  cashShiftId?: string;
  reference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface RegisterAccountAdjustmentInput {
  delta: number;
  reason: string;
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
  syncPriceOutbound: boolean;
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
  syncPriceOutbound?: boolean;
  isActive?: boolean;
}

export interface UpdateWooConfigInput {
  apiUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
  syncStockOutbound?: boolean;
  syncStockInbound?: boolean;
  syncPriceOutbound?: boolean;
  isActive?: boolean;
}

export type SyncEntityType = "PRODUCT" | "STOCK" | "ORDER";
export type SyncDirection =
  | "OUTBOUND_TO_WOO"
  | "INBOUND_FROM_WOO"
  | "OUTBOUND_TO_TIENDANUBE"
  | "INBOUND_FROM_TIENDANUBE";
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
// SINCRONIZACIÓN TIENDA NUBE
// ──────────────────────────────────────────────────────────────────────────

// No hay CreateTiendanubeConfigInput: la configuración no se carga a mano,
// nace del callback de OAuth. Desde la app solo se prenden y apagan opciones.
export interface TiendanubeConfig {
  id: string;
  storeId: string;
  /** Id de la tienda del lado de ellos. Se muestra como referencia. */
  tnStoreId: string;
  scopes: string | null;
  syncStockOutbound: boolean;
  syncStockInbound: boolean;
  syncPriceOutbound: boolean;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface UpdateTiendanubeConfigInput {
  syncStockOutbound?: boolean;
  syncStockInbound?: boolean;
  syncPriceOutbound?: boolean;
  isActive?: boolean;
}

export interface TiendanubeAuthorizeUrl {
  url: string;
}

// La vinculación de catálogo de Tienda Nube no crea productos (a diferencia
// de la de WooCommerce), así que no comparte CatalogSyncSummary: acá solo hay
// "se ató" o "no hay SKU equivalente".
export interface TiendanubeCatalogSyncResult {
  revisados: number;
  vinculados: number;
  sinCoincidencia: number;
}

export interface TiendanubeWebhookRegistration {
  registered: string[];
  error?: string;
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

// action es texto libre del lado del backend (ver apps/api/src/audit) —
// esta unión es una guía para el front, no una validación exhaustiva: no
// hace falta tocar el backend para agregar una acción nueva.
export type AuditAction =
  | "stock.adjust"
  | "order.cancel"
  | "user.create"
  | "user.update"
  | "customer.account.payment"
  | "customer.account.adjustment"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "product.bulk-import"
  | "product.bulk-price-update"
  | "purchase.create";

export interface AuditLogEntry {
  id: string;
  storeId: string | null;
  userId: string | null;
  userEmail: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedAuditLog {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVEEDORES Y COMPRAS (Fase 7)
// ──────────────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSupplierInput {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  quantity: string;
  unitCost: string;
  subtotal: string;
}

export interface Purchase {
  id: string;
  storeId: string;
  supplierId: string;
  supplier: { id: string; name: string };
  userId: string;
  user: { id: string; fullName: string };
  purchaseNumber: number;
  invoiceNumber: string | null;
  total: string;
  notes: string | null;
  items: PurchaseItem[];
  createdAt: string;
}

export interface CreatePurchaseItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  storeId: string;
  supplierId: string;
  invoiceNumber?: string;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export interface PaginatedPurchases {
  data: Purchase[];
  total: number;
  page: number;
  limit: number;
}

// ──────────────────────────────────────────────────────────────────────────
// SUSCRIPCIÓN DEL SAAS (licencia mensual)
// ──────────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export type EnforcementPolicy = "WARN_ONLY" | "READ_ONLY" | "BLOCK";

/** Estado efectivo derivado de las fechas (ver subscription-status.util.ts en la API). */
export type EffectiveSubscriptionState =
  | "TRIAL"
  | "ACTIVE"
  | "GRACE"
  | "EXPIRED"
  | "CANCELLED";

export interface SubscriptionSnapshot {
  state: EffectiveSubscriptionState;
  daysRemaining: number;
  shouldWarn: boolean;
  message: string | null;
  blocksWrites: boolean;
  blocksAccess: boolean;
}

// "standard" = comercio real. "demo" = sandbox efímero autoprovisionado desde
// la landing pública, ver POST /demo/start. Solo "demo" trae `usage` no-nulo.
export type PlanTier = "standard" | "demo";

// Las tres funciones que un tenant demo tiene bloqueadas por cartel Premium.
// El servidor es la frontera real (PlanFeatureInterceptor + chequeos puntuales
// en InvoicesService/EcommerceSyncService) — esto solo transporta el estado
// para que la UI dibuje el candado; nunca es la fuente de verdad.
export type PremiumFeature = "FISCAL_INVOICING" | "WOO_SYNC" | "TIENDANUBE_SYNC";

export interface PlanState {
  tier: PlanTier;
  isDemo: boolean;
  demoExpiresAt: string | null;
  demoDaysRemaining: number | null;
  features: Record<PremiumFeature, boolean>;
  limits: { maxProducts: number | null; maxStores: number | null };
  /** null cuando no es demo — evita pagar el costo de contar filas de un tenant real. */
  usage: { products: number; stores: number } | null;
}

export interface TenantSubscription {
  tenantId: string;
  tenantName: string;
  contactEmail: string | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  monthlyAmount: number | null;
  enforcementPolicy: EnforcementPolicy;
  hasMercadoPagoSubscription: boolean;
  snapshot: SubscriptionSnapshot;
  plan: PlanState;
}

export interface SubscriptionEvent {
  id: string;
  type: string;
  status: string;
  amount: string | null;
  mpPaymentId: string | null;
  periodEnd: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SubscribeResponse {
  initPoint: string | null;
  preapprovalId: string;
}

export interface UpdateTenantSubscriptionInput {
  monthlyAmount?: number;
  enforcementPolicy?: EnforcementPolicy;
  currentPeriodEnd?: string;
  subscriptionStatus?: SubscriptionStatus;
  notes?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN: LOCALES Y FACTURACIÓN
// ──────────────────────────────────────────────────────────────────────────

export interface CreateStoreInput {
  name: string;
  address?: string;
}

/** Un local no se borra ni se mueve de comercio: de él cuelgan ventas y
 *  comprobantes fiscales ya emitidos. Solo se corrigen nombre y dirección. */
export interface UpdateStoreInput {
  name?: string;
  address?: string;
}

export interface UpdateFiscalConfigInput {
  cuit?: string;
  taxCondition?: FiscalTaxCondition;
  grossIncomeNumber?: string;
  activityStartDate?: string;
  ptoVta?: number;
  /** Se mandan siempre juntos: un certificado nuevo con la clave vieja no firma. */
  crtCertificate?: string;
  keyCertificate?: string;
  isProduction?: boolean;
}
