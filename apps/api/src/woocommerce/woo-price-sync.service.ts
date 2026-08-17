import { Injectable, Logger } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import { WooQueueService } from './woo-queue.service';
import { SyncLogService } from './sync-log.service';

// Punto de entrada único para que ProductsService (precio editado) dispare
// la sincronización saliente de precio hacia WooCommerce — mismo patrón que
// WooStockSyncService, pero el precio no es por-local (Product.price es
// único a nivel tenant, no hay StockLevel de por medio), así que en vez de
// resolver una sola WooCommerceConfig por storeId, se sincroniza contra
// TODAS las configs activas del tenant con syncPriceOutbound=true a las que
// el producto esté vinculado (wooProductId). En la práctica casi siempre es
// una sola (un tenant con más de una tienda WooCommerce conectada al mismo
// producto es un caso raro, pero no lo asumimos).
//
// Se llama SIEMPRE después de que la transacción que originó el cambio de
// precio ya hizo commit — mismo motivo que WooStockSyncService.
//
// Nunca lanza: un fallo acá no debe tumbar una edición de catálogo ya
// guardada — solo se loggea.
@Injectable()
export class WooPriceSyncService {
  private readonly logger = new Logger(WooPriceSyncService.name);

  constructor(
    private readonly queueService: WooQueueService,
    private readonly syncLogService: SyncLogService,
  ) {}

  async enqueuePriceSync(
    tenantId: string,
    productId: string,
    price: number,
  ): Promise<void> {
    try {
      await withTenantContext(tenantId, async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: productId, tenantId },
        });
        if (!product?.wooProductId) return; // no vinculado a WooCommerce

        const configs = await tx.wooCommerceConfig.findMany({
          where: { tenantId, isActive: true, syncPriceOutbound: true },
        });

        for (const config of configs) {
          const syncLog = await this.syncLogService.create(
            tx,
            tenantId,
            'PRODUCT',
            'OUTBOUND_TO_WOO',
            {
              configId: config.id,
              wooProductId: product.wooProductId,
              price,
            },
          );

          await this.queueService.addPriceOutbound({
            syncLogId: syncLog.id,
            tenantId,
            configId: config.id,
            wooProductId: product.wooProductId,
            price,
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `No se pudo encolar la sincronización de precio hacia WooCommerce (tenant=${tenantId}, product=${productId}): ${String(err)}`,
      );
    }
  }
}
