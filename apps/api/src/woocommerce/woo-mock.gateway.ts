import { Injectable } from '@nestjs/common';
import type {
  WooCredentialInput,
  WooGateway,
  WooRemoteProduct,
  WooRemoteVariation,
} from './woo-gateway.interface';

// Simula la REST API de WooCommerce sin tocar la red — para tests e2e y
// desarrollo sin una tienda real a mano. Se activa vía WOO_MOCK=true (ver
// woocommerce.module.ts) o se inyecta directamente overrideando WOO_GATEWAY
// en el testing module de Nest (ver test/woocommerce.e2e-spec.ts).
//
// Guarda cada llamada a updateStock para que los tests puedan verificar qué
// se le "mandó" a WooCommerce sin depender de mockear fetch a mano.
export interface RecordedStockUpdate {
  remoteProductId: number;
  variationId?: number;
  quantity: number;
}

export interface RecordedPriceUpdate {
  remoteProductId: number;
  variationId?: number;
  price: number;
}

const FORCE_FAIL_API_URL_MARKER = 'force-fail.invalid';

@Injectable()
export class WooMockGateway implements WooGateway {
  readonly recordedUpdates: RecordedStockUpdate[] = [];
  readonly recordedPriceUpdates: RecordedPriceUpdate[] = [];
  private readonly catalog = new Map<number, WooRemoteProduct>();
  private readonly variations = new Map<number, WooRemoteVariation[]>();

  // Helpers de setup para tests — no forman parte de WooGateway.
  seedProduct(product: WooRemoteProduct): void {
    this.catalog.set(product.id, product);
  }

  seedVariations(productId: number, variations: WooRemoteVariation[]): void {
    this.variations.set(productId, variations);
  }

  testConnection(
    credential: WooCredentialInput,
  ): Promise<{ storeName?: string }> {
    if (credential.apiUrl.includes(FORCE_FAIL_API_URL_MARKER)) {
      return Promise.reject(new Error('Credenciales inválidas (mock)'));
    }
    return Promise.resolve({ storeName: 'Tienda Mock' });
  }

  listProducts(
    _credential: WooCredentialInput,
    page: number,
  ): Promise<WooRemoteProduct[]> {
    if (page > 1) return Promise.resolve([]);
    return Promise.resolve([...this.catalog.values()]);
  }

  listVariations(
    _credential: WooCredentialInput,
    productId: number,
  ): Promise<WooRemoteVariation[]> {
    return Promise.resolve(this.variations.get(productId) ?? []);
  }

  updateStock(
    _credential: WooCredentialInput,
    remoteProductId: number,
    quantity: number,
    variationId?: number,
  ): Promise<void> {
    this.recordedUpdates.push({ remoteProductId, variationId, quantity });
    return Promise.resolve();
  }

  updatePrice(
    _credential: WooCredentialInput,
    remoteProductId: number,
    price: number,
    variationId?: number,
  ): Promise<void> {
    this.recordedPriceUpdates.push({ remoteProductId, variationId, price });
    return Promise.resolve();
  }
}
