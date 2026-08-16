import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  type TransactionClient,
} from '@pos/database';
import { WOO_GATEWAY, type WooGateway } from './woo-gateway.interface';
import { WooConfigService } from './woo-config.service';
import { SyncLogService } from './sync-log.service';

export interface CatalogSyncSummary {
  scanned: number;
  matched: number;
  created: number;
  skipped: number;
  errors: number;
}

const MAX_PAGES = 50; // 100/página -> hasta 5000 productos por corrida

@Injectable()
export class WooCatalogSyncService {
  private readonly logger = new Logger(WooCatalogSyncService.name);

  constructor(
    @Inject(WOO_GATEWAY) private readonly gateway: WooGateway,
    private readonly wooConfigService: WooConfigService,
    private readonly syncLogService: SyncLogService,
  ) {}

  async syncCatalog(
    tenantId: string,
    storeId: string,
  ): Promise<CatalogSyncSummary> {
    const config = await this.wooConfigService.getCredentialForStore(
      tenantId,
      storeId,
    );
    const credential = {
      apiUrl: config.apiUrl,
      consumerKey: config.consumerKey,
      consumerSecret: config.consumerSecret,
    };

    const summary: CatalogSyncSummary = {
      scanned: 0,
      matched: 0,
      created: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const products = await this.gateway.listProducts(credential, page);
        if (products.length === 0) break;

        for (const remote of products) {
          summary.scanned++;
          try {
            await withTenantContext(tenantId, async (tx) => {
              if (remote.type === 'variable') {
                await this.syncVariableProduct(
                  tx,
                  tenantId,
                  credential,
                  remote,
                  summary,
                );
              } else {
                await this.syncSimpleProduct(tx, tenantId, remote, summary);
              }
            });
          } catch (err) {
            summary.errors++;
            this.logger.error(
              `Error sincronizando producto Woo #${remote.id} (${remote.sku}): ${String(err)}`,
            );
          }
        }
      }

      await this.wooConfigService.touchLastSync(tenantId, config.id);
      await withTenantContext(tenantId, (tx) =>
        this.syncLogService.create(
          tx,
          tenantId,
          'PRODUCT',
          'INBOUND_FROM_WOO',
          summary as unknown as Prisma.InputJsonValue,
        ),
      ).then((log) => this.syncLogService.markSuccess(tenantId, log.id));

      return summary;
    } catch (err) {
      await withTenantContext(tenantId, (tx) =>
        this.syncLogService.create(
          tx,
          tenantId,
          'PRODUCT',
          'INBOUND_FROM_WOO',
          summary as unknown as Prisma.InputJsonValue,
        ),
      ).then((log) =>
        this.syncLogService.markFailed(tenantId, log.id, String(err)),
      );
      throw err;
    }
  }

  // Empareja por SKU exacto contra sku O barcode local: muchas tiendas
  // chicas usan el campo "SKU" de WooCommerce para guardar lo que en el
  // POS es efectivamente el código de barras (WooCommerce no trae un campo
  // "barcode" propio en su REST API estándar).
  private async findLocalMatch(
    tx: TransactionClient,
    tenantId: string,
    sku: string,
  ) {
    if (!sku) return null;
    return tx.product.findFirst({
      where: { tenantId, OR: [{ sku }, { barcode: sku }] },
    });
  }

  private async syncSimpleProduct(
    tx: TransactionClient,
    tenantId: string,
    remote: { id: number; sku: string; name: string; price: string },
    summary: CatalogSyncSummary,
  ): Promise<void> {
    const match = await this.findLocalMatch(tx, tenantId, remote.sku);
    if (match) {
      await tx.product.update({
        where: { id: match.id },
        data: {
          wooProductId: remote.id,
          wooSyncStatus: 'SYNCED',
          wooLastSyncAt: new Date(),
        },
      });
      summary.matched++;
      return;
    }

    const sku = remote.sku || `woo-${remote.id}`;
    await tx.product.create({
      data: {
        tenantId,
        sku,
        name: remote.name || sku,
        type: 'SIMPLE',
        costPrice: 0,
        price: Number(remote.price) || 0,
        vatCondition: 'IVA_21',
        trackStock: true,
        wooProductId: remote.id,
        wooSyncStatus: 'SYNCED',
        wooLastSyncAt: new Date(),
      },
    });
    summary.created++;
  }

  // Los productos VARIABLE solo se emparejan si ya existen en el POS con la
  // misma estructura — auto-crear un producto variable + todas sus
  // variantes/atributos desde cero queda fuera de alcance de este sprint
  // (Sprint 7 solo pide "emparejar o importar como nuevo"; importar la
  // estructura completa de un variable es una función mayor aparte).
  private async syncVariableProduct(
    tx: TransactionClient,
    tenantId: string,
    credential: { apiUrl: string; consumerKey: string; consumerSecret: string },
    remote: { id: number; sku: string; name: string },
    summary: CatalogSyncSummary,
  ): Promise<void> {
    const match = await this.findLocalMatch(tx, tenantId, remote.sku);
    if (!match) {
      summary.skipped++;
      return;
    }

    await tx.product.update({
      where: { id: match.id },
      data: {
        wooProductId: remote.id,
        wooSyncStatus: 'SYNCED',
        wooLastSyncAt: new Date(),
      },
    });
    summary.matched++;

    const variations = await this.gateway
      .listVariations(credential, remote.id)
      .catch(() => []);

    const localVariants = await tx.productVariant.findMany({
      where: { productId: match.id, tenantId },
    });

    for (const variation of variations) {
      const localVariant = localVariants.find(
        (v) => v.sku === variation.sku || v.barcode === variation.sku,
      );
      if (!localVariant) continue;
      await tx.productVariant.update({
        where: { id: localVariant.id },
        data: {
          wooVariantId: variation.id,
          wooSyncStatus: 'SYNCED',
          wooLastSyncAt: new Date(),
        },
      });
    }
  }
}
