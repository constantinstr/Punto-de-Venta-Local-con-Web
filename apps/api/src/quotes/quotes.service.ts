import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  type VatCondition,
  type TransactionClient,
} from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import type { CreateQuoteDto } from './dto/create-quote.dto';
import type { FindQuotesQueryDto } from './dto/find-quotes-query.dto';
import { resolveQuoteState } from './quote-state.util';

const VAT_RATE_MAP: Record<VatCondition, number> = {
  IVA_21: 21,
  IVA_10_5: 10.5,
  IVA_0: 0,
  EXENTO: 0,
  NO_GRAVADO: 0,
};

const MAX_QUOTE_NUMBER_ATTEMPTS = 3;
const DEFAULT_VALID_DAYS = 15;

export const QUOTE_INCLUDE = {
  items: true,
  user: { select: { id: true, fullName: true } },
  customer: true,
  store: {
    select: { id: true, name: true, address: true, phone: true, logoUrl: true },
  },
} satisfies Prisma.QuoteInclude;

@Injectable()
export class QuotesService {
  constructor(private readonly auditService: AuditService) {}

  // Mismo patrón de reintento que OrdersService/PurchasesService: el número
  // se calcula con MAX+1 dentro de la transacción, y el
  // @@unique([tenantId, storeId, quoteNumber]) es la red de seguridad real
  // contra dos altas concurrentes.
  async create(tenantId: string, actor: AuthUser, dto: CreateQuoteDto) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_QUOTE_NUMBER_ATTEMPTS; attempt++) {
      try {
        return await this.attemptCreate(tenantId, actor, dto);
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
    dto: CreateQuoteDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');

      if (dto.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: dto.customerId, tenantId },
        });
        if (!customer) throw new NotFoundException('Cliente no encontrado');
      }

      let subtotal = 0;
      let discountAmount = 0;
      let taxAmount = 0;
      let total = 0;
      const itemsData: Prisma.QuoteItemCreateManyQuoteInput[] = [];

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

        itemsData.push({
          tenantId,
          productId: product.id,
          variantId: variant?.id ?? null,
          productType: product.type,
          productName: product.name,
          sku: variant?.sku ?? product.sku,
          quantity: itemDto.quantity,
          unitPrice,
          vatCondition: product.vatCondition,
          taxRate: rate,
          discountAmount: lineDiscount,
          subtotal: grossLine,
          total: lineTotal,
        });
      }

      const validUntil = new Date();
      validUntil.setDate(
        validUntil.getDate() + (dto.validDays ?? DEFAULT_VALID_DAYS),
      );

      const quoteNumber = await this.getNextQuoteNumber(
        tx,
        tenantId,
        dto.storeId,
      );

      const created = await tx.quote.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          userId: actor.userId,
          customerId: dto.customerId,
          quoteNumber,
          validUntil,
          subtotal,
          discountAmount,
          taxAmount,
          total,
          notes: dto.notes,
          items: { create: itemsData },
        },
        include: QUOTE_INCLUDE,
      });

      await this.auditService.record(tx, tenantId, {
        storeId: dto.storeId,
        userId: actor.userId,
        userEmail: actor.email,
        action: 'quote.create',
        entityType: 'Quote',
        entityId: created.id,
        metadata: { quoteNumber, total, items: itemsData.length },
      });

      return created;
    });
  }

  async findAll(tenantId: string, query: FindQuotesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return withTenantContext(tenantId, async (tx) => {
      const where: Prisma.QuoteWhereInput = {
        tenantId,
        storeId: query.storeId,
        customerId: query.customerId,
        quoteNumber: query.q ? Number(query.q) || -1 : undefined,
      };

      const [total, data] = await Promise.all([
        tx.quote.count({ where }),
        tx.quote.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: QUOTE_INCLUDE,
        }),
      ]);

      return {
        data: data.map((q) => ({ ...q, state: resolveQuoteState(q) })),
        total,
        page,
        limit,
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, tenantId },
        include: QUOTE_INCLUDE,
      });
      if (!quote) throw new NotFoundException('Presupuesto no encontrado');
      return { ...quote, state: resolveQuoteState(quote) };
    });
  }

  async cancel(tenantId: string, actor: AuthUser, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id, tenantId } });
      if (!quote) throw new NotFoundException('Presupuesto no encontrado');
      if (quote.status === 'CONVERTED') {
        throw new BadRequestException(
          'Este presupuesto ya se convirtió en una venta y no se puede anular',
        );
      }
      if (quote.status === 'CANCELLED') {
        throw new BadRequestException('Este presupuesto ya está anulado');
      }

      const cancelled = await tx.quote.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: QUOTE_INCLUDE,
      });

      await this.auditService.record(tx, tenantId, {
        storeId: quote.storeId,
        userId: actor.userId,
        userEmail: actor.email,
        action: 'quote.cancel',
        entityType: 'Quote',
        entityId: quote.id,
        metadata: { quoteNumber: quote.quoteNumber },
      });

      return { ...cancelled, state: resolveQuoteState(cancelled) };
    });
  }

  private async getNextQuoteNumber(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
  ): Promise<number> {
    const result = await tx.quote.aggregate({
      where: { tenantId, storeId },
      _max: { quoteNumber: true },
    });
    return (result._max.quoteNumber ?? 0) + 1;
  }
}
