import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  ProductType,
  type TransactionClient,
} from '@pos/database';
import { getAvailableStock } from './stock-calculation';
import type { AuthUser } from '../common/types/auth-user';
import type { AdjustStockDto } from './dto/adjust-stock.dto';
import { WooStockSyncService } from '../woocommerce/woo-stock-sync.service';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly wooStockSyncService: WooStockSyncService) {}

  async findAllForStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      await this.assertStoreExists(tx, tenantId, storeId);

      const levels = await tx.stockLevel.findMany({
        where: { tenantId, storeId },
        include: { product: true, variant: { include: { product: true } } },
        orderBy: { updatedAt: 'desc' },
      });

      const trackable = levels.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        name: l.variant ? l.variant.product.name : (l.product?.name ?? ''),
        sku: l.variant?.sku ?? l.product?.sku ?? '',
        attributes: l.variant?.attributes ?? null,
        quantity: Number(l.quantity),
        reservedQuantity: Number(l.reservedQuantity),
        minAlertStock: l.minAlertStock ? Number(l.minAlertStock) : null,
        isUnlimitedStock: false,
      }));

      // Los combos no tienen fila propia en StockLevel: se listan aparte con
      // su disponibilidad calculada en tiempo real.
      const bundles = await tx.product.findMany({
        where: { tenantId, type: ProductType.BUNDLE, isActive: true },
      });
      const bundleRows = await Promise.all(
        bundles.map(async (bundle) => {
          const stock = await getAvailableStock(tx, storeId, bundle);
          return {
            productId: bundle.id,
            variantId: null,
            name: bundle.name,
            sku: bundle.sku,
            attributes: null,
            quantity: stock.quantity,
            reservedQuantity: 0,
            minAlertStock: null,
            isUnlimitedStock: stock.isUnlimited,
          };
        }),
      );

      return [...trackable, ...bundleRows];
    });
  }

  async adjust(tenantId: string, actor: AuthUser, dto: AdjustStockDto) {
    this.assertShape(dto);

    return withTenantContext(tenantId, async (tx) => {
      await this.assertStoreExists(tx, tenantId, dto.storeId);
      const target = await this.resolveTarget(tx, tenantId, dto);

      const existing = await tx.stockLevel.findFirst({
        where: {
          storeId: dto.storeId,
          productId: dto.variantId ? null : dto.productId,
          variantId: dto.variantId ?? null,
        },
      });

      const nextQuantity =
        dto.absoluteQuantity !== undefined
          ? dto.absoluteQuantity
          : Number(existing?.quantity ?? 0) + dto.delta!;

      // Prisma no permite pasar null en los campos de una clave única
      // compuesta para findUnique/upsert (NULL nunca es "igual" a NULL en
      // SQL, así que no es una forma confiable de direccionar una fila) —
      // por eso se resuelve a mano en vez de con upsert().
      const level = existing
        ? await tx.stockLevel.update({
            where: { id: existing.id },
            data: { quantity: nextQuantity },
          })
        : await tx.stockLevel.create({
            data: {
              tenantId,
              storeId: dto.storeId,
              productId: dto.variantId ? null : dto.productId,
              variantId: dto.variantId,
              quantity: nextQuantity,
            },
          });

      // Auditoría mínima (MVP): log estructurado. Una tabla de auditoría
      // persistente queda para el endurecimiento de Sprint 9.
      this.logger.log(
        `Ajuste de stock — tenant=${tenantId} store=${dto.storeId} target=${target.label} ` +
          `by=${actor.email} reason="${dto.reason}" -> quantity=${nextQuantity}`,
      );

      return level;
    }).then(async (level) => {
      // Fuera de la transacción a propósito — mismo motivo que en
      // OrdersService.create: encolar sync no puede hacer fallar el ajuste.
      await this.wooStockSyncService.enqueueStockSync(tenantId, dto.storeId, [
        {
          productId: dto.variantId ? null : dto.productId,
          variantId: dto.variantId ?? null,
        },
      ]);
      return level;
    });
  }

  private assertShape(dto: AdjustStockDto) {
    const hasProduct = Boolean(dto.productId);
    const hasVariant = Boolean(dto.variantId);
    if (hasProduct === hasVariant) {
      throw new BadRequestException(
        'Especificá exactamente uno de productId o variantId',
      );
    }

    const hasDelta = dto.delta !== undefined;
    const hasAbsolute = dto.absoluteQuantity !== undefined;
    if (hasDelta === hasAbsolute) {
      throw new BadRequestException(
        'Especificá exactamente uno de delta o absoluteQuantity',
      );
    }
  }

  private async resolveTarget(
    tx: TransactionClient,
    tenantId: string,
    dto: AdjustStockDto,
  ) {
    if (dto.variantId) {
      const variant = await tx.productVariant.findFirst({
        where: { id: dto.variantId, tenantId },
        include: { product: true },
      });
      if (!variant) throw new NotFoundException('Variante no encontrada');
      return { label: `variant:${variant.id} (${variant.product.name})` };
    }

    const product = await tx.product.findFirst({
      where: { id: dto.productId, tenantId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.type === ProductType.BUNDLE) {
      throw new BadRequestException(
        'Los combos no tienen stock propio: ajustá el stock de sus componentes individuales',
      );
    }
    return { label: `product:${product.id} (${product.name})` };
  }

  private async assertStoreExists(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
  ) {
    const store = await tx.store.findFirst({
      where: { id: storeId, tenantId },
    });
    if (!store) throw new NotFoundException('Local no encontrado');
  }
}
