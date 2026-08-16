import { Injectable, Logger } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import { WooQueueService } from './woo-queue.service';
import { SyncLogService } from './sync-log.service';

export interface StockSyncEntry {
  productId?: string | null;
  variantId?: string | null;
}

// Punto de entrada único para que OrdersService (venta completada) y
// StockService (ajuste manual) disparen la sincronización saliente hacia
// WooCommerce, sin acoplarse a los detalles de BullMQ/WooCommerceConfig.
//
// Se llama SIEMPRE después de que la transacción que originó el cambio de
// stock ya hizo commit — encolar un job dentro de esa misma transacción
// arriesgaría encolar sincronización para datos que después hacen
// rollback (BullMQ/Redis no participa de la transacción de Postgres).
//
// Nunca lanza: un fallo acá (Woo inactivo, Redis caído, etc.) no debe
// tumbar una venta de mostrador ya confirmada — solo se loggea.
@Injectable()
export class WooStockSyncService {
  private readonly logger = new Logger(WooStockSyncService.name);

  constructor(
    private readonly queueService: WooQueueService,
    private readonly syncLogService: SyncLogService,
  ) {}

  async enqueueStockSync(
    tenantId: string,
    storeId: string,
    entries: StockSyncEntry[],
  ): Promise<void> {
    try {
      await withTenantContext(tenantId, async (tx) => {
        const config = await tx.wooCommerceConfig.findFirst({
          where: { tenantId, storeId },
        });
        if (!config || !config.isActive || !config.syncStockOutbound) return;

        for (const entry of entries) {
          let wooProductId: number | null;
          let wooVariantId: number | undefined;

          if (entry.variantId) {
            const variant = await tx.productVariant.findFirst({
              where: { id: entry.variantId, tenantId },
              include: { product: true },
            });
            wooProductId = variant?.product.wooProductId ?? null;
            wooVariantId = variant?.wooVariantId ?? undefined;
            if (!wooVariantId) continue; // variante no vinculada a Woo
          } else if (entry.productId) {
            const product = await tx.product.findFirst({
              where: { id: entry.productId, tenantId },
            });
            wooProductId = product?.wooProductId ?? null;
          } else {
            continue;
          }

          if (!wooProductId) continue; // no vinculado a WooCommerce

          const level = await tx.stockLevel.findFirst({
            where: {
              storeId,
              productId: entry.variantId ? null : (entry.productId ?? null),
              variantId: entry.variantId ?? null,
            },
          });
          // WooCommerce no espera stock negativo; un negativo local (venta
          // web que sobrevendió, ver woo-worker.service.ts) se reporta como 0.
          const quantity = Math.max(0, Number(level?.quantity ?? 0));

          const syncLog = await this.syncLogService.create(
            tx,
            tenantId,
            'STOCK',
            'OUTBOUND_TO_WOO',
            {
              configId: config.id,
              wooProductId,
              wooVariantId: wooVariantId ?? null,
              quantity,
            },
          );

          await this.queueService.addStockOutbound({
            syncLogId: syncLog.id,
            tenantId,
            configId: config.id,
            wooProductId,
            wooVariantId,
            quantity,
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `No se pudo encolar la sincronización de stock hacia WooCommerce (tenant=${tenantId}, store=${storeId}): ${String(err)}`,
      );
    }
  }
}
