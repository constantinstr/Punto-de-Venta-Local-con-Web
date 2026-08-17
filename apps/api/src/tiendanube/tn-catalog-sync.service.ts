import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import {
  TIENDANUBE_GATEWAY,
  type TiendanubeGateway,
} from './tiendanube-gateway.interface';
import { TnConfigService } from './tn-config.service';

const MAX_PAGES = 50; // tope de seguridad: 50 × 50 = 2500 productos

export interface TnCatalogSyncResult {
  vinculados: number;
  sinCoincidencia: number;
  revisados: number;
}

// Vincula el catálogo local con el de Tienda Nube por SKU.
//
// NO crea ni modifica productos: solo ata los que ya existen de los dos
// lados, guardando los ids remotos. Es deliberado — un "sincronizar catálogo"
// que además crea productos es la clase de operación que, mal disparada,
// llena la tienda online de duplicados y no hay forma cómoda de deshacerla.
// Lo que sí necesita el día a día es el vínculo, para que el stock viaje.
@Injectable()
export class TnCatalogSyncService {
  private readonly logger = new Logger(TnCatalogSyncService.name);

  constructor(
    @Inject(TIENDANUBE_GATEWAY) private readonly gateway: TiendanubeGateway,
    private readonly tnConfigService: TnConfigService,
  ) {}

  async syncCatalog(
    tenantId: string,
    storeId: string,
  ): Promise<TnCatalogSyncResult> {
    const resolved = await this.tnConfigService.getCredential(
      tenantId,
      storeId,
    );
    if (!resolved) {
      throw new NotFoundException('Este local no tiene Tienda Nube conectada');
    }

    // Se recorre TODO el catálogo remoto antes de escribir nada: paginar
    // contra su API es lento y no conviene hacerlo con una transacción
    // abierta (misma lección que la importación masiva y AFIP).
    const remoteBySku = new Map<
      string,
      { tnProductId: number; tnVariantId: number }
    >();
    let revisados = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const products = await this.gateway.listProducts(
        resolved.credential,
        page,
      );
      if (products.length === 0) break;

      for (const product of products) {
        for (const variant of product.variants) {
          revisados++;
          if (!variant.sku) continue;
          remoteBySku.set(variant.sku.trim(), {
            tnProductId: product.id,
            tnVariantId: variant.id,
          });
        }
      }
    }

    let vinculados = 0;
    let sinCoincidencia = 0;

    await withTenantContext(tenantId, async (tx) => {
      const products = await tx.product.findMany({
        where: { tenantId },
        include: { variants: true },
      });

      for (const product of products) {
        if (product.variants.length > 0) {
          for (const variant of product.variants) {
            const match = remoteBySku.get(variant.sku.trim());
            if (!match) {
              sinCoincidencia++;
              continue;
            }
            await tx.productVariant.update({
              where: { id: variant.id },
              data: match,
            });
            vinculados++;
          }
          continue;
        }

        const match = remoteBySku.get(product.sku.trim());
        if (!match) {
          sinCoincidencia++;
          continue;
        }
        await tx.product.update({ where: { id: product.id }, data: match });
        vinculados++;
      }
    });

    await this.tnConfigService.touchLastSync(tenantId, resolved.config.id);

    this.logger.log(
      `Catálogo de Tienda Nube vinculado (local=${storeId}): ${vinculados} vinculados, ${sinCoincidencia} sin coincidencia de SKU`,
    );
    return { vinculados, sinCoincidencia, revisados };
  }
}
