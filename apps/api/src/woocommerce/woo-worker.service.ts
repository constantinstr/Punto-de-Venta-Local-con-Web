import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { withTenantContext, type TransactionClient } from '@pos/database';
import { getRedisConnection } from '../redis/redis-connection';
import { WOO_GATEWAY, type WooGateway } from './woo-gateway.interface';
import {
  getWooQueueName,
  type OrderInboundJobData,
  type PriceOutboundJobData,
  type StockOutboundJobData,
  type WooJobData,
} from './woo-queue.service';

@Injectable()
export class WooWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WooWorkerService.name);
  private worker: Worker<WooJobData> | undefined;

  constructor(
    @Inject(WOO_GATEWAY) private readonly gateway: WooGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const ratePerSec = Number(this.config.get('WOO_RATE_LIMIT_PER_SEC') ?? 5);

    this.worker = new Worker<WooJobData>(
      getWooQueueName(),
      (job) => this.process(job),
      {
        connection: getRedisConnection(),
        concurrency: 5,
        limiter: { max: ratePerSec, duration: 1000 },
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id} (${job?.name}) falló definitivamente tras ${job?.attemptsMade} intento(s): ${err.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private process(job: Job<WooJobData>): Promise<void> {
    if (job.name === 'stock-outbound') {
      return this.processStockOutbound(job.data as StockOutboundJobData);
    }
    if (job.name === 'price-outbound') {
      return this.processPriceOutbound(job.data as PriceOutboundJobData);
    }
    if (job.name === 'order-inbound') {
      return this.processOrderInbound(job.data as OrderInboundJobData);
    }
    this.logger.warn(`Job de tipo desconocido: ${job.name}`);
    return Promise.resolve();
  }

  // Carga config y guarda el resultado en transacciones cortas separadas —
  // el fetch() a WooCommerce en medio (processStockOutbound/
  // processPriceOutbound) puede tardar más que el timeout por defecto de
  // una transacción interactiva de Prisma (5s), sobre todo contra hostings
  // compartidos lentos. Envolver todo el flujo en una sola transacción
  // (como estaba antes) hacía que Prisma la cerrara sola a mitad de camino
  // y que el propio manejo de errores fallara en cascada al intentar
  // actualizar el SyncLog sobre una transacción ya expirada.
  private markSyncLog(
    tenantId: string,
    syncLogId: string,
    status: 'SUCCESS' | 'FAILED',
    errorMessage: string | null,
  ) {
    return withTenantContext(tenantId, (tx) =>
      tx.syncLog.update({
        where: { id: syncLogId },
        data: { status, errorMessage },
      }),
    );
  }

  private async processStockOutbound(
    data: StockOutboundJobData,
  ): Promise<void> {
    const config = await withTenantContext(data.tenantId, (tx) =>
      tx.wooCommerceConfig.findFirst({
        where: { id: data.configId, tenantId: data.tenantId },
      }),
    );
    if (!config || !config.isActive) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        'La integración de WooCommerce ya no está activa',
      );
      return;
    }

    try {
      await this.gateway.updateStock(
        {
          apiUrl: config.apiUrl,
          consumerKey: config.consumerKey,
          consumerSecret: config.consumerSecret,
        },
        data.wooProductId,
        data.quantity,
        data.wooVariantId,
      );
      await this.markSyncLog(data.tenantId, data.syncLogId, 'SUCCESS', null);
    } catch (err) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        String(err),
      );
      throw err; // deja que BullMQ reintente (attempts/backoff en la queue)
    }
  }

  private async processPriceOutbound(
    data: PriceOutboundJobData,
  ): Promise<void> {
    const config = await withTenantContext(data.tenantId, (tx) =>
      tx.wooCommerceConfig.findFirst({
        where: { id: data.configId, tenantId: data.tenantId },
      }),
    );
    if (!config || !config.isActive) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        'La integración de WooCommerce ya no está activa',
      );
      return;
    }

    try {
      await this.gateway.updatePrice(
        {
          apiUrl: config.apiUrl,
          consumerKey: config.consumerKey,
          consumerSecret: config.consumerSecret,
        },
        data.wooProductId,
        data.price,
        data.wooVariantId,
      );
      await this.markSyncLog(data.tenantId, data.syncLogId, 'SUCCESS', null);
    } catch (err) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        String(err),
      );
      throw err; // deja que BullMQ reintente (attempts/backoff en la queue)
    }
  }

  private async processOrderInbound(data: OrderInboundJobData): Promise<void> {
    await withTenantContext(data.tenantId, async (tx) => {
      const dup = await tx.syncLog.findFirst({
        where: {
          tenantId: data.tenantId,
          entityType: 'ORDER',
          direction: 'INBOUND_FROM_WOO',
          status: 'SUCCESS',
          id: { not: data.syncLogId },
          payload: { path: ['wooOrderId'], equals: data.wcOrder.id },
        },
      });
      if (dup) {
        await tx.syncLog.update({
          where: { id: data.syncLogId },
          data: {
            status: 'SUCCESS',
            errorMessage:
              'Duplicado (idempotente): esta orden de WooCommerce ya fue procesada',
          },
        });
        return;
      }

      const config = await tx.wooCommerceConfig.findFirst({
        where: { id: data.configId, tenantId: data.tenantId },
      });
      if (!config) {
        await tx.syncLog.update({
          where: { id: data.syncLogId },
          data: {
            status: 'FAILED',
            errorMessage: 'La integración de WooCommerce ya no existe',
          },
        });
        return;
      }

      const unmatched: WcOrderLineItemSummary[] = [];
      for (const li of data.wcOrder.line_items) {
        const isVariation = Boolean(li.variation_id);
        const product = isVariation
          ? await tx.productVariant.findFirst({
              where: { tenantId: data.tenantId, wooVariantId: li.variation_id },
            })
          : await tx.product.findFirst({
              where: { tenantId: data.tenantId, wooProductId: li.product_id },
            });

        if (!product) {
          unmatched.push({
            productId: li.product_id,
            variationId: li.variation_id || undefined,
            sku: li.sku,
          });
          continue;
        }

        await this.decrementAllowingNegative(
          tx,
          data.tenantId,
          config.storeId,
          isVariation ? null : product.id,
          isVariation ? product.id : null,
          li.quantity,
        );
      }

      if (unmatched.length > 0) {
        this.logger.warn(
          `Orden WooCommerce ${data.wcOrder.id}: ${unmatched.length} línea(s) sin producto vinculado (wooProductId/wooVariantId) — no se descontó stock para esas líneas`,
        );
      }

      await tx.syncLog.update({
        where: { id: data.syncLogId },
        data: {
          status: 'SUCCESS',
          errorMessage:
            unmatched.length > 0
              ? `${unmatched.length} línea(s) sin producto vinculado en el POS`
              : null,
        },
      });
    });
  }

  // A diferencia del descuento de stock de una venta de mostrador (que
  // rechaza la venta si no alcanza el stock), una orden web ya fue pagada
  // en WooCommerce — no hay forma de "rechazarla" acá. Se descuenta aunque
  // quede en negativo (sobreventa real que hay que resolver operativamente)
  // en vez de fallar en silencio o dejar el stock físico desincronizado.
  private async decrementAllowingNegative(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
    productId: string | null,
    variantId: string | null,
    quantity: number,
  ): Promise<void> {
    const affected = await tx.$executeRaw`
      UPDATE "StockLevel"
      SET quantity = quantity - ${quantity}, "updatedAt" = now()
      WHERE "storeId" = ${storeId}
        AND "productId" IS NOT DISTINCT FROM ${productId}
        AND "variantId" IS NOT DISTINCT FROM ${variantId}
    `;
    if (affected === 0) {
      await tx.stockLevel.create({
        data: {
          tenantId,
          storeId,
          productId,
          variantId,
          quantity: -quantity,
        },
      });
    }
  }
}

interface WcOrderLineItemSummary {
  productId: number;
  variationId?: number;
  sku?: string;
}
