import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import type {
  WooCredentialInput,
  WooGateway,
  WooRemoteProduct,
  WooRemoteVariation,
} from './woo-gateway.interface';

// Percent-encoding RFC 3986 (unreserved: A-Z a-z 0-9 - _ . ~) — encodeURIComponent
// deja sin escapar además "!*'()", que OAuth 1.0a sí exige codificar.
function rfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// OAuth 1.0a "one-legged" (sin token) — HMAC-SHA1 sobre method+url+params
// ordenados. Ver https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication
function signOAuth1(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
  consumerSecret: string,
): string {
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(params[k])}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    rfc3986Encode(baseUrl),
    rfc3986Encode(paramString),
  ].join('&');
  const signingKey = `${rfc3986Encode(consumerSecret)}&`;
  return createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// La REST API v3 de WooCommerce acepta Basic Auth (header) SOLO sobre HTTPS
// — no es una preferencia, es un requisito duro de su lado: sobre HTTP
// plano, incluso mandar consumer_key/consumer_secret sueltos por query
// string devuelve 401 "cannot_view" aunque las credenciales sean
// correctas. La única forma válida de autenticar sin HTTPS es firmar la
// request con OAuth 1.0a de una pierna (sin token), que es lo que arma
// signOAuth1 arriba — necesario para tiendas de desarrollo servidas por
// http:// (ej. un WordPress local de XAMPP).
function buildRequest(
  credential: WooCredentialInput,
  method: string,
  path: string,
  query: Record<string, string | number> = {},
): { url: string; headers: Record<string, string> } {
  const base = credential.apiUrl.replace(/\/+$/, '');
  const isHttps = base.startsWith('https://');
  const baseUrl = `${base}/wp-json/wc/v3/${path}`;
  const queryParams = Object.fromEntries(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  );

  if (isHttps) {
    const params = new URLSearchParams(queryParams);
    const url = `${baseUrl}${params.size ? `?${params}` : ''}`;
    const basic = Buffer.from(
      `${credential.consumerKey}:${credential.consumerSecret}`,
    ).toString('base64');
    return { url, headers: { Authorization: `Basic ${basic}` } };
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credential.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  const allParams = { ...queryParams, ...oauthParams };
  const oauth_signature = signOAuth1(
    method,
    baseUrl,
    allParams,
    credential.consumerSecret,
  );
  const params = new URLSearchParams({ ...allParams, oauth_signature });
  return { url: `${baseUrl}?${params}`, headers: {} };
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
    const { url, headers } = buildRequest(credential, 'GET', 'products', {
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
    const { url, headers } = buildRequest(credential, 'GET', 'products', {
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
      'GET',
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
    const { url, headers } = buildRequest(credential, 'PUT', path);
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

  async updatePrice(
    credential: WooCredentialInput,
    remoteProductId: number,
    price: number,
    variationId?: number,
  ): Promise<void> {
    const path = variationId
      ? `products/${remoteProductId}/variations/${variationId}`
      : `products/${remoteProductId}`;
    const { url, headers } = buildRequest(credential, 'PUT', path);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      // regular_price, no "price": este último es un campo calculado
      // (read-only) que WooCommerce ignora si se manda en un PUT.
      body: JSON.stringify({ regular_price: String(price) }),
    });
    await parseJsonOrThrow(
      res,
      `updatePrice(${variationId ?? remoteProductId})`,
    );
  }
}
