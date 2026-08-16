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
import type { Request, Response } from 'express';
import { withTenantContext } from '@pos/database';
import { verifyWooWebhookSignature } from './webhook-signature.util';
import { WooConfigService } from './woo-config.service';
import { WooQueueService, type WcOrderLineItem } from './woo-queue.service';
import { SyncLogService } from './sync-log.service';

interface WcOrderPayload {
  id: number;
  status: string;
  line_items?: WcOrderLineItem[];
}

// Endpoint público (sin JWT) — WooCommerce entrega acá los eventos de
// order.created/order.updated. `configId` en el query string identifica
// qué WooCommerceConfig (y por lo tanto qué tenant/local) corresponde: es
// la URL exacta que se muestra en el panel de integración para pegar en
// WooCommerce → Configuración → Avanzado → Webhooks.
@Controller('webhooks/woocommerce')
export class WooWebhookController {
  private readonly logger = new Logger(WooWebhookController.name);

  constructor(
    private readonly wooConfigService: WooConfigService,
    private readonly queueService: WooQueueService,
    private readonly syncLogService: SyncLogService,
  ) {}

  @Post('orders')
  @HttpCode(HttpStatus.OK)
  async handleOrderWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wc-webhook-signature') signature: string | undefined,
    @Query('configId') configId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ received: boolean }> {
    if (!configId || !req.rawBody) {
      res.status(HttpStatus.BAD_REQUEST);
      return { received: false };
    }

    const config = await this.wooConfigService.findRawById(configId);
    if (!config) {
      res.status(HttpStatus.NOT_FOUND);
      return { received: false };
    }

    if (
      !verifyWooWebhookSignature(req.rawBody, signature, config.webhookSecret)
    ) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { received: false };
    }

    if (!config.isActive || !config.syncStockInbound) {
      return { received: true };
    }

    let wcOrder: WcOrderPayload;
    try {
      wcOrder = JSON.parse(req.rawBody.toString('utf8')) as WcOrderPayload;
    } catch {
      res.status(HttpStatus.BAD_REQUEST);
      return { received: false };
    }

    // Solo interesan pedidos ya pagados/en curso — un pedido "pending" o
    // "on-hold" todavía puede no confirmarse nunca, no hay stock que
    // comprometer todavía.
    if (!['processing', 'completed'].includes(wcOrder.status)) {
      return { received: true };
    }

    await withTenantContext(config.tenantId, async (tx) => {
      const syncLog = await this.syncLogService.create(
        tx,
        config.tenantId,
        'ORDER',
        'INBOUND_FROM_WOO',
        {
          configId: config.id,
          wooOrderId: wcOrder.id,
          status: wcOrder.status,
          lineItems: (wcOrder.line_items ?? []).map((li) => ({
            product_id: li.product_id,
            variation_id: li.variation_id,
            quantity: li.quantity,
            sku: li.sku,
          })),
        },
      );

      await this.queueService.addOrderInbound({
        syncLogId: syncLog.id,
        tenantId: config.tenantId,
        configId: config.id,
        wcOrder: {
          id: wcOrder.id,
          status: wcOrder.status,
          line_items: wcOrder.line_items ?? [],
        },
      });
    });

    return { received: true };
  }
}
