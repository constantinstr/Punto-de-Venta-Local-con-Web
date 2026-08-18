import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  ProductType,
  OrderStatus,
  InvoiceStatus,
  UserRole,
  type VatCondition,
  type TransactionClient,
} from '@pos/database';
import { InvoicesService } from '../invoices/invoices.service';
import {
  creditNoteTypeFor,
  CREDIT_NOTE_TYPES,
} from '../afip/invoice-type.util';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { applyAccountMovement } from '../customers/customer-account';
import {
  incrementStock,
  decrementStockGuarded,
} from '../stock/stock-mutations';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import type { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import type { StockSyncEntry } from '../woocommerce/woo-stock-sync.service';
import { EcommerceSyncService } from '../integrations/ecommerce-sync.service';
import { DiscountPolicyService } from '../discounts/discount-policy.service';

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
  customer: { select: { id: true, name: true } },
  // Plural desde que existen las notas de crédito: una orden anulada trae
  // la factura original y su NC. El front toma la primera no-NC para
  // mostrar "el comprobante" (ver shared-types Order.invoices).
  invoices: true,
  cashShift: { select: { id: true, status: true } },
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
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ecommerceSync: EcommerceSyncService,
    private readonly auditService: AuditService,
    private readonly invoicesService: InvoicesService,
    private readonly discountPolicyService: DiscountPolicyService,
  ) {}

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
        // Fuera de la transacción a propósito: encolar el sync de las
        // tiendas online nunca debe poder hacer fallar (ni demorar) una
        // venta ya confirmada — ver EcommerceSyncService.
        if (wooSyncEntries.length > 0) {
          await this.ecommerceSync.enqueueStockSync(
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

  // El tope de descuento se valida ACÁ y no solo en la pantalla: un cajero
  // con la consola del navegador abierta puede armar el POST que quiera, y un
  // control que solo vive en React no es un control.
  //
  // `limit === null` significa que ese rol no tiene tope configurado, que es
  // el estado por defecto de todo comercio (ver DiscountPolicy en el schema).
  private assertDiscountWithinLimit(
    limit: number | null,
    discount: number,
    gross: number,
    productName?: string,
  ): void {
    if (limit === null || gross <= 0 || discount <= 0) return;

    const percent = (discount / gross) * 100;
    // Tolerancia de redondeo: el front prorratea el descuento global entre
    // líneas y manda importes con dos decimales, así que un tope del 10%
    // puede llegar como 10.004% sin que nadie haya intentado nada raro.
    if (percent <= limit + AMOUNT_EPSILON) return;

    const donde = productName
      ? ` en "${productName}"`
      : ' en el total de la venta';

    // Con tope 0 el mensaje no es "te pasaste": es que ese rol directamente no
    // descuenta, y decirle "el máximo es 0%" suena a error del sistema.
    throw new BadRequestException(
      limit === 0
        ? `Tu rol no puede aplicar descuentos${donde}. Pedile a un encargado que lo autorice.`
        : `El descuento${donde} (${percent.toFixed(2)}%) supera el máximo permitido para tu rol (${limit}%). Pedile a un encargado que lo autorice.`,
    );
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

      // Chequeo temprano: barato y evita mover stock para nada si el
      // presupuesto ya no se puede convertir. El @@unique de Quote.orderId
      // es la red de seguridad real contra la carrera entre dos conversiones
      // concurrentes (ver create()); esto es solo el mensaje claro del caso
      // normal.
      if (dto.quoteId) {
        const quote = await tx.quote.findFirst({
          where: { id: dto.quoteId, tenantId },
        });
        if (!quote) throw new NotFoundException('Presupuesto no encontrado');
        if (quote.status !== 'OPEN') {
          throw new BadRequestException(
            quote.status === 'CONVERTED'
              ? 'Este presupuesto ya se convirtió en una venta'
              : 'Este presupuesto está anulado',
          );
        }
      }

      let subtotal = 0;
      let discountAmount = 0;
      let taxAmount = 0;
      let total = 0;
      const resolvedItems: ResolvedOrderItem[] = [];

      // Tope de descuento del rol que está vendiendo. Se lee una sola vez,
      // antes del bucle: es la misma política para todas las líneas.
      const maxDiscountPercent = await this.discountPolicyService.findLimitFor(
        tx,
        tenantId,
        actor.role,
      );

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
        this.assertDiscountWithinLimit(
          maxDiscountPercent,
          lineDiscount,
          grossLine,
          product.name,
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
              await decrementStockGuarded(
                tx,
                {
                  storeId: dto.storeId,
                  productId: bi.componentProductId,
                  variantId: bi.componentVariantId,
                },
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
          await decrementStockGuarded(
            tx,
            {
              storeId: dto.storeId,
              productId: product.id,
              variantId: itemDto.variantId ?? null,
            },
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

      // Además de la validación por línea: sin esto, alguien podría repartir
      // un descuento grande entre muchas líneas y quedar debajo del tope en
      // cada una pero muy por encima en el total de la venta.
      this.assertDiscountWithinLimit(
        maxDiscountPercent,
        discountAmount,
        subtotal,
      );

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

      const currentAccountTotal = dto.payments
        .filter((p) => p.method === 'CURRENT_ACCOUNT')
        .reduce((sum, p) => sum + p.amount, 0);
      if (currentAccountTotal > 0 && !dto.customerId) {
        throw new BadRequestException(
          'Una venta con pago a cuenta corriente requiere seleccionar un cliente',
        );
      }

      const orderNumber = await this.getNextOrderNumber(
        tx,
        tenantId,
        dto.storeId,
      );

      const createdOrder = await tx.order.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          cashShiftId: dto.cashShiftId,
          customerId: dto.customerId,
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

      if (dto.quoteId) {
        await tx.quote.update({
          where: { id: dto.quoteId },
          data: { status: 'CONVERTED', orderId: createdOrder.id },
        });
      }

      if (currentAccountTotal > 0) {
        await applyAccountMovement(tx, {
          tenantId,
          customerId: dto.customerId!,
          storeId: dto.storeId,
          type: 'CHARGE',
          delta: currentAccountTotal,
          orderId: createdOrder.id,
          cashShiftId: dto.cashShiftId,
          userId: actor.userId,
        });
      }

      // Solo las ventas CON descuento se auditan: registrar las 500 ventas
      // limpias del día ahogaría justamente el dato que se quiere encontrar
      // cuando aparece un faltante de caja.
      if (discountAmount > 0) {
        await this.auditService.record(tx, tenantId, {
          storeId: dto.storeId,
          userId: actor.userId,
          userEmail: actor.email,
          action: 'order.discount',
          entityType: 'Order',
          entityId: createdOrder.id,
          metadata: {
            orderNumber: createdOrder.orderNumber,
            subtotal: subtotal.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            discountPercent: ((discountAmount / subtotal) * 100).toFixed(2),
            maxAllowedPercent: maxDiscountPercent,
            lines: resolvedItems
              .filter((i) => i.discountAmount > 0)
              .map((i) => ({
                sku: i.sku,
                name: i.productName,
                gross: i.subtotal.toFixed(2),
                discount: i.discountAmount.toFixed(2),
              })),
          },
        });
      }

      return createdOrder;
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
        userId: query.userId,
        customerId: query.customerId,
        status: query.status,
        orderNumber: query.q ? Number(query.q) || -1 : undefined,
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
        tx.order.count({ where }),
        tx.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            payments: true,
            user: { select: { id: true, fullName: true } },
            customer: { select: { id: true, name: true } },
            invoices: {
              select: {
                id: true,
                invoiceType: true,
                cbteNro: true,
                cae: true,
                status: true,
              },
            },
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

  // La anulación va en TRES fases y no en una sola transacción, a propósito:
  // emitir la nota de crédito implica una ida y vuelta a AFIP (WSAA + WSFE)
  // que puede tardar segundos, y una transacción interactiva de Prisma se
  // corta a los 5s por defecto. Es exactamente lo que rompió issueFiscal en
  // su momento.
  //
  //   1. Transacción corta: cargar y validar.
  //   2. SIN transacción: pedirle la nota de crédito a AFIP (si hace falta).
  //   3. Transacción corta: reingresar stock, cancelar y auditar.
  //
  // Si AFIP rechaza la NC en la fase 2, la orden NO se cancela: quedaría una
  // venta anulada en el sistema y viva ante AFIP.
  async cancel(
    tenantId: string,
    actor: AuthUser,
    id: string,
    dto: CancelOrderDto,
  ) {
    const { fiscalInvoiceId } = await withTenantContext(
      tenantId,
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id, tenantId },
          include: { cashShift: true },
        });
        if (!order) throw new NotFoundException('Orden no encontrada');
        if (order.status === OrderStatus.CANCELLED) {
          throw new BadRequestException('La orden ya está cancelada');
        }

        // Un turno cerrado ya dejó su arqueo (expectedCash/difference)
        // congelado en columnas — computeCashSalesTotal excluye las
        // canceladas, así que anular después del cierre haría que ese arqueo
        // guardado deje de reconciliar con lo que se recalcularía hoy.
        if (order.cashShiftId && order.cashShift?.status !== 'OPEN') {
          throw new BadRequestException(
            'Esta venta pertenece a un turno de caja ya cerrado — no se puede anular',
          );
        }

        // Solo los comprobantes fiscales autorizados necesitan nota de
        // crédito. Un Ticket X (interno) o un comprobante rechazado se
        // anulan sin pasar por AFIP.
        const fiscal = await tx.invoice.findFirst({
          where: {
            orderId: order.id,
            tenantId,
            status: InvoiceStatus.ISSUED,
            invoiceType: { notIn: CREDIT_NOTE_TYPES },
          },
        });
        const necesitaNotaCredito =
          fiscal !== null && creditNoteTypeFor(fiscal.invoiceType) !== null;

        return { fiscalInvoiceId: necesitaNotaCredito ? fiscal.id : null };
      },
    );

    // Fase 2 — fuera de toda transacción. Si AFIP rechaza, issueCreditNote
    // lanza y la orden queda intacta.
    let creditNoteId: string | null = null;
    if (fiscalInvoiceId) {
      const creditNote = await this.invoicesService.issueCreditNote(
        tenantId,
        fiscalInvoiceId,
      );
      creditNoteId = creditNote.id;
      this.logger.log(
        `Nota de crédito ${creditNote.invoiceType} nº ${creditNote.cbteNro} (CAE ${creditNote.cae}) emitida para anular la orden ${id}`,
      );
    }

    return withTenantContext(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, tenantId },
        include: {
          items: { include: { bundleComponents: true, product: true } },
        },
      });
      if (!order) throw new NotFoundException('Orden no encontrada');
      // Se revalida: entre la fase 1 y esta pudo haberla cancelado otro
      // request. La NC ya emitida no se pierde — queda asociada a la factura.
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
              await incrementStock(
                tx,
                tenantId,
                {
                  storeId: order.storeId,
                  productId: bc.componentProductId,
                  variantId: bc.componentVariantId,
                },
                Number(bc.quantity),
              );
            }
          }
        } else if (item.product.trackStock) {
          await incrementStock(
            tx,
            tenantId,
            {
              storeId: order.storeId,
              productId: item.productId,
              variantId: item.variantId,
            },
            Number(item.quantity),
          );
        }
      }

      const cancelled = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
        include: ORDER_INCLUDE,
      });

      // Si la venta se cobró (total o parcialmente) a cuenta corriente,
      // revertir la deuda — nunca borrar el CHARGE original, queda como
      // historial. @@unique([orderId, type]) impide postear dos reversas.
      const charge = await tx.customerAccountMovement.findFirst({
        where: { tenantId, orderId: order.id, type: 'CHARGE' },
      });
      if (charge) {
        await applyAccountMovement(tx, {
          tenantId,
          customerId: charge.customerId,
          storeId: order.storeId,
          type: 'CHARGE_REVERSAL',
          delta: -Number(charge.amount),
          orderId: order.id,
          userId: actor.userId,
        });
      }

      await this.auditService.record(tx, tenantId, {
        storeId: order.storeId,
        userId: actor.userId,
        userEmail: actor.email,
        action: 'order.cancel',
        entityType: 'Order',
        entityId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          total: order.total.toString(),
          reason: dto.reason,
          // Queda registrado con qué comprobante fiscal se respaldó la
          // anulación (null si la venta no estaba facturada).
          creditNoteId,
        },
      });

      // NO se crea ningún CashMovement de egreso por la devolución: el
      // arqueo ya se ajusta solo, porque computeCashSalesTotal
      // (cash-shifts.service.ts) excluye las órdenes CANCELLED al calcular
      // expectedCash. Agregar además un movimiento descontaría el efectivo
      // dos veces y dejaría la caja con un faltante fantasma.
      return cancelled;
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
}
