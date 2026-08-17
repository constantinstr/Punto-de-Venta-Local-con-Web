import { Injectable, Logger } from '@nestjs/common';
import { withTenantContext, type TransactionClient } from '@pos/database';
import { TnQueueService } from './tn-queue.service';

// Misma forma que StockSyncEntry de WooCommerce a propósito: EcommerceSyncService
// reparte la misma lista de entradas a los dos canales sin traducir nada.
export interface TnSyncEntry {
  productId?: string | null;
  variantId?: string | null;
}

// Empuja stock y precio del POS hacia Tienda Nube.
//
// Igual que WooStockSyncService: se llama SIEMPRE después de que la
// transacción que originó el cambio ya hizo commit, y NUNCA lanza. Un fallo
// acá no puede tumbar una venta ya cobrada ni una edición ya guardada — solo
// se loguea. Es la misma decisión que está documentada en woo-stock-sync.
//
// Lo único que hace en línea es resolver ids y encolar (Redis, milisegundos):
// la llamada HTTP a Tienda Nube corre en el worker. Si se llamara al gateway
// desde acá, cada venta pagaría la latencia de su API aunque no pudiera
// fallar por eso.
@Injectable()
export class TnStockSyncService {
  private readonly logger = new Logger(TnStockSyncService.name);

  constructor(private readonly queueService: TnQueueService) {}

  async enqueueStockSync(
    tenantId: string,
    storeId: string,
    entries: TnSyncEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      await withTenantContext(tenantId, async (tx) => {
        const config = await tx.tiendanubeConfig.findFirst({
          where: { storeId, tenantId },
        });
        // Sin configuración este local no usa Tienda Nube; con el interruptor
        // apagado la integración está suspendida pero las credenciales siguen
        // guardadas (ver el hub de Configuración).
        if (!config?.isActive || !config.syncStockOutbound) return;

        for (const entry of entries) {
          const target = await this.resolveTarget(tx, tenantId, storeId, entry);
          if (!target) continue;

          const syncLog = await tx.syncLog.create({
            data: {
              tenantId,
              entityType: 'STOCK',
              direction: 'OUTBOUND_TO_TIENDANUBE',
              status: 'PENDING',
              payload: {
                configId: config.id,
                tnProductId: target.tnProductId,
                tnVariantId: target.tnVariantId,
                quantity: target.quantity,
              },
            },
          });

          await this.queueService.addStockOutbound({
            syncLogId: syncLog.id,
            tenantId,
            configId: config.id,
            tnProductId: target.tnProductId,
            tnVariantId: target.tnVariantId,
            quantity: target.quantity,
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `No se pudo encolar el sync de stock hacia Tienda Nube (tenant=${tenantId}, local=${storeId}): ${String(err)}`,
      );
    }
  }

  async enqueuePriceSync(
    tenantId: string,
    productId: string,
    price: number,
  ): Promise<void> {
    try {
      await withTenantContext(tenantId, async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: productId, tenantId },
          select: { tnProductId: true, tnVariantId: true },
        });
        // Sin vínculo remoto no hay nada que sincronizar: el producto todavía
        // no se ató a la tienda online (ver TnCatalogSyncService).
        if (!product?.tnProductId || !product.tnVariantId) return;

        // El precio no es por local (Product.price es único a nivel comercio),
        // así que hay que empujarlo a TODAS las tiendas conectadas del tenant.
        const configs = await tx.tiendanubeConfig.findMany({
          where: { tenantId, isActive: true, syncPriceOutbound: true },
        });

        for (const config of configs) {
          const syncLog = await tx.syncLog.create({
            data: {
              tenantId,
              entityType: 'PRODUCT',
              direction: 'OUTBOUND_TO_TIENDANUBE',
              status: 'PENDING',
              payload: {
                configId: config.id,
                tnProductId: product.tnProductId,
                tnVariantId: product.tnVariantId,
                price,
              },
            },
          });

          await this.queueService.addPriceOutbound({
            syncLogId: syncLog.id,
            tenantId,
            configId: config.id,
            tnProductId: product.tnProductId,
            tnVariantId: product.tnVariantId,
            price,
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `No se pudo encolar el sync de precio hacia Tienda Nube (tenant=${tenantId}, product=${productId}): ${String(err)}`,
      );
    }
  }

  private async resolveTarget(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
    entry: TnSyncEntry,
  ): Promise<{
    tnProductId: number;
    tnVariantId: number;
    quantity: number;
  } | null> {
    // Normalizados a null: en un `where` de Prisma, undefined significa "no
    // filtres por este campo", así que dejar pasar un undefined haría que la
    // fila de un producto simple matcheara con la de una variante.
    const variantId = entry.variantId ?? null;
    const productId = variantId ? null : (entry.productId ?? null);

    const ids = variantId
      ? await tx.productVariant.findFirst({
          where: { id: variantId, tenantId },
          select: { tnProductId: true, tnVariantId: true },
        })
      : await tx.product.findFirst({
          where: { id: productId ?? '', tenantId },
          select: { tnProductId: true, tnVariantId: true },
        });

    if (!ids?.tnProductId || !ids.tnVariantId) return null;

    const level = await tx.stockLevel.findFirst({
      where: { storeId, productId, variantId },
    });

    return {
      tnProductId: ids.tnProductId,
      tnVariantId: ids.tnVariantId,
      // Absoluto, no delta: el gateway manda "así queda". Si dos ajustes se
      // pisan, gana el último encolado, que es el estado real del POS.
      quantity: Number(level?.quantity ?? 0),
    };
  }
}
