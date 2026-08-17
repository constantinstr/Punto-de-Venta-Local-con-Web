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
import {
  TIENDANUBE_GATEWAY,
  type TiendanubeGateway,
  type TnCredentialInput,
  type TnRemoteOrder,
} from './tiendanube-gateway.interface';
import { TnConfigService } from './tn-config.service';
import {
  getTnQueueName,
  type TnJobData,
  type TnOrderInboundJobData,
  type TnPriceOutboundJobData,
  type TnStockOutboundJobData,
} from './tn-queue.service';

@Injectable()
export class TnWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TnWorkerService.name);
  private worker: Worker<TnJobData> | undefined;

  constructor(
    @Inject(TIENDANUBE_GATEWAY) private readonly gateway: TiendanubeGateway,
    private readonly tnConfigService: TnConfigService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Tienda Nube documenta un límite por tienda; 2/s por defecto deja margen
    // holgado y es configurable si un comercio grande lo necesita.
    const ratePerSec = Number(
      this.config.get('TIENDANUBE_RATE_LIMIT_PER_SEC') ?? 2,
    );

    this.worker = new Worker<TnJobData>(
      getTnQueueName(),
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

  private process(job: Job<TnJobData>): Promise<void> {
    if (job.name === 'stock-outbound') {
      return this.processStockOutbound(job.data as TnStockOutboundJobData);
    }
    if (job.name === 'price-outbound') {
      return this.processPriceOutbound(job.data as TnPriceOutboundJobData);
    }
    if (job.name === 'order-inbound') {
      return this.processOrderInbound(job.data as TnOrderInboundJobData);
    }
    this.logger.warn(`Job de tipo desconocido: ${job.name}`);
    return Promise.resolve();
  }

  // Cargar la configuración, llamar a Tienda Nube y guardar el resultado van
  // en pasos separados a propósito: el fetch() del medio puede tardar más que
  // el timeout de una transacción interactiva de Prisma (5s), y envolverlo
  // todo haría que la propia actualización del SyncLog fallara en cascada
  // sobre una transacción ya expirada. Es el mismo bug que ya se corrigió en
  // WooWorkerService.
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

  // Resuelve credenciales verificando además que la integración siga activa:
  // entre que el job se encoló y se ejecuta, el comercio pudo apagar el
  // interruptor.
  private async resolveActive(
    tenantId: string,
    configId: string,
    syncLogId: string,
  ): Promise<{ credential: TnCredentialInput; storeId: string } | null> {
    const config = await withTenantContext(tenantId, (tx) =>
      tx.tiendanubeConfig.findFirst({ where: { id: configId, tenantId } }),
    );
    if (!config || !config.isActive) {
      await this.markSyncLog(
        tenantId,
        syncLogId,
        'FAILED',
        'La integración de Tienda Nube ya no está activa',
      );
      return null;
    }

    const resolved = await this.tnConfigService.getCredential(
      tenantId,
      config.storeId,
    );
    if (!resolved) {
      await this.markSyncLog(
        tenantId,
        syncLogId,
        'FAILED',
        'No se pudieron leer las credenciales de Tienda Nube',
      );
      return null;
    }

    return { credential: resolved.credential, storeId: config.storeId };
  }

  private async processStockOutbound(
    data: TnStockOutboundJobData,
  ): Promise<void> {
    const active = await this.resolveActive(
      data.tenantId,
      data.configId,
      data.syncLogId,
    );
    if (!active) return;

    try {
      await this.gateway.updateStock(
        active.credential,
        data.tnProductId,
        data.tnVariantId,
        data.quantity,
      );
      await this.markSyncLog(data.tenantId, data.syncLogId, 'SUCCESS', null);
    } catch (err) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        String(err),
      );
      throw err; // deja que BullMQ reintente (attempts/backoff en la cola)
    }
  }

  private async processPriceOutbound(
    data: TnPriceOutboundJobData,
  ): Promise<void> {
    const active = await this.resolveActive(
      data.tenantId,
      data.configId,
      data.syncLogId,
    );
    if (!active) return;

    try {
      await this.gateway.updatePrice(
        active.credential,
        data.tnProductId,
        data.tnVariantId,
        data.price,
      );
      await this.markSyncLog(data.tenantId, data.syncLogId, 'SUCCESS', null);
    } catch (err) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        String(err),
      );
      throw err;
    }
  }

  // El webhook de Tienda Nube trae solo `{ store_id, event, id }`: las líneas
  // del pedido hay que ir a buscarlas. Por eso este job hace primero una
  // llamada de red y recién después toca la base.
  private async processOrderInbound(
    data: TnOrderInboundJobData,
  ): Promise<void> {
    // Idempotencia antes de gastar una llamada a su API: Tienda Nube reintenta
    // los webhooks que no contesten 2xx, y order/paid puede llegar repetido.
    const alreadyDone = await withTenantContext(data.tenantId, (tx) =>
      tx.syncLog.findFirst({
        where: {
          tenantId: data.tenantId,
          entityType: 'ORDER',
          direction: 'INBOUND_FROM_TIENDANUBE',
          status: 'SUCCESS',
          id: { not: data.syncLogId },
          payload: { path: ['tnOrderId'], equals: data.tnOrderId },
        },
      }),
    );
    if (alreadyDone) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'SUCCESS',
        'Duplicado (idempotente): este pedido de Tienda Nube ya fue procesado',
      );
      return;
    }

    const active = await this.resolveActive(
      data.tenantId,
      data.configId,
      data.syncLogId,
    );
    if (!active) return;

    let order: TnRemoteOrder;
    try {
      order = await this.gateway.getOrder(active.credential, data.tnOrderId);
    } catch (err) {
      await this.markSyncLog(
        data.tenantId,
        data.syncLogId,
        'FAILED',
        `No se pudo leer el pedido en Tienda Nube: ${String(err)}`,
      );
      throw err;
    }

    const unmatched: number[] = [];
    await withTenantContext(data.tenantId, async (tx) => {
      for (const item of order.items) {
        // El vínculo primario es el id de variante remoto (lo tienen todos los
        // productos de Tienda Nube, incluso los "simples"); el SKU es el
        // respaldo para catálogos vinculados a mano.
        const variant = await tx.productVariant.findFirst({
          where: { tenantId: data.tenantId, tnVariantId: item.variantId },
        });
        const product = variant
          ? null
          : await tx.product.findFirst({
              where: { tenantId: data.tenantId, tnVariantId: item.variantId },
            });

        if (!variant && !product) {
          unmatched.push(item.variantId);
          continue;
        }

        await this.decrementAllowingNegative(
          tx,
          data.tenantId,
          active.storeId,
          product ? product.id : null,
          variant ? variant.id : null,
          item.quantity,
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

    if (unmatched.length > 0) {
      this.logger.warn(
        `Pedido de Tienda Nube ${data.tnOrderId}: ${unmatched.length} línea(s) sin producto vinculado (tnVariantId) — no se descontó stock para esas líneas`,
      );
    }
  }

  // Igual que en WooCommerce: el pedido web YA se pagó del otro lado, no hay
  // forma de rechazarlo acá. Se descuenta aunque quede negativo (sobreventa
  // real, que se resuelve operativamente) en vez de fallar en silencio y dejar
  // el stock desincronizado.
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
        data: { tenantId, storeId, productId, variantId, quantity: -quantity },
      });
    }
  }
}
