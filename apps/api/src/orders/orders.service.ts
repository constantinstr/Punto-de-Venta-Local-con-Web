import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  ProductType,
  OrderStatus,
  UserRole,
  type VatCondition,
  type TransactionClient,
} from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import {
  WooStockSyncService,
  type StockSyncEntry,
} from '../woocommerce/woo-stock-sync.service';

const VAT_RATE_MAP: Record<VatCondition, number> = {
  IVA_21: 21,
  IVA_10_5: 10.5,
  IVA_0: 0,
  EXENTO: 0,
  NO_GRAVADO: 0,
};

const MAX_ORDER_NUMBER_ATTEMPTS = 3;
const AMOUNT_EPSILON = 0.01; // tolerancia de redondeo para comparar montos

const ORDER_INCLUDE = {
  items: { include: { bundleComponents: true } },
  payments: true,
  user: { select: { id: true, fullName: true } },
} satisfies Prisma.OrderInclude;

interface ResolvedOrderItem {
  productId: string;
  variantId: string | null;
  productType: ProductType;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  vatCondition: VatCondition;
  taxRate: number;
  discountAmount: number;
  subtotal: number;
  total: number;
  bundleComponentsData: {
    componentProductId: string;
    componentVariantId: string | null;
    componentName: string;
    quantity: number;
  }[];
}

@Injectable()
export class OrdersService {
  constructor(private readonly wooStockSyncService: WooStockSyncService) {}

  // El número de orden se calcula con MAX+1 dentro de la transacción; el
  // @@unique([tenantId, storeId, orderNumber]) es la red de seguridad real
  // contra la carrera entre dos cajas concurrentes — si chocan, la
  // transacción entera hace rollback (stock incluido) y se reintenta desde
  // cero con un número nuevo.
  async create(tenantId: string, actor: AuthUser, dto: CreateOrderDto) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      try {
        const { order, wooSyncEntries } = await this.attemptCreate(
          tenantId,
          actor,
          dto,
        );
        // Fuera de la transacción a propósito: encolar sync de WooCommerce
        // nunca debe poder hacer fallar (ni demorar) una venta ya
        // confirmada — ver WooStockSyncService.
        if (wooSyncEntries.length > 0) {
          await this.wooStockSyncService.enqueueStockSync(
            tenantId,
            order.storeId,
            wooSyncEntries,
          );
        }
        return order;
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
    dto: CreateOrderDto,
  ) {
    const wooSyncEntries: StockSyncEntry[] = [];

    const order = await withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');

      if (!dto.cashShiftId) {
        throw new BadRequestException(
          'Las ventas de mostrador requieren un turno de caja abierto',
        );
      }
      const shift = await tx.cashShift.findFirst({
        where: { id: dto.cashShiftId, tenantId, storeId: dto.storeId },
      });
      if (!shift) throw new NotFoundException('Turno de caja no encontrado');
      if (shift.status !== 'OPEN')
        throw new BadRequestException('El turno de caja no está abierto');
      if (actor.role === UserRole.CASHIER && shift.userId !== actor.userId) {
        throw new ForbiddenException('Este turno pertenece a otro cajero');
      }

      let subtotal = 0;
      let discountAmount = 0;
      let taxAmount = 0;
      let total = 0;
      const resolvedItems: ResolvedOrderItem[] = [];

      for (const itemDto of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: itemDto.productId, tenantId, isActive: true },
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

        const unitPrice = Number(variant?.price ?? product.price);
        const unitCost = Number(variant?.costPrice ?? product.costPrice);
        const grossLine = unitPrice * itemDto.quantity;
        const lineDiscount = Math.min(
          Math.max(itemDto.discountAmount ?? 0, 0),
          grossLine,
        );
        const lineTotal = grossLine - lineDiscount;
        const rate = VAT_RATE_MAP[product.vatCondition];
        const lineTax = rate > 0 ? lineTotal - lineTotal / (1 + rate / 100) : 0;

        subtotal += grossLine;
        discountAmount += lineDiscount;
        taxAmount += lineTax;
        total += lineTotal;

        const bundleComponentsData: ResolvedOrderItem['bundleComponentsData'] =
          [];

        if (product.type === ProductType.BUNDLE) {
          const bundleItems = await tx.bundleItem.findMany({
            where: { bundleProductId: product.id },
            include: { componentProduct: true, componentVariant: true },
          });
          if (bundleItems.length === 0) {
            throw new BadRequestException(
              `El combo "${product.name}" no tiene componentes configurados`,
            );
          }
          for (const bi of bundleItems) {
            const requiredQty = Number(bi.quantity) * itemDto.quantity;
            if (bi.componentProduct.trackStock) {
              await this.decrementStock(
                tx,
                dto.storeId,
                bi.componentProductId,
                bi.componentVariantId,
                requiredQty,
                bi.componentProduct.name,
              );
              // Un combo nunca tiene wooProductId propio en este diseño —
              // lo que se sincroniza hacia WooCommerce son sus componentes
              // (ver docs/woocommerce-sync.md y Sprint 7).
              wooSyncEntries.push({
                productId: bi.componentVariantId ? null : bi.componentProductId,
                variantId: bi.componentVariantId,
              });
            }
            const attrs = bi.componentVariant?.attributes as
              Record<string, string> | undefined;
            bundleComponentsData.push({
              componentProductId: bi.componentProductId,
              componentVariantId: bi.componentVariantId,
              componentName: attrs
                ? `${bi.componentProduct.name} (${Object.values(attrs).join(' / ')})`
                : bi.componentProduct.name,
              quantity: requiredQty,
            });
          }
        } else if (product.trackStock) {
          await this.decrementStock(
            tx,
            dto.storeId,
            product.id,
            itemDto.variantId ?? null,
            itemDto.quantity,
            product.name,
          );
          wooSyncEntries.push({
            productId: itemDto.variantId ? null : product.id,
            variantId: itemDto.variantId ?? null,
          });
        }

        resolvedItems.push({
          productId: product.id,
          variantId: itemDto.variantId ?? null,
          productType: product.type,
          productName: product.name,
          sku: variant?.sku ?? product.sku,
          quantity: itemDto.quantity,
          unitPrice,
          unitCost,
          vatCondition: product.vatCondition,
          taxRate: rate,
          discountAmount: lineDiscount,
          subtotal: grossLine,
          total: lineTotal,
          bundleComponentsData,
        });
      }

      const totalPaid = dto.payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPaid < total - AMOUNT_EPSILON) {
        throw new BadRequestException(
          `El pago (${totalPaid}) no cubre el total de la venta (${total})`,
        );
      }
      const hasCashPayment = dto.payments.some((p) => p.method === 'CASH');
      if (totalPaid > total + AMOUNT_EPSILON && !hasCashPayment) {
        throw new BadRequestException(
          'Solo el efectivo admite vuelto: el pago no puede superar el total',
        );
      }

      const orderNumber = await this.getNextOrderNumber(
        tx,
        tenantId,
        dto.storeId,
      );

      return tx.order.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          cashShiftId: dto.cashShiftId,
          userId: actor.userId,
          orderNumber,
          status: OrderStatus.COMPLETED,
          subtotal,
          discountAmount,
          taxAmount,
          total,
          notes: dto.notes,
          items: {
            create: resolvedItems.map((item) => ({
              tenantId,
              productId: item.productId,
              variantId: item.variantId,
              productType: item.productType,
              productName: item.productName,
              sku: item.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              vatCondition: item.vatCondition,
              taxRate: item.taxRate,
              discountAmount: item.discountAmount,
              subtotal: item.subtotal,
              total: item.total,
              bundleComponents: { create: item.bundleComponentsData },
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              tenantId,
              method: p.method,
              amount: p.amount,
              reference: p.reference,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
    });

    return { order, wooSyncEntries };
  }

  async findAll(tenantId: string, query: FindOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return withTenantContext(tenantId, async (tx) => {
      const where: Prisma.OrderWhereInput = {
        tenantId,
        storeId: query.storeId,
        cashShiftId: query.cashShiftId,
        createdAt:
          query.from || query.to
            ? {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to ? new Date(query.to) : undefined,
              }
            : undefined,
      };

      const [total, data] = await Promise.all([
        tx.order.count({ where }),
        tx.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            payments: true,
            user: { select: { id: true, fullName: true } },
          },
        }),
      ]);

      return { data, total, page, limit };
    });
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, tenantId },
        include: ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException('Orden no encontrada');
      return order;
    });
  }

  async cancel(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, tenantId },
        include: {
          items: { include: { bundleComponents: true, product: true } },
        },
      });
      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('La orden ya está cancelada');
      }

      for (const item of order.items) {
        if (item.productType === ProductType.BUNDLE) {
          for (const bc of item.bundleComponents) {
            const componentProduct = await tx.product.findFirst({
              where: { id: bc.componentProductId },
            });
            if (componentProduct?.trackStock) {
              await this.incrementStock(
                tx,
                tenantId,
                order.storeId,
                bc.componentProductId,
                bc.componentVariantId,
                Number(bc.quantity),
              );
            }
          }
        } else if (item.product.trackStock) {
          await this.incrementStock(
            tx,
            tenantId,
            order.storeId,
            item.productId,
            item.variantId,
            Number(item.quantity),
          );
        }
      }

      return tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
        include: ORDER_INCLUDE,
      });
    });
  }

  private async getNextOrderNumber(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
  ): Promise<number> {
    const result = await tx.order.aggregate({
      where: { tenantId, storeId },
      _max: { orderNumber: true },
    });
    return (result._max.orderNumber ?? 0) + 1;
  }

  // Decremento atómico con verificación de balance en la misma sentencia —
  // mismo patrón documentado en docs/ARCHITECTURE.md §3: ninguna caja
  // concurrente puede vender stock que no existe, sin locks pesimistas.
  private async decrementStock(
    tx: TransactionClient,
    storeId: string,
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    label: string,
  ) {
    const affected = await tx.$executeRaw`
      UPDATE "StockLevel"
      SET quantity = quantity - ${quantity}, "updatedAt" = now()
      WHERE "storeId" = ${storeId}
        AND "productId" IS NOT DISTINCT FROM ${variantId ? null : productId}
        AND "variantId" IS NOT DISTINCT FROM ${variantId ?? null}
        AND quantity >= ${quantity}
    `;
    if (affected === 0) {
      throw new BadRequestException(`Stock insuficiente para "${label}"`);
    }
  }

  // Reingreso de stock al cancelar — sin condición de carrera relevante
  // (sumar siempre es seguro), así que no necesita la misma atomicidad
  // condicional que el descuento.
  private async incrementStock(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
  ) {
    const existing = await tx.stockLevel.findFirst({
      where: { storeId, productId: variantId ? null : productId, variantId },
    });
    if (existing) {
      await tx.stockLevel.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await tx.stockLevel.create({
        data: {
          tenantId,
          storeId,
          productId: variantId ? null : productId,
          variantId,
          quantity,
        },
      });
    }
  }
}
