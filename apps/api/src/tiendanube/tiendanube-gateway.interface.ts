// Abstracción sobre la API de Tienda Nube — mismo criterio que WOO_GATEWAY:
// el resto del módulo no sabe si habla con una tienda real o con un
// simulador. Se activa el simulador con TIENDANUBE_MOCK=true.
//
// Se mantiene SEPARADO del gateway de WooCommerce a propósito. Unificar los
// dos bajo una interfaz común es tentador, pero las APIs difieren en cosas de
// fondo (autenticación, forma de las variantes, cómo se expresa el stock) y
// forzar un contrato único ahora significaría refactorizar código que ya
// funciona para satisfacer a un caso que todavía no corrió contra la API
// real. Se decide recién cuando esta integración esté probada de verdad.
export const TIENDANUBE_GATEWAY = Symbol('TIENDANUBE_GATEWAY');

// A diferencia de WooCommerce (apiUrl + clave + secreto), acá alcanza con el
// token de OAuth y el id de la tienda del lado de ellos: la URL base es
// siempre la misma y el id va en el path de cada ruta.
export interface TnCredentialInput {
  tnStoreId: string;
  accessToken: string;
}

export interface TnRemoteVariant {
  id: number;
  sku: string | null;
  price: string | null;
  stock: number | null;
  /** Tienda Nube usa stock = null para "sin control de stock". */
  managesStock: boolean;
}

export interface TnRemoteProduct {
  id: number;
  name: string;
  /** En Tienda Nube el SKU vive en la variante, no en el producto. Incluso
   *  un producto "simple" tiene una variante por defecto. */
  variants: TnRemoteVariant[];
}

export interface TnRemoteOrderItem {
  variantId: number;
  sku: string | null;
  quantity: number;
  price: string;
}

export interface TnRemoteOrder {
  id: number;
  number: number;
  status: string;
  items: TnRemoteOrderItem[];
}

export interface TiendanubeGateway {
  /** Canjea el `code` del callback de OAuth por un token que no vence. */
  exchangeCode(code: string): Promise<{
    accessToken: string;
    tnStoreId: string;
    scopes: string;
  }>;

  /** Usado por "Probar conexión": cualquier llamada autenticada liviana. */
  testConnection(
    credential: TnCredentialInput,
  ): Promise<{ storeName?: string }>;

  listProducts(
    credential: TnCredentialInput,
    page: number,
  ): Promise<TnRemoteProduct[]>;

  /** Absoluto, no delta: el POS siempre manda "así queda", nunca "restá X". */
  updateStock(
    credential: TnCredentialInput,
    productId: number,
    variantId: number,
    quantity: number,
  ): Promise<void>;

  updatePrice(
    credential: TnCredentialInput,
    productId: number,
    variantId: number,
    price: number,
  ): Promise<void>;

  getOrder(
    credential: TnCredentialInput,
    orderId: number,
  ): Promise<TnRemoteOrder>;

  /** Los webhooks de Tienda Nube se dan de alta por tienda, con el token de
   *  esa tienda — no se configuran una sola vez en el panel de partner como
   *  en WooCommerce. Por eso hay que registrarlos al conectar. */
  listWebhooks(credential: TnCredentialInput): Promise<TnRemoteWebhook[]>;

  createWebhook(
    credential: TnCredentialInput,
    event: string,
    url: string,
  ): Promise<TnRemoteWebhook>;

  deleteWebhook(credential: TnCredentialInput, id: number): Promise<void>;
}

export interface TnRemoteWebhook {
  id: number;
  event: string;
  url: string;
}
