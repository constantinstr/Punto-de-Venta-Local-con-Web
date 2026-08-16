import { Injectable } from '@nestjs/common';
import type {
  WooCredentialInput,
  WooGateway,
  WooRemoteProduct,
  WooRemoteVariation,
} from './woo-gateway.interface';

// La REST API v3 de WooCommerce acepta las consumer keys por Basic Auth
// (header) o por query string — Basic Auth requiere HTTPS en el flujo
// "oficial" de WooCommerce, así que para tiendas de desarrollo servidas por
// http:// (ej. un WordPress local de prueba) hay que caer a query string o
// WooCommerce devuelve 401 aunque las credenciales sean correctas.
function buildRequest(
  credential: WooCredentialInput,
  path: string,
  query: Record<string, string | number> = {},
): { url: string; headers: Record<string, string> } {
  const base = credential.apiUrl.replace(/\/+$/, '');
  const isHttps = base.startsWith('https://');
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
  );

  if (isHttps) {
    const url = `${base}/wp-json/wc/v3/${path}${params.size ? `?${params}` : ''}`;
    const basic = Buffer.from(
      `${credential.consumerKey}:${credential.consumerSecret}`,
    ).toString('base64');
    return { url, headers: { Authorization: `Basic ${basic}` } };
  }

  params.set('consumer_key', credential.consumerKey);
  params.set('consumer_secret', credential.consumerSecret);
  return { url: `${base}/wp-json/wc/v3/${path}?${params}`, headers: {} };
}

async function parseJsonOrThrow(
  res: Response,
  context: string,
): Promise<unknown> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `WooCommerce respondió ${res.status} en ${context}: ${body.slice(0, 300)}`,
    );
  }
  return res.json();
}

function toRemoteProduct(raw: Record<string, unknown>): WooRemoteProduct {
  return {
    id: raw.id as number,
    sku: (raw.sku as string) ?? '',
    name: (raw.name as string) ?? '',
    price: (raw.price as string) ?? '0',
    stockQuantity:
      raw.stock_quantity === null || raw.stock_quantity === undefined
        ? null
        : Number(raw.stock_quantity),
    manageStock: Boolean(raw.manage_stock),
    type: (raw.type as string) ?? 'simple',
  };
}

function toRemoteVariation(raw: Record<string, unknown>): WooRemoteVariation {
  return {
    id: raw.id as number,
    sku: (raw.sku as string) ?? '',
    price: (raw.price as string) ?? '0',
    stockQuantity:
      raw.stock_quantity === null || raw.stock_quantity === undefined
        ? null
        : Number(raw.stock_quantity),
    manageStock: Boolean(raw.manage_stock),
  };
}

@Injectable()
export class WooRestGateway implements WooGateway {
  async testConnection(
    credential: WooCredentialInput,
  ): Promise<{ storeName?: string }> {
    const { url, headers } = buildRequest(credential, 'products', {
      per_page: 1,
    });
    const res = await fetch(url, { headers });
    await parseJsonOrThrow(res, 'test-connection');
    return {};
  }

  async listProducts(
    credential: WooCredentialInput,
    page: number,
  ): Promise<WooRemoteProduct[]> {
    const { url, headers } = buildRequest(credential, 'products', {
      per_page: 100,
      page,
    });
    const res = await fetch(url, { headers });
    const data = (await parseJsonOrThrow(res, 'listProducts')) as Record<
      string,
      unknown
    >[];
    return data.map(toRemoteProduct);
  }

  async listVariations(
    credential: WooCredentialInput,
    productId: number,
  ): Promise<WooRemoteVariation[]> {
    const { url, headers } = buildRequest(
      credential,
      `products/${productId}/variations`,
      { per_page: 100 },
    );
    const res = await fetch(url, { headers });
    const data = (await parseJsonOrThrow(res, 'listVariations')) as Record<
      string,
      unknown
    >[];
    return data.map(toRemoteVariation);
  }

  async updateStock(
    credential: WooCredentialInput,
    remoteProductId: number,
    quantity: number,
    variationId?: number,
  ): Promise<void> {
    const path = variationId
      ? `products/${remoteProductId}/variations/${variationId}`
      : `products/${remoteProductId}`;
    const { url, headers } = buildRequest(credential, path);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_quantity: quantity, manage_stock: true }),
    });
    await parseJsonOrThrow(
      res,
      `updateStock(${variationId ?? remoteProductId})`,
    );
  }
}
