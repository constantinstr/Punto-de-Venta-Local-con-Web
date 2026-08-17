import { Injectable } from '@nestjs/common';
import { withTenantContext, Prisma } from '@pos/database';
import { EcommerceSyncService } from '../integrations/ecommerce-sync.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { BulkPriceMode, BulkPriceUpdateDto } from './dto/bulk-price-update.dto';

const CHUNK_SIZE = 200;

export interface PriceSample {
  id: string;
  sku: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

@Injectable()
export class ProductsBulkPriceService {
  constructor(
    private readonly ecommerceSync: EcommerceSyncService,
    private readonly auditService: AuditService,
  ) {}

  async preview(
    tenantId: string,
    dto: BulkPriceUpdateDto,
  ): Promise<{ affectedCount: number; sample: PriceSample[] }> {
    return withTenantContext(tenantId, async (tx) => {
      const where: Prisma.ProductWhereInput = {
        tenantId,
        isActive: true,
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      };
      const affectedCount = await tx.product.count({ where });
      const products = await tx.product.findMany({
        where,
        select: { id: true, sku: true, name: true, price: true },
        take: 10,
        orderBy: { name: 'asc' },
      });

      const sample = products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        oldPrice: Number(p.price),
        newPrice: this.computeNewPrice(Number(p.price), dto),
      }));

      return { affectedCount, sample };
    });
  }

  async apply(
    tenantId: string,
    actor: AuthUser,
    dto: BulkPriceUpdateDto,
  ): Promise<{ updated: number }> {
    const where: Prisma.ProductWhereInput = {
      tenantId,
      isActive: true,
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
    };

    // Lote grande separado del bucle de commit: obtenemos solo los ids acá
    // (lectura rápida) y procesamos el update en chunks propios — evita
    // tener miles de productos abiertos en una sola transacción interactiva.
    const targets = await withTenantContext(tenantId, (tx) =>
      tx.product.findMany({ where, select: { id: true, price: true } }),
    );

    let updated = 0;
    const syncTargets: { productId: string; price: number }[] = [];

    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      const chunk = targets.slice(i, i + CHUNK_SIZE);
      const chunkResults = await withTenantContext(tenantId, async (tx) => {
        const results: { productId: string; price: number }[] = [];
        for (const t of chunk) {
          const newPrice = this.computeNewPrice(Number(t.price), dto);
          const product = await tx.product.update({
            where: { id: t.id },
            data: { price: newPrice },
            select: { id: true, price: true },
          });
          results.push({ productId: product.id, price: Number(product.price) });
        }
        return results;
      });
      syncTargets.push(...chunkResults);
      updated += chunkResults.length;
    }

    await this.auditService.recordStandalone(tenantId, {
      userId: actor.userId,
      userEmail: actor.email,
      action: 'product.bulk-price-update',
      entityType: 'Product',
      metadata: {
        mode: dto.mode,
        value: dto.value,
        categoryId: dto.categoryId,
        updated,
      },
    });

    // Fuera de toda transacción — mismo criterio que el resto de los sync a
    // WooCommerce en este módulo.
    for (const target of syncTargets) {
      await this.ecommerceSync.enqueuePriceSync(
        tenantId,
        target.productId,
        target.price,
      );
    }

    return { updated };
  }

  private computeNewPrice(oldPrice: number, dto: BulkPriceUpdateDto): number {
    const raw =
      dto.mode === BulkPriceMode.PERCENT
        ? oldPrice * (1 + dto.value / 100)
        : oldPrice + dto.value;
    return Math.max(0, Math.round(raw * 100) / 100);
  }
}
