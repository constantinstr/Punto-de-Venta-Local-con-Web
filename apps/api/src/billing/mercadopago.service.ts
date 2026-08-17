import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MP_API_BASE = 'https://api.mercadopago.com';
// Estas llamadas ocurren dentro del handler de un webhook: si MP tarda, hay
// que cortar y dejar que reintente, no colgar el request.
const REQUEST_TIMEOUT_MS = 10_000;

// Estados posibles de un preapproval (suscripción) en Mercado Pago.
export type MpPreapprovalStatus =
  'pending' | 'authorized' | 'paused' | 'cancelled';

export interface MpPreapproval {
  id: string;
  status: MpPreapprovalStatus;
  external_reference?: string;
  payer_email?: string;
  reason?: string;
  next_payment_date?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
  init_point?: string;
}

export interface MpAuthorizedPayment {
  id: number | string;
  preapproval_id?: string;
  status?: string;
  transaction_amount?: number;
  payment?: { id?: number | string; status?: string };
  external_reference?: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('MP_ACCESS_TOKEN'));
  }

  // Crea la suscripción y devuelve el init_point: la URL de Mercado Pago
  // donde el comercio adhiere su tarjeta. Nosotros nunca vemos ni tocamos
  // datos de tarjeta — por eso no hay nada que cumplir de PCI de nuestro lado.
  async createPreapproval(params: {
    tenantId: string;
    payerEmail: string;
    reason: string;
    amount: number;
    backUrl: string;
  }): Promise<MpPreapproval> {
    return this.request<MpPreapproval>('POST', '/preapproval', {
      reason: params.reason,
      // external_reference es el hilo que ata la suscripción de MP con
      // nuestro tenant: los webhooks lo devuelven y así sabemos a quién
      // aplicarle el pago sin depender de un mapa aparte.
      external_reference: params.tenantId,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: params.amount,
        currency_id: 'ARS',
      },
    });
  }

  getPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>('GET', `/preapproval/${id}`);
  }

  getAuthorizedPayment(id: string): Promise<MpAuthorizedPayment> {
    return this.request<MpAuthorizedPayment>(
      'GET',
      `/authorized_payments/${id}`,
    );
  }

  cancelPreapproval(id: string): Promise<MpPreapproval> {
    return this.request<MpPreapproval>('PUT', `/preapproval/${id}`, {
      status: 'cancelled',
    });
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = this.config.get<string>('MP_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'Mercado Pago no está configurado en el servidor (falta MP_ACCESS_TOKEN)',
      );
    }

    let res: Response;
    try {
      res = await fetch(`${MP_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(
        `Mercado Pago inalcanzable (${method} ${path}): ${String(err)}`,
      );
      throw new BadGatewayException('No se pudo contactar a Mercado Pago');
    }

    const text = await res.text();
    if (!res.ok) {
      // El token nunca se loguea; el body de MP sí, que trae el motivo real.
      this.logger.error(
        `Mercado Pago respondió ${res.status} en ${method} ${path}: ${text.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        `Mercado Pago rechazó la operación (HTTP ${res.status})`,
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException(
        'Mercado Pago devolvió una respuesta ilegible',
      );
    }
  }
}
