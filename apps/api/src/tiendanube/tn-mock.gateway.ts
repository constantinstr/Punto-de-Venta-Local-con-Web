import { Injectable } from '@nestjs/common';
import type {
  TiendanubeGateway,
  TnCredentialInput,
  TnRemoteOrder,
  TnRemoteProduct,
  TnRemoteWebhook,
} from './tiendanube-gateway.interface';

// Simulador de la API de Tienda Nube, sin red.
//
// Es lo que permite construir y probar la integración ENTERA sin depender de
// que Tienda Nube apruebe la app de partner: el trámite de alta puede tardar,
// y no tiene sentido bloquear el desarrollo esperándolo. Se activa con
// TIENDANUBE_MOCK=true, o inyectando el token directo en los tests e2e
// (mismo patrón que AfipMockGateway y WooMockGateway).
//
// Mantiene el stock y los precios en memoria para que un test pueda escribir
// y volver a leer, que es lo que hace verificable el flujo de sincronización.
const MOCK_CODE_INVALIDO = 'codigo-invalido';

@Injectable()
export class TnMockGateway implements TiendanubeGateway {
  private readonly stock = new Map<string, number>();
  private readonly prices = new Map<string, number>();
  private readonly webhooks = new Map<number, TnRemoteWebhook>();
  private readonly orders = new Map<number, TnRemoteOrder>();
  private nextWebhookId = 1;

  private key(productId: number, variantId: number): string {
    return `${productId}:${variantId}`;
  }

  exchangeCode(code: string) {
    if (code === MOCK_CODE_INVALIDO) {
      return Promise.reject(
        new Error('Código de autorización inválido (simulado)'),
      );
    }
    return Promise.resolve({
      accessToken: `mock-token-${code}`,
      tnStoreId: '1234567',
      scopes: 'read_products,write_products,read_orders',
    });
  }

  // Sin parámetro: el contrato recibe la credencial pero el simulador no la
  // mira, y TypeScript permite implementar con menos parámetros.
  testConnection() {
    return Promise.resolve({ storeName: 'Tienda de prueba (simulada)' });
  }

  listProducts(
    _credential: TnCredentialInput,
    page: number,
  ): Promise<TnRemoteProduct[]> {
    // Una sola página con contenido: así el bucle de paginado del servicio de
    // catálogo termina, igual que terminaría contra una tienda real.
    if (page > 1) return Promise.resolve([]);
    return Promise.resolve([
      {
        id: 101,
        name: 'Producto simulado A',
        variants: [
          {
            id: 1001,
            sku: 'MOCK-A',
            price: String(this.prices.get(this.key(101, 1001)) ?? 1500),
            stock: this.stock.get(this.key(101, 1001)) ?? 10,
            managesStock: true,
          },
        ],
      },
      {
        id: 102,
        name: 'Producto simulado B',
        variants: [
          {
            id: 1002,
            sku: 'MOCK-B',
            price: String(this.prices.get(this.key(102, 1002)) ?? 2500),
            stock: this.stock.get(this.key(102, 1002)) ?? 4,
            managesStock: true,
          },
        ],
      },
    ]);
  }

  updateStock(
    _credential: TnCredentialInput,
    productId: number,
    variantId: number,
    quantity: number,
  ): Promise<void> {
    this.stock.set(this.key(productId, variantId), quantity);
    return Promise.resolve();
  }

  updatePrice(
    _credential: TnCredentialInput,
    productId: number,
    variantId: number,
    price: number,
  ): Promise<void> {
    this.prices.set(this.key(productId, variantId), price);
    return Promise.resolve();
  }

  getOrder(
    _credential: TnCredentialInput,
    orderId: number,
  ): Promise<TnRemoteOrder> {
    // Un test puede preparar el pedido con setOrder(); si no, se devuelve uno
    // por defecto sobre la variante simulada A.
    const prepared = this.orders.get(orderId);
    if (prepared) return Promise.resolve(prepared);

    return Promise.resolve({
      id: orderId,
      number: orderId,
      status: 'paid',
      items: [
        { variantId: 1001, sku: 'MOCK-A', quantity: 1, price: '1500.00' },
      ],
    });
  }

  listWebhooks(): Promise<TnRemoteWebhook[]> {
    return Promise.resolve([...this.webhooks.values()]);
  }

  createWebhook(
    _credential: TnCredentialInput,
    event: string,
    url: string,
  ): Promise<TnRemoteWebhook> {
    const webhook = { id: this.nextWebhookId++, event, url };
    this.webhooks.set(webhook.id, webhook);
    return Promise.resolve(webhook);
  }

  deleteWebhook(_credential: TnCredentialInput, id: number): Promise<void> {
    this.webhooks.delete(id);
    return Promise.resolve();
  }

  /** Solo para tests: lo último que se le mandó a la "tienda". */
  readStock(productId: number, variantId: number): number | undefined {
    return this.stock.get(this.key(productId, variantId));
  }

  /** Solo para tests: simula el pedido que dispararía un webhook order/paid. */
  setOrder(order: TnRemoteOrder): void {
    this.orders.set(order.id, order);
  }
}
