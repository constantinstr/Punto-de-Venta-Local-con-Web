import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TiendanubeGateway,
  TnCredentialInput,
  TnRemoteOrder,
  TnRemoteProduct,
  TnRemoteWebhook,
} from './tiendanube-gateway.interface';

const API_BASE = 'https://api.tiendanube.com/v1';
const TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token';
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 50;

// Tienda Nube EXIGE un User-Agent identificable con un mail de contacto; si
// falta, rechazan las llamadas. Se arma con APP_PUBLIC_URL para que cada
// despliegue se identifique solo.
function userAgent(config: ConfigService): string {
  const contact =
    config.get<string>('TIENDANUBE_CONTACT_EMAIL') ?? 'soporte@possaas.local';
  return `POS SaaS (${contact})`;
}

interface TnTokenResponse {
  access_token: string;
  user_id: number | string;
  scope: string;
}

interface TnVariantJson {
  id: number;
  sku: string | null;
  price: string | null;
  stock: number | null;
  stock_management?: boolean;
}

interface TnProductJson {
  id: number;
  name: Record<string, string> | string;
  variants: TnVariantJson[];
}

interface TnOrderJson {
  id: number;
  number: number;
  status: string;
  products: {
    variant_id: number;
    sku: string | null;
    quantity: number;
    price: string;
  }[];
}

@Injectable()
export class TnRestGateway implements TiendanubeGateway {
  private readonly logger = new Logger(TnRestGateway.name);

  constructor(private readonly config: ConfigService) {}

  // El token de Tienda Nube no vence: se canjea una sola vez, cuando el
  // comercio instala la app. Solo se invalida si la desinstala.
  async exchangeCode(code: string) {
    const clientId = this.config.get<string>('TIENDANUBE_CLIENT_ID');
    const clientSecret = this.config.get<string>('TIENDANUBE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadGatewayException(
        'Tienda Nube no está configurado en el servidor (faltan TIENDANUBE_CLIENT_ID / TIENDANUBE_CLIENT_SECRET)',
      );
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.error(
        `Tienda Nube rechazó el canje del código: ${res.status} ${text.slice(0, 300)}`,
      );
      throw new BadGatewayException('Tienda Nube rechazó la autorización');
    }

    const json = JSON.parse(text) as TnTokenResponse;
    return {
      accessToken: json.access_token,
      tnStoreId: String(json.user_id),
      scopes: json.scope,
    };
  }

  async testConnection(credential: TnCredentialInput) {
    const store = await this.request<{
      name?: Record<string, string> | string;
    }>(credential, 'GET', '/store');
    return { storeName: pickText(store.name) };
  }

  async listProducts(
    credential: TnCredentialInput,
    page: number,
  ): Promise<TnRemoteProduct[]> {
    const products = await this.request<TnProductJson[]>(
      credential,
      'GET',
      `/products?page=${page}&per_page=${PAGE_SIZE}`,
    );
    return products.map((p) => ({
      id: p.id,
      name: pickText(p.name) ?? String(p.id),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: v.price,
        stock: v.stock,
        // stock === null significa "no controla stock" en su modelo.
        managesStock: v.stock_management ?? v.stock !== null,
      })),
    }));
  }

  async updateStock(
    credential: TnCredentialInput,
    productId: number,
    variantId: number,
    quantity: number,
  ): Promise<void> {
    await this.request(
      credential,
      'PUT',
      `/products/${productId}/variants/${variantId}`,
      { stock: quantity },
    );
  }

  async updatePrice(
    credential: TnCredentialInput,
    productId: number,
    variantId: number,
    price: number,
  ): Promise<void> {
    await this.request(
      credential,
      'PUT',
      `/products/${productId}/variants/${variantId}`,
      { price: price.toFixed(2) },
    );
  }

  async getOrder(
    credential: TnCredentialInput,
    orderId: number,
  ): Promise<TnRemoteOrder> {
    const order = await this.request<TnOrderJson>(
      credential,
      'GET',
      `/orders/${orderId}`,
    );
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      items: order.products.map((p) => ({
        variantId: p.variant_id,
        sku: p.sku,
        quantity: p.quantity,
        price: p.price,
      })),
    };
  }

  async listWebhooks(
    credential: TnCredentialInput,
  ): Promise<TnRemoteWebhook[]> {
    return this.request<TnRemoteWebhook[]>(credential, 'GET', '/webhooks');
  }

  async createWebhook(
    credential: TnCredentialInput,
    event: string,
    url: string,
  ): Promise<TnRemoteWebhook> {
    return this.request<TnRemoteWebhook>(credential, 'POST', '/webhooks', {
      event,
      url,
    });
  }

  async deleteWebhook(
    credential: TnCredentialInput,
    id: number,
  ): Promise<void> {
    await this.request(credential, 'DELETE', `/webhooks/${id}`);
  }

  private async request<T>(
    credential: TnCredentialInput,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${API_BASE}/${credential.tnStoreId}${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          // Es "Authentication", no "Authorization": Tienda Nube se aparta
          // del estándar acá y con el header habitual devuelve 401.
          Authentication: `bearer ${credential.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': userAgent(this.config),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(
        `Tienda Nube inalcanzable (${method} ${path}): ${String(err)}`,
      );
      throw new BadGatewayException('No se pudo contactar a Tienda Nube');
    }

    const text = await res.text();
    if (!res.ok) {
      // El token nunca se loguea.
      this.logger.error(
        `Tienda Nube respondió ${res.status} en ${method} ${path}: ${text.slice(0, 300)}`,
      );
      throw new BadGatewayException(
        `Tienda Nube rechazó la operación (HTTP ${res.status})`,
      );
    }

    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException(
        'Tienda Nube devolvió una respuesta ilegible',
      );
    }
  }
}

// Los textos de Tienda Nube vienen como objeto multi-idioma ({ es: "...", pt:
// "..." }) o como string pelado según el recurso. Se prefiere español y se cae
// al primer idioma disponible.
function pickText(
  value: Record<string, string> | string | undefined,
): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.es ?? Object.values(value)[0];
}
