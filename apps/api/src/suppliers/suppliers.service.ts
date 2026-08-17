import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { FindSuppliersQueryDto } from './dto/find-suppliers-query.dto';

@Injectable()
export class SuppliersService {
  findAll(tenantId: string, query: FindSuppliersQueryDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.supplier.findMany({
        where: {
          tenantId,
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { taxId: { contains: query.q } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  create(tenantId: string, dto: CreateSupplierDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.supplier.create({ data: { tenantId, ...dto } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id, tenantId } });
      if (!supplier) throw new NotFoundException('Proveedor no encontrado');
      return supplier;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.supplier.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Proveedor no encontrado');
      return tx.supplier.update({ where: { id }, data: dto });
    });
  }
}
