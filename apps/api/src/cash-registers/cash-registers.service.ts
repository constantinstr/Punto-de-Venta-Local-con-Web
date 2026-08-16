import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateCashRegisterDto } from './dto/create-cash-register.dto';

@Injectable()
export class CashRegistersService {
  findAll(tenantId: string, storeId?: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.cashRegister.findMany({
        where: { tenantId, storeId },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async create(tenantId: string, dto: CreateCashRegisterDto) {
    return withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');
      return tx.cashRegister.create({
        data: { tenantId, storeId: dto.storeId, name: dto.name },
      });
    });
  }
}
