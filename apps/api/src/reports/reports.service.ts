import { Injectable } from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  OrderStatus,
  CashShiftStatus,
  type TransactionClient,
} from '@pos/database';
import { parseReportRange } from './report-range.util';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto';
import type { TopProductsQueryDto } from './dto/top-products-query.dto';
import {
  computeAverageTicket,
  computeGrossMargin,
  computePaymentPercentage,
  computeVatByRate,
  round2,
  type VatBreakdownEntry,
} from './reports-math.util';

export interface SalesSummaryReport {
  from: string;
  to: string;
  grossRevenue: number;
  netRevenue: number;
  vatByRate: VatBreakdownEntry[];
  totalDiscounts: number;
  totalCost: number;
  grossMargin: number;
  averageTicket: number;
  completedCount: number;
  cancelledCount: number;
  timeSeries: { date: string; grossRevenue: number; ticketCount: number }[];
}

export interface PaymentMethodBreakdownEntry {
  method: string;
  count: number;
  total: number;
  percentage: number;
}

export interface PaymentMethodsReport {
  from: string;
  to: string;
  breakdown: PaymentMethodBreakdownEntry[];
  grandTotal: number;
}

export interface TopProductEntry {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  posUnits: number;
  onlineUnits: number;
}

export interface TopProductsReport {
  from: string;
  to: string;
  products: TopProductEntry[];
}

export interface CashShiftHistoryEntry {
  id: string;
  storeId: string;
  cashRegisterName: string;
  userFullName: string;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
}

export interface CashShiftsHistoryReport {
  from: string;
  to: string;
  shifts: CashShiftHistoryEntry[];
}

@Injectable()
export class ReportsService {
  async salesSummary(
    tenantId: string,
    dto: ReportRangeQueryDto,
  ): Promise<SalesSummaryReport> {
    const { from, to } = parseReportRange(dto.from, dto.to);

    return withTenantContext(tenantId, async (tx) => {
      const orderWhere: Prisma.OrderWhereInput = {
        tenantId,
        storeId: dto.storeId,
        createdAt: { gte: from, lte: to },
      };

      const [completedAgg, cancelledCount, vatGroups, costRow, timeSeries] =
        await Promise.all([
          tx.order.aggregate({
            where: { ...orderWhere, status: OrderStatus.COMPLETED },
            _sum: { total: true, taxAmount: true, discountAmount: true },
            _count: true,
          }),
          tx.order.count({
            where: { ...orderWhere, status: OrderStatus.CANCELLED },
          }),
          tx.orderItem.groupBy({
            by: ['taxRate'],
            where: {
              tenantId,
              order: {
                storeId: dto.storeId,
                status: OrderStatus.COMPLETED,
                createdAt: { gte: from, lte: to },
              },
            },
            _sum: { total: true },
          }),
          this.queryTotalCost(tx, tenantId, dto.storeId, from, to),
          this.queryDailyTimeSeries(tx, tenantId, dto.storeId, from, to),
        ]);

      const grossRevenue = Number(completedAgg._sum.total ?? 0);
      const taxAmount = Number(completedAgg._sum.taxAmount ?? 0);
      const totalDiscounts = Number(completedAgg._sum.discountAmount ?? 0);
      const completedCount = completedAgg._count;
      const netRevenue = round2(grossRevenue - taxAmount);
      const totalCost = round2(costRow);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        grossRevenue: round2(grossRevenue),
        netRevenue,
        vatByRate: computeVatByRate(
          vatGroups.map((g) => ({
            taxRate: Number(g.taxRate),
            sumTotal: Number(g._sum.total ?? 0),
          })),
        ),
        totalDiscounts: round2(totalDiscounts),
        totalCost,
        grossMargin: computeGrossMargin(netRevenue, totalCost),
        averageTicket: computeAverageTicket(grossRevenue, completedCount),
        completedCount,
        cancelledCount,
        timeSeries,
      };
    });
  }

  async paymentMethods(
    tenantId: string,
    dto: ReportRangeQueryDto,
  ): Promise<PaymentMethodsReport> {
    const { from, to } = parseReportRange(dto.from, dto.to);

    return withTenantContext(tenantId, async (tx) => {
      const groups = await tx.payment.groupBy({
        by: ['method'],
        where: {
          tenantId,
          order: {
            storeId: dto.storeId,
            status: OrderStatus.COMPLETED,
            createdAt: { gte: from, lte: to },
          },
        },
        _sum: { amount: true },
        _count: true,
      });

      const grandTotal = round2(
        groups.reduce((sum, g) => sum + Number(g._sum.amount ?? 0), 0),
      );

      const breakdown = groups
        .map((g) => {
          const total = round2(Number(g._sum.amount ?? 0));
          return {
            method: g.method,
            count: g._count,
            total,
            percentage: computePaymentPercentage(total, grandTotal),
          };
        })
        .sort((a, b) => b.total - a.total);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        breakdown,
        grandTotal,
      };
    });
  }

  async topProducts(
    tenantId: string,
    dto: TopProductsQueryDto,
  ): Promise<TopProductsReport> {
    const { from, to } = parseReportRange(dto.from, dto.to);
    const limit = dto.limit ?? 10;

    return withTenantContext(tenantId, async (tx) => {
      const baseWhere = {
        tenantId,
        order: {
          storeId: dto.storeId,
          status: OrderStatus.COMPLETED,
          createdAt: { gte: from, lte: to },
        },
      } satisfies Prisma.OrderItemWhereInput;

      const [overall, posGroups, onlineGroups, costRows] = await Promise.all([
        tx.orderItem.groupBy({
          by: ['productId', 'variantId'],
          where: baseWhere,
          _sum: { quantity: true, total: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: limit,
        }),
        tx.orderItem.groupBy({
          by: ['productId', 'variantId'],
          where: { ...baseWhere, order: { ...baseWhere.order, source: 'POS' } },
          _sum: { quantity: true },
        }),
        tx.orderItem.groupBy({
          by: ['productId', 'variantId'],
          where: {
            ...baseWhere,
            order: { ...baseWhere.order, source: 'ONLINE' },
          },
          _sum: { quantity: true },
        }),
        this.queryCostByProduct(tx, tenantId, dto.storeId, from, to),
      ]);

      const key = (productId: string, variantId: string | null) =>
        `${productId}:${variantId ?? ''}`;
      const posMap = new Map(
        posGroups.map((g) => [
          key(g.productId, g.variantId),
          Number(g._sum.quantity ?? 0),
        ]),
      );
      const onlineMap = new Map(
        onlineGroups.map((g) => [
          key(g.productId, g.variantId),
          Number(g._sum.quantity ?? 0),
        ]),
      );
      const costMap = new Map(
        costRows.map((r) => [key(r.productId, r.variantId), r.cost]),
      );

      const productIds = [...new Set(overall.map((g) => g.productId))];
      const variantIds = [
        ...new Set(
          overall
            .map((g) => g.variantId)
            .filter((v): v is string => Boolean(v)),
        ),
      ];
      const [products, variants] = await Promise.all([
        tx.product.findMany({ where: { id: { in: productIds }, tenantId } }),
        tx.productVariant.findMany({
          where: { id: { in: variantIds }, tenantId },
          include: { product: true },
        }),
      ]);
      const productById = new Map(products.map((p) => [p.id, p]));
      const variantById = new Map(variants.map((v) => [v.id, v]));

      const entries: TopProductEntry[] = overall.map((g) => {
        const variant = g.variantId ? variantById.get(g.variantId) : undefined;
        const product = variant?.product ?? productById.get(g.productId);
        const k = key(g.productId, g.variantId);
        // Badge de margen por producto: revenue acá es el total con IVA
        // incluido (no neto como en SalesSummaryReport.grossMargin) — es un
        // indicador relativo entre productos para el ranking, no la cifra
        // de margen consolidada del negocio.
        const revenue = round2(Number(g._sum.total ?? 0));
        const cost = round2(costMap.get(k) ?? 0);
        return {
          productId: g.productId,
          variantId: g.variantId,
          name: product?.name ?? '(producto eliminado)',
          sku: variant?.sku ?? product?.sku ?? '',
          unitsSold: Number(g._sum.quantity ?? 0),
          revenue,
          cost,
          margin: round2(revenue - cost),
          posUnits: posMap.get(k) ?? 0,
          onlineUnits: onlineMap.get(k) ?? 0,
        };
      });

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        products: entries,
      };
    });
  }

  async cashShiftsHistory(
    tenantId: string,
    dto: ReportRangeQueryDto,
  ): Promise<CashShiftsHistoryReport> {
    const { from, to } = parseReportRange(dto.from, dto.to);

    return withTenantContext(tenantId, async (tx) => {
      const shifts = await tx.cashShift.findMany({
        where: {
          tenantId,
          storeId: dto.storeId,
          status: CashShiftStatus.CLOSED,
          closedAt: { gte: from, lte: to },
        },
        include: {
          cashRegister: true,
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { closedAt: 'desc' },
      });

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        shifts: shifts.map((s) => ({
          id: s.id,
          storeId: s.storeId,
          cashRegisterName: s.cashRegister.name,
          userFullName: s.user.fullName,
          openedAt: s.openedAt.toISOString(),
          closedAt: s.closedAt?.toISOString() ?? null,
          initialAmount: Number(s.initialAmount),
          expectedCash: s.expectedCash !== null ? Number(s.expectedCash) : null,
          actualCash: s.actualCash !== null ? Number(s.actualCash) : null,
          difference: s.difference !== null ? Number(s.difference) : null,
        })),
      };
    });
  }

  // SUM(quantity * unitCost) no es expresable con el aggregate/groupBy
  // tipado de Prisma (solo suma columnas, no productos entre columnas) —
  // única consulta de este servicio que necesita SQL crudo. Corre dentro de
  // la misma tx con `app.tenant_id` seteado (RLS activa) y además filtra
  // tenantId explícito, igual que el resto del código de este proyecto.
  private async queryTotalCost(
    tx: TransactionClient,
    tenantId: string,
    storeId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ cmv: number | null }[]>`
      SELECT SUM(oi.quantity * oi."unitCost")::float as cmv
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE oi."tenantId" = ${tenantId}
        AND o.status = 'COMPLETED'
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND (${storeId ?? null}::text IS NULL OR o."storeId" = ${storeId ?? null})
    `;
    return rows[0]?.cmv ?? 0;
  }

  // Mismo motivo que queryTotalCost, pero agrupado por producto/variante
  // para el badge de margen de top-products.
  private async queryCostByProduct(
    tx: TransactionClient,
    tenantId: string,
    storeId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<{ productId: string; variantId: string | null; cost: number }[]> {
    return tx.$queryRaw<
      { productId: string; variantId: string | null; cost: number }[]
    >`
      SELECT oi."productId" as "productId", oi."variantId" as "variantId",
             SUM(oi.quantity * oi."unitCost")::float as cost
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE oi."tenantId" = ${tenantId}
        AND o.status = 'COMPLETED'
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND (${storeId ?? null}::text IS NULL OR o."storeId" = ${storeId ?? null})
      GROUP BY oi."productId", oi."variantId"
    `;
  }

  private async queryDailyTimeSeries(
    tx: TransactionClient,
    tenantId: string,
    storeId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<{ date: string; grossRevenue: number; ticketCount: number }[]> {
    const rows = await tx.$queryRaw<
      { day: Date; gross: number | null; cnt: bigint }[]
    >`
      SELECT date_trunc('day', o."createdAt") as day,
             SUM(o.total)::float as gross,
             COUNT(*) as cnt
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = 'COMPLETED'
        AND o."createdAt" >= ${from}
        AND o."createdAt" <= ${to}
        AND (${storeId ?? null}::text IS NULL OR o."storeId" = ${storeId ?? null})
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      grossRevenue: round2(r.gross ?? 0),
      ticketCount: Number(r.cnt),
    }));
  }
}
