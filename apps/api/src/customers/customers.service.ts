import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  findAll(tenantId: string, q?: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.customer.findMany({
        where: {
          tenantId,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { businessName: { contains: q, mode: 'insensitive' } },
                  { docNumber: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 20,
      }),
    );
  }

  create(tenantId: string, dto: CreateCustomerDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.customer.create({ data: { tenantId, ...dto } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, tenantId } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      return customer;
    });
  }
}
