import { Injectable, NotFoundException } from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  type TransactionClient,
} from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { incrementStock } from '../stock/stock-mutations';
import type { StockSyncEntry } from '../woocommerce/woo-stock-sync.service';
import { EcommerceSyncService } from '../integrations/ecommerce-sync.service';
import type { CreatePurchaseDto } from './dto/create-purchase.dto';
import type { FindPurchasesQueryDto } from './dto/find-purchases-query.dto';

const MAX_PURCHASE_NUMBER_ATTEMPTS = 3;

const PURCHASE_INCLUDE = {
  items: true,
  supplier: { select: { id: true, name: true } },
  user: { select: { id: true, fullName: true } },
} satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly ecommerceSync: EcommerceSyncService,
    private readonly auditService: AuditService,
  ) {}

  // Mismo patrón de reintento que OrdersService.create: el número se
  // calcula con MAX+1 dentro de la transacción, y el
  // @@unique([tenantId, storeId, purchaseNumber]) es la red de seguridad
  // real contra dos altas concurrentes — si chocan, se reintenta con un
  // número nuevo en vez de dejar un 500 crudo.
  async create(tenantId: string, actor: AuthUser, dto: CreatePurchaseDto) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_PURCHASE_NUMBER_ATTEMPTS; attempt++) {
      try {
        const { purchase, wooSyncEntries } = await this.attemptCreate(
          tenantId,
          actor,
          dto,
        );
        // Un solo sync por compra, fuera de la transacción — no uno por
        // línea (mismo criterio que OrdersService.create).
        if (wooSyncEntries.length > 0) {
          await this.ecommerceSync.enqueueStockSync(
            tenantId,
            purchase.storeId,
            wooSyncEntries,
          );
        }
        return purchase;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async attemptCreate(
    tenantId: string,
    actor: AuthUser,
    dto: CreatePurchaseDto,
  ) {
    const wooSyncEntries: StockSyncEntry[] = [];

    const purchase = await withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');

      const supplier = await tx.supplier.findFirst({
        where: { id: dto.supplierId, tenantId },
      });
      if (!supplier) throw new NotFoundException('Proveedor no encontrado');

      let total = 0;
      const itemsData: Prisma.PurchaseItemCreateManyPurchaseInput[] = [];
      const stockTargets: {
        productId: string;
        variantId: string | null;
        quantity: number;
      }[] = [];

      for (const itemDto of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: itemDto.productId, tenantId },
        });
        if (!product)
          throw new NotFoundException(
            `Producto no encontrado: ${itemDto.productId}`,
          );

        const variant = itemDto.variantId
          ? await tx.productVariant.findFirst({
              where: { id: itemDto.variantId, tenantId, productId: product.id },
            })
          : null;
        if (itemDto.variantId && !variant)
          throw new NotFoundException('Variante no encontrada');

        const subtotal = itemDto.quantity * itemDto.unitCost;
        total += subtotal;

        itemsData.push({
          tenantId,
          productId: product.id,
          variantId: variant?.id,
          productName: product.name,
          sku: variant?.sku ?? product.sku,
          quantity: itemDto.quantity,
          unitCost: itemDto.unitCost,
          subtotal,
        });

        // Costo "último costo": se pisa con el costo unitario de esta
        // compra, en la misma transacción — ver comentario en schema.prisma
        // sobre por qué no se usa costo promedio ponderado en v1.
        if (variant) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { costPrice: itemDto.unitCost },
          });
        } else {
          await tx.product.update({
            where: { id: product.id },
            data: { costPrice: itemDto.unitCost },
          });
        }

        if (product.trackStock) {
          stockTargets.push({
            productId: product.id,
            variantId: variant?.id ?? null,
            quantity: itemDto.quantity,
          });
          wooSyncEntries.push({
            productId: variant ? null : product.id,
            variantId: variant?.id ?? null,
          });
        }
      }

      const purchaseNumber = await this.getNextPurchaseNumber(
        tx,
        tenantId,
        dto.storeId,
      );

      const created = await tx.purchase.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          supplierId: dto.supplierId,
          userId: actor.userId,
          purchaseNumber,
          invoiceNumber: dto.invoiceNumber,
          total,
          notes: dto.notes,
          items: { create: itemsData },
        },
        include: PURCHASE_INCLUDE,
      });

      for (const target of stockTargets) {
        await incrementStock(
          tx,
          tenantId,
          {
            storeId: dto.storeId,
            productId: target.productId,
            variantId: target.variantId,
          },
          target.quantity,
        );
      }

      await this.auditService.record(tx, tenantId, {
        storeId: dto.storeId,
        userId: actor.userId,
        userEmail: actor.email,
        action: 'purchase.create',
        entityType: 'Purchase',
        entityId: created.id,
        metadata: {
          purchaseNumber,
          supplierId: dto.supplierId,
          total,
          items: itemsData.length,
        },
      });

      return created;
    });

    return { purchase, wooSyncEntries };
  }

  async findAll(tenantId: string, query: FindPurchasesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return withTenantContext(tenantId, async (tx) => {
      const where: Prisma.PurchaseWhereInput = {
        tenantId,
        storeId: query.storeId,
        supplierId: query.supplierId,
        createdAt:
          query.from || query.to
            ? {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to
                  ? new Date(`${query.to}T23:59:59.999`)
                  : undefined,
              }
            : undefined,
      };

      const [total, data] = await Promise.all([
        tx.purchase.count({ where }),
        tx.purchase.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: PURCHASE_INCLUDE,
        }),
      ]);

      return { data, total, page, limit };
    });
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, tenantId },
        include: PURCHASE_INCLUDE,
      });
      if (!purchase) throw new NotFoundException('Compra no encontrada');
      return purchase;
    });
  }

  private async getNextPurchaseNumber(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
  ): Promise<number> {
    const result = await tx.purchase.aggregate({
      where: { tenantId, storeId },
      _max: { purchaseNumber: true },
    });
    return (result._max.purchaseNumber ?? 0) + 1;
  }
}
