// Abstracción sobre la REST API de WooCommerce (wc/v3) — permite que el
// resto del módulo no sepa si habla con una tienda real o con un mock. En
// tests e2e, WooCommerceModule expone WooMockGateway bajo el mismo token
// para no depender de conectividad real con WordPress (ver docs/
// woocommerce-sync.md y test/woocommerce.e2e-spec.ts).
export const WOO_GATEWAY = Symbol('WOO_GATEWAY');

export interface WooCredentialInput {
  apiUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooRemoteProduct {
  id: number;
  sku: string;
  name: string;
  price: string;
  stockQuantity: number | null;
  manageStock: boolean;
  // WooCommerce trae más tipos (grouped, external) que este módulo no
  // procesa — se tratan igual que 'simple' en todos lados salvo el chequeo
  // explícito de 'variable' (ver woo-catalog-sync.service.ts).
  type: string;
}

export interface WooRemoteVariation {
  id: number;
  sku: string;
  price: string;
  stockQuantity: number | null;
  manageStock: boolean;
}

export interface WooGateway {
  // Usado por "Probar conexión" — cualquier llamada autenticada liviana
  // sirve, no hace falta un endpoint dedicado del lado de WooCommerce.
  testConnection(
    credential: WooCredentialInput,
  ): Promise<{ storeName?: string }>;

  listProducts(
    credential: WooCredentialInput,
    page: number,
  ): Promise<WooRemoteProduct[]>;

  listVariations(
    credential: WooCredentialInput,
    productId: number,
  ): Promise<WooRemoteVariation[]>;

  // Absoluto, no delta: WooCommerce es quien mantiene su propio contador de
  // stock_quantity — el POS siempre le manda "así queda", nunca "restá X".
  // variationId presente = actualiza una variación (endpoint anidado bajo
  // su producto padre); ausente = actualiza un producto simple.
  updateStock(
    credential: WooCredentialInput,
    remoteProductId: number,
    quantity: number,
    variationId?: number,
  ): Promise<void>;

  // Precio de venta (regular_price en la REST API de WooCommerce) — mismo
  // criterio que updateStock: absoluto, no delta, y variationId presente
  // actualiza la variación en vez del producto simple/padre.
  updatePrice(
    credential: WooCredentialInput,
    remoteProductId: number,
    price: number,
    variationId?: number,
  ): Promise<void>;
}
