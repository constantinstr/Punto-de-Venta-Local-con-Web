import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { withTenantContext } from '@pos/database';
import { verifyTnWebhookSignature } from './tn-webhook-signature.util';
import { TnQueueService } from './tn-queue.service';

// Marca de propósito, igual que en el state de OAuth: el token del webhook se
// firma con el mismo secreto que los de sesión, así que sin esta marca un
// access token cualquiera serviría como token de webhook.
export const WEBHOOK_TOKEN_PURPOSE = 'tiendanube-webhook';

export interface TnWebhookToken {
  tenantId: string;
  configId: string;
  purpose: typeof WEBHOOK_TOKEN_PURPOSE;
}

interface TnWebhookPayload {
  store_id: number | string;
  event: string;
  id: number;
}

// Solo estos eventos descuentan stock. "paid" es el equivalente real de
// processing/completed en WooCommerce: un pedido creado pero no pagado todavía
// puede no confirmarse nunca, y comprometer stock ahí genera faltantes
// fantasma. Los demás eventos se aceptan (200) y se ignoran, que es lo que
// Tienda Nube espera para no reintentar.
const STOCK_EVENTS = ['order/paid'];

// Endpoint público (sin JWT de sesión) — Tienda Nube entrega acá sus eventos.
//
// El problema que resuelve el `t` del query string: el payload de ellos trae
// su propio store_id, no el nuestro, y la firma HMAC se calcula con el secreto
// de la APLICACIÓN (el mismo para todos los comercios instalados). Ninguna de
// las dos cosas identifica al tenant. Por eso la URL que se registra en Tienda
// Nube lleva un token firmado por nosotros con tenantId + configId: es lo
// único que permite hacer la consulta bajo withTenantContext sin aflojar la
// RLS de TiendanubeConfig (a diferencia de WooCommerceConfig, que quedó sin
// RLS forzada justamente por no tener este mecanismo).
@Controller('webhooks/tiendanube')
export class TnWebhookController {
  private readonly logger = new Logger(TnWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly queueService: TnQueueService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-linkedstore-hmac-sha256') signature: string | undefined,
    @Query('t') webhookToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ received: boolean }> {
    if (!webhookToken || !req.rawBody) {
      res.status(HttpStatus.BAD_REQUEST);
      return { received: false };
    }

    const appSecret = this.config.get<string>('TIENDANUBE_CLIENT_SECRET');
    if (!appSecret) {
      this.logger.error(
        'Llegó un webhook de Tienda Nube pero falta TIENDANUBE_CLIENT_SECRET: no hay con qué verificar la firma',
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { received: false };
    }

    if (!verifyTnWebhookSignature(req.rawBody, signature, appSecret)) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { received: false };
    }

    let token: TnWebhookToken;
    try {
      token = await this.jwtService.verifyAsync<TnWebhookToken>(webhookToken);
    } catch {
      res.status(HttpStatus.UNAUTHORIZED);
      return { received: false };
    }
    if (token.purpose !== WEBHOOK_TOKEN_PURPOSE || !token.configId) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { received: false };
    }

    let payload: TnWebhookPayload;
    try {
      payload = JSON.parse(req.rawBody.toString('utf8')) as TnWebhookPayload;
    } catch {
      res.status(HttpStatus.BAD_REQUEST);
      return { received: false };
    }

    if (!STOCK_EVENTS.includes(payload.event)) {
      return { received: true };
    }

    await withTenantContext(token.tenantId, async (tx) => {
      const config = await tx.tiendanubeConfig.findFirst({
        where: { id: token.configId, tenantId: token.tenantId },
      });
      if (!config) {
        this.logger.warn(
          `Webhook de Tienda Nube para una configuración que ya no existe (config=${token.configId})`,
        );
        return;
      }

      // El token de la URL dice de qué local es; el payload dice de qué tienda
      // vino. Si no coinciden, alguien está reenviando eventos de una tienda a
      // la URL de otra — se descarta en silencio (200, para que no reintenten).
      if (String(payload.store_id) !== config.tnStoreId) {
        this.logger.warn(
          `Webhook de Tienda Nube con store_id ${payload.store_id} sobre la configuración de la tienda ${config.tnStoreId}: descartado`,
        );
        return;
      }

      if (!config.isActive || !config.syncStockInbound) return;

      const syncLog = await tx.syncLog.create({
        data: {
          tenantId: token.tenantId,
          entityType: 'ORDER',
          direction: 'INBOUND_FROM_TIENDANUBE',
          status: 'PENDING',
          payload: {
            configId: config.id,
            tnOrderId: payload.id,
            event: payload.event,
          },
        },
      });

      await this.queueService.addOrderInbound({
        syncLogId: syncLog.id,
        tenantId: token.tenantId,
        configId: config.id,
        tnOrderId: payload.id,
        event: payload.event,
      });
    });

    return { received: true };
  }
}
